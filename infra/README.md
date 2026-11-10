# infra: learning-aws on AWS (Pulumi, Python)

Publishes `../site` as a static site: private S3 bucket, CloudFront (OAC, HTTPS, HTTP/3), ACM certificate in us-east-1,
Route 53 records. Only `index.html`, `css/`, `js/`, `content/` (without `content/hub/docs/`, the generated
`content/hub/index.json` is enough) and `book/saa-c03-book.html` are uploaded.

## Deploy by hand
```bash
cd infra
pulumi login                               # Pulumi Cloud, or: pulumi login s3://my-state-bucket
pulumi stack init prod
pulumi config set domain aws.example.com   # omit to get only the *.cloudfront.net URL
pulumi config set zoneName example.com     # existing Route 53 hosted zone (default: last two labels of domain)
pulumi config set --secret basicAuth 'me:a-long-password'   # optional, recommended: the site holds your practice questions
pulumi preview
pulumi up
pulumi stack output url
```
No hosted zone yet? `pulumi config set createZone true`, then point the registrar's name servers at the
`name_servers` output (first `pulumi up` waits for certificate validation, so do the NS change while it runs).

Tests (no AWS needed): `uv run --python 3.12 pytest`.
Update the site: change files in `../site`, run `pulumi up`; only changed files are uploaded. Tear down: `pulumi destroy`.
Cost: a few cents per month (S3 + CloudFront at this traffic, Route 53 zone $0.50).

## Deploy from GitHub Actions (`.github/workflows/learning-aws-deploy.yml`)
| Event | What runs |
|-------|-----------|
| pull request touching `site/**` or `infra/**` | site tests, infra tests, `pulumi preview` |
| merge/push to `main` or `master` | the same tests, then `pulumi up` |
| manual (workflow_dispatch) | tests, then `pulumi up` |

Nothing reaches AWS until `DEPLOY_ENABLED=true` is set. One-time setup:
1. AWS: create the IAM OIDC provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`) and a role trusted by
   `repo:gwaxG/learning-aws:ref:refs/heads/main`, `...:ref:refs/heads/master`, `...:pull_request`, `...:environment:prod`
   (`StringLike` on `token.actions.githubusercontent.com:sub`). Permissions: S3, CloudFront, ACM, Route 53 (admin is fine for a personal account).
2. GitHub, Settings, Secrets and variables, Actions. Secrets: `PULUMI_ACCESS_TOKEN`, optional `SITE_BASIC_AUTH` (`user:password`).
   Variables: `AWS_ROLE_ARN`, `SITE_DOMAIN`, optional `SITE_ZONE`, then `DEPLOY_ENABLED=true`.
3. Optional: Settings, Environments, `prod`: required reviewers for a manual approval before each deploy.
