"""Static site on AWS: private S3 bucket + CloudFront (OAC) + ACM certificate + Route 53 records.

The site is the ../site folder (index.html, css/, js/, content/, book/saa-c03-book.html). Nothing else is uploaded.

How it works
- S3 holds the files; the bucket is private. CloudFront reads it through Origin Access Control (OAC).
- ACM certificates for CloudFront MUST live in us-east-1, so that resource uses a second provider.
- Route 53 holds the DNS: validation records for the certificate and A/AAAA alias records to CloudFront.
- Every object has `Cache-Control: no-cache` (the files are not content-hashed). CloudFront still caches them for a
  second and then revalidates with the S3 ETag, so a deploy shows up immediately and no invalidation is needed.

Config (pulumi config set ...)
  domain      site host name, e.g. aws.example.com. Omit it to deploy on the *.cloudfront.net name only.
  zoneName    Route 53 hosted zone that contains `domain` (default: last two labels of domain).
  createZone  "true" to create the hosted zone instead of looking up an existing one (then point the registrar's
              name servers at the `name_servers` output).
  basicAuth   optional secret "user:password": adds HTTP basic auth in front of the whole site (a CloudFront
              Function). Recommended: the site contains your practice questions.
  siteDir     folder to publish (default ../site).
"""
import base64
import json
import mimetypes
from pathlib import Path

import pulumi
import pulumi_aws as aws

HERE = Path(__file__).resolve().parent
cfg = pulumi.Config()
domain = cfg.get("domain")
zone_name = cfg.get("zoneName") or (".".join(domain.split(".")[-2:]) if domain else None)
create_zone = cfg.get_bool("createZone") or False
basic_auth = cfg.get_secret("basicAuth") if cfg.get("basicAuth") else None  # empty = no auth
SITE_DIR = (HERE / (cfg.get("siteDir") or "../site")).resolve()

# What to publish. Paths are relative to SITE_DIR; anything not matched is never uploaded.
PUBLISH_DIRS = ("css", "js", "content")
PUBLISH_FILES = ("index.html", "book/saa-c03-book.html")
SKIP_PREFIXES = ("content/hub/docs/",)  # source cards; the app reads the generated content/hub/index.json only


def site_files():
    out = []
    for rel in PUBLISH_FILES:
        if (SITE_DIR / rel).is_file():
            out.append(rel)
    for d in PUBLISH_DIRS:
        for p in sorted((SITE_DIR / d).rglob("*")):
            rel = p.relative_to(SITE_DIR).as_posix()
            if p.is_file() and not rel.startswith(SKIP_PREFIXES):
                out.append(rel)
    return out


files = site_files()
if "index.html" not in files:
    raise Exception(f"{SITE_DIR}/index.html not found: check the siteDir config")

# ================================================================== storage (S3, private)
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketv2/
bucket = aws.s3.BucketV2("site", force_destroy=True)

public_access_block = aws.s3.BucketPublicAccessBlock(
    "site-block",
    bucket=bucket.id,
    block_public_acls=True,
    block_public_policy=True,
    ignore_public_acls=True,
    restrict_public_buckets=True,
)

TEXT_TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml"}
site_objects = []
for rel in files:
    suffix = Path(rel).suffix
    ctype = TEXT_TYPES.get(suffix) or mimetypes.guess_type(rel)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in ("application/json", "image/svg+xml"):
        ctype += "; charset=utf-8"
    obj = aws.s3.BucketObjectv2(
        f"site-{rel}",
        bucket=bucket.id,
        key=rel,
        source=pulumi.FileAsset(str(SITE_DIR / rel)),  # tracked by content hash: only changed files are re-uploaded
        content_type=ctype,
        cache_control="no-cache",
    )
    site_objects.append(obj)

# ================================================================== DNS + certificate (only with a domain)
aliases = []
certificate_arn = None
zone = None
cert = None
dns_records = []
if domain:
    if create_zone:
        zone = aws.route53.Zone("zone", name=zone_name)
        zone_id, name_servers = zone.zone_id, zone.name_servers
    else:
        zone_id = aws.route53.get_zone(name=zone_name, private_zone=False).zone_id
        name_servers = None

    us_east_1 = aws.Provider("us-east-1", region="us-east-1")  # CloudFront only accepts certificates from us-east-1
    cert = aws.acm.Certificate(
        "cert", domain_name=domain, validation_method="DNS", opts=pulumi.ResourceOptions(provider=us_east_1)
    )
    dvo = cert.domain_validation_options[0]
    validation_record = aws.route53.Record(
        "cert-validation",
        zone_id=zone_id,
        name=dvo.resource_record_name,
        type=dvo.resource_record_type,
        records=[dvo.resource_record_value],
        ttl=60,
        allow_overwrite=True,
    )
    cert_valid = aws.acm.CertificateValidation(
        "cert-valid",
        certificate_arn=cert.arn,
        validation_record_fqdns=[validation_record.fqdn],
        opts=pulumi.ResourceOptions(provider=us_east_1),
    )
    certificate_arn = cert_valid.certificate_arn  # waits until the certificate is issued
    aliases = [domain]

