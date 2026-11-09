# 0006. Deploy three-tier with GitHub Actions and Pulumi
Date: 2026-11-09
Status: Accepted

## Context
`pulumi up` was run by hand from a laptop (README, "Deploy to AWS"). We want every merge to `main`/`master` to redeploy the stack, without long-lived AWS keys in GitHub and without surprises in cost (the stack costs ~$65/month while it exists, ADR 0004).

## Decision
Workflow `.github/workflows/three-tier-deploy.yml`:

| Trigger | Jobs |
|---------|------|
| pull request touching `playground/three-tier/**` | `test`, then `preview` (`pulumi preview`, result as a PR comment) |
| push (merge) to `main` or `master` touching the same paths, or manual run | `test`, then `deploy` (`pulumi up`) |

- **Gate:** `test` builds the client and runs server tests and the Pulumi mock tests (no AWS). Deploy needs it to pass.
- **AWS auth:** GitHub OIDC. The job exchanges its OIDC token for temporary credentials of an IAM role (`vars.AWS_ROLE_ARN`). The role trusts only `repo:gwaxG/learning-aws:ref:refs/heads/main` (and `master`) plus `pull_request` for the preview. No access keys are stored.
- **State and secrets:** Pulumi Cloud backend (`PULUMI_ACCESS_TOKEN`); stack `dev`. `dbPassword` and `jwtSecret` come from GitHub secrets and are written into the stack config as Pulumi secrets by `config-map`, so state keeps them encrypted.
- **Build:** the runner builds `client/dist` (`npm ci && npm run build`); Pulumi uploads it to S3 and builds and pushes the server image to ECR (the runner has Docker). `image.ref` carries the digest, so a server change creates a new task definition and an ECS rolling deployment; a client change re-uploads only changed files (CloudFront serves `index.html` with `no-cache`).
- **Safety:** concurrency group `three-tier-pulumi-dev` (one deploy at a time, queued, never cancelled), GitHub environment `dev` (optional required reviewers), and a kill switch: nothing deploys unless the repository variable `DEPLOY_ENABLED` is `true`.

## One-time setup
1. In AWS create the OIDC identity provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`) and an IAM role with the trust policy below. For the playground attach `AdministratorAccess`; a real project would scope it to the services in `__main__.py`.
2. GitHub, Settings, Secrets and variables, Actions:
   - secrets `PULUMI_ACCESS_TOKEN` (Pulumi Cloud, Settings, Access tokens), `DB_PASSWORD`, `JWT_SECRET` (use the same values forever: changing `DB_PASSWORD` makes Pulumi change the database password);
   - variables `AWS_ROLE_ARN`, then `DEPLOY_ENABLED=true`.
3. Optional: Settings, Environments, `dev`, add yourself as required reviewer.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": [
        "repo:gwaxG/learning-aws:ref:refs/heads/main",
        "repo:gwaxG/learning-aws:ref:refs/heads/master",
        "repo:gwaxG/learning-aws:pull_request",
        "repo:gwaxG/learning-aws:environment:dev"
      ] }
    }
  }]
}
```
(When a job uses `environment: dev`, GitHub puts `environment:dev` in the token subject instead of the branch, hence the last line.)

## Consequences
Merging keeps the stack alive and billing; run `pulumi destroy` locally (or flip `DEPLOY_ENABLED` off and destroy) when done. The first deploy still needs the one-off seed task from the README. Alternative backends: an S3 bucket (`pulumi login s3://...`) with `PULUMI_CONFIG_PASSPHRASE` as a secret, which removes the Pulumi Cloud dependency but you manage the state bucket yourself.
