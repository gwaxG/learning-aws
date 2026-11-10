"""Unit tests with Pulumi mocks: no AWS account needed. https://www.pulumi.com/docs/iac/concepts/testing/unit/"""
import tempfile
from pathlib import Path

import pulumi

SITE = Path(tempfile.mkdtemp())
for rel, body in {
    "index.html": "<html></html>",
    "css/styles.css": "a{}",
    "js/app.js": "1",
    "content/manifest.json": "{}",
    "content/hub/index.json": "{}",
    "content/hub/docs/u-1.json": "{}",  # must NOT be published
    "book/saa-c03-book.html": "<html></html>",
    "book/src/00.html": "x",  # must NOT be published
    "scripts/x.mjs": "x",  # must NOT be published
}.items():
    p = SITE / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body)


class Mocks(pulumi.runtime.Mocks):
    created: list = []

    def new_resource(self, args: pulumi.runtime.MockResourceArgs):
        Mocks.created.append((args.typ, args.name, dict(args.inputs)))
        outputs = dict(args.inputs)
        outputs.setdefault("arn", f"arn:aws:mock:::{args.name}")
        outputs.setdefault("bucketRegionalDomainName", f"{args.name}.s3.mock")
        outputs.setdefault("bucket", args.name)
        outputs.setdefault("domainName", f"{args.name}.cloudfront.mock")
        outputs.setdefault("hostedZoneId", "Z2FDTNDATAQYW2")
        outputs.setdefault("fqdn", f"{args.name}.mock.")
        outputs.setdefault("certificateArn", "arn:aws:acm:us-east-1:1:certificate/mock")
        if args.typ == "aws:acm/certificate:Certificate":
            outputs["domainValidationOptions"] = [
                {"resourceRecordName": "_x.example.com.", "resourceRecordType": "CNAME", "resourceRecordValue": "_y.acm.mock."}
            ]
        return f"{args.name}-id", outputs

    def call(self, args: pulumi.runtime.MockCallArgs):
        if args.token == "aws:route53/getZone:getZone":
            return {"zoneId": "ZMOCK", "name": args.args["name"]}
        if args.token == "aws:cloudfront/getCachePolicy:getCachePolicy":
            return {"id": "cache-policy-id"}
        return {}


pulumi.runtime.set_mocks(Mocks(), project="learning-aws", stack="test", preview=False)
pulumi.runtime.set_all_config(
    {
        "learning-aws:domain": "aws.example.com",
        "learning-aws:siteDir": str(SITE),
        "learning-aws:basicAuth": "me:secret",
    },
    ["learning-aws:basicAuth"],
)

import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("infra", Path(__file__).resolve().parents[1] / "__main__.py")
infra = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(infra)


def test_only_site_files_are_uploaded():
    assert sorted(infra.files) == [
        "book/saa-c03-book.html", "content/hub/index.json", "content/manifest.json", "css/styles.css", "index.html", "js/app.js",
    ]
    assert len(infra.site_objects) == len(infra.files)


@pulumi.runtime.test
def test_bucket_is_private():
    def check(args):
        assert all(args)

    b = infra.public_access_block
    return pulumi.Output.all(b.block_public_acls, b.block_public_policy, b.ignore_public_acls, b.restrict_public_buckets).apply(check)


@pulumi.runtime.test
def test_distribution_uses_domain_https_oac_and_auth():
    def check(args):
        aliases, behavior, origins = args
        assert aliases == ["aws.example.com"]
        assert behavior["viewer_protocol_policy"] == "redirect-to-https"
        assert origins[0]["origin_access_control_id"]
        assert behavior["function_associations"][0]["event_type"] == "viewer-request"

    d = infra.distribution
    return pulumi.Output.all(d.aliases, d.default_cache_behavior, d.origins).apply(check)


@pulumi.runtime.test
def test_certificate_is_dns_validated_and_aliases_exist():
    def check(method):
        assert method == "DNS"
        assert len(infra.dns_records) == 2  # A + AAAA

    return infra.cert.validation_method.apply(check)


@pulumi.runtime.test
def test_alias_records_point_at_cloudfront():
    def check(types):
        assert sorted(types) == ["A", "AAAA"]

    return pulumi.Output.all(*[r.type for r in infra.dns_records]).apply(check)