# ================================================================== CDN (CloudFront)
oac = aws.cloudfront.OriginAccessControl(
    "oac",
    origin_access_control_origin_type="s3",
    signing_behavior="always",
    signing_protocol="sigv4",
)

# Optional HTTP basic auth, evaluated at the edge before anything is served.
function_associations = []
if basic_auth is not None:
    token = basic_auth.apply(lambda v: base64.b64encode(v.encode()).decode())
    auth_code = token.apply(
        lambda t: (
            "function handler(event) {\n"
            "  var h = event.request.headers;\n"
            f"  if (h.authorization && h.authorization.value === 'Basic {t}') return event.request;\n"
            "  return { statusCode: 401, statusDescription: 'Unauthorized',\n"
            "    headers: { 'www-authenticate': { value: 'Basic realm=\"learning-aws\"' } } };\n"
            "}\n"
        )
    )
    auth_fn = aws.cloudfront.Function("basic-auth", runtime="cloudfront-js-2.0", publish=True, code=auth_code)
    function_associations = [
        aws.cloudfront.DistributionDefaultCacheBehaviorFunctionAssociationArgs(
            event_type="viewer-request", function_arn=auth_fn.arn
        )
    ]

caching_optimized = aws.cloudfront.get_cache_policy(name="Managed-CachingOptimized")

distribution = aws.cloudfront.Distribution(
    "cdn",
    enabled=True,
    comment="learning-aws static site",
    default_root_object="index.html",
    aliases=aliases,
    price_class="PriceClass_100",  # EU and North America edges: cheapest
    http_version="http2and3",
    is_ipv6_enabled=True,
    origins=[
        aws.cloudfront.DistributionOriginArgs(
            origin_id="s3",
            domain_name=bucket.bucket_regional_domain_name,
            origin_access_control_id=oac.id,
        )
    ],
    default_cache_behavior=aws.cloudfront.DistributionDefaultCacheBehaviorArgs(
        target_origin_id="s3",
        viewer_protocol_policy="redirect-to-https",
        allowed_methods=["GET", "HEAD", "OPTIONS"],
        cached_methods=["GET", "HEAD"],
        compress=True,
        cache_policy_id=caching_optimized.id,
        function_associations=function_associations,
    ),
    # A private bucket answers 403 for a missing key; show it as a plain 404.
    custom_error_responses=[
        aws.cloudfront.DistributionCustomErrorResponseArgs(error_code=403, response_code=404, response_page_path="/index.html", error_caching_min_ttl=10)
    ],
    restrictions=aws.cloudfront.DistributionRestrictionsArgs(
        geo_restriction=aws.cloudfront.DistributionRestrictionsGeoRestrictionArgs(restriction_type="none")
    ),
    viewer_certificate=(
        aws.cloudfront.DistributionViewerCertificateArgs(
            acm_certificate_arn=certificate_arn, ssl_support_method="sni-only", minimum_protocol_version="TLSv1.2_2021"
        )
        if certificate_arn is not None
        else aws.cloudfront.DistributionViewerCertificateArgs(cloudfront_default_certificate=True)
    ),
)

# Only this distribution may read the bucket (OAC + SourceArn condition).
aws.s3.BucketPolicy(
    "site-policy",
    bucket=bucket.id,
    policy=pulumi.Output.json_dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "AllowCloudFrontRead",
                    "Effect": "Allow",
                    "Principal": {"Service": "cloudfront.amazonaws.com"},
                    "Action": "s3:GetObject",
                    "Resource": pulumi.Output.concat(bucket.arn, "/*"),
                    "Condition": {"StringEquals": {"AWS:SourceArn": distribution.arn}},
                }
            ],
        }
    ),
)

# ================================================================== Route 53 alias records -> CloudFront
if domain:
    for record_type in ("A", "AAAA"):
        dns_records.append(aws.route53.Record(
            f"alias-{record_type}",
            zone_id=zone_id,
            name=domain,
            type=record_type,
            aliases=[
                aws.route53.RecordAliasArgs(
                    name=distribution.domain_name,
                    zone_id=distribution.hosted_zone_id,
                    evaluate_target_health=False,
                )
            ],
        ))

pulumi.export("url", f"https://{domain}" if domain else pulumi.Output.concat("https://", distribution.domain_name))
pulumi.export("cloudfront_domain", distribution.domain_name)
pulumi.export("distribution_id", distribution.id)
pulumi.export("bucket", bucket.bucket)
pulumi.export("files", len(files))
if domain and create_zone:
    pulumi.export("name_servers", name_servers)
