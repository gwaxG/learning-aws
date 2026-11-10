# CLAUDE.md
- `site/` is the AWS SAA-C03 trainer (static site). Read `site/CLAUDE.md` and run all node commands from `site/`.
- `infra/` is the Pulumi (Python) deployment of `site/` to S3 + CloudFront + Route 53. See `infra/README.md`.
- CI: `.github/workflows/learning-aws-deploy.yml`. Commit/push only when asked.
