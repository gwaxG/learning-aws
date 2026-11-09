# 0004. Three-tier AWS architecture and cost estimate
Date: 2026-10-25
Status: Accepted

## Context
Deploy the app from [0003](0003-three-tier-app-stack.md) to AWS with Pulumi, region `eu-west-1`, as a short-lived playground (create, learn, `pulumi destroy`). Goal: a recognisable three-tier layout at the lowest sensible cost, with no NAT Gateway.

## Decision
```
Browser ──HTTPS──> CloudFront ──/*──────> S3 (private, OAC)               presentation tier
                       └──────/api/*───> ALB (HTTP :80) ──> ECS Fargate   application tier
                                                              │ :5432
                                                         RDS PostgreSQL   data tier (private subnets)
```
| Piece | Choice | Why |
|---|---|---|
| Network | 1 VPC, 2 AZs; 2 public subnets (ALB + Fargate task), 2 private subnets (RDS only) | ALB needs 2 AZs; RDS subnet group needs 2 AZs |
| Outbound access for the task | Public IP on the Fargate task, **no NAT** | NAT Gateway is ~$33/month + data; a public IP is ~$3.7/month. The task SG still only accepts traffic from the ALB |
| Front end | S3 + CloudFront (Origin Access Control), SPA fallback to `index.html`, price class 100 | Static site, HTTPS for free on `*.cloudfront.net` |
| API routing | CloudFront behavior `/api/*` to the ALB, caching disabled, all viewer headers forwarded | Same origin for browser and API: no CORS, one URL |
| ALB exposure | ALB security group allows port 80 only from the CloudFront origin-facing managed prefix list | Keeps random internet traffic off the ALB. CloudFront to ALB is plain HTTP (no custom domain/ACM cert in the playground) |
| Compute | ECS Fargate, 0.25 vCPU / 0.5 GB, desired count 1, image in ECR built by Pulumi (`pulumi-docker-build`) | No servers to patch; smallest size |
| Database | RDS PostgreSQL 16, `db.t4g.micro`, 20 GB gp3, single-AZ, encrypted, not public | Cheapest managed Postgres; Multi-AZ would double the cost |
| Secrets | One Secrets Manager secret (`DATABASE_URL`, `JWT_SECRET`) injected into the task by the execution role; Pulumi config values are `--secret` | No plaintext in task definition or code |
| Migrations / seed | Container runs `alembic upgrade head` on start; users are created by a one-off `aws ecs run-task` with a command override | Simple for a single task. With more than one task, move migrations to a separate step |
| Teardown | `skip_final_snapshot`, `force_delete` on ECR, `force_destroy` on S3, no deletion protection | Playground must be destroyable in one command |

## Cost estimate (running 24/7, eu-west-1, on-demand, USD)
Prices are from memory of the public price lists and rounded. Confirm in the [AWS Pricing Calculator](https://calculator.aws/) before relying on them.

| Item | Basis | ~ $/month |
|---|---|---|
| ALB | $0.0252/h + minimal LCU | 19.5 |
| Fargate task | 0.25 vCPU x $0.0466/h + 0.5 GB x $0.0051/h = $0.0142/h | 10.4 |
| RDS `db.t4g.micro` | ~$0.018/h | 13.1 |
| RDS storage | 20 GB gp3 | 2.7 |
| Public IPv4 addresses | 3 x $0.005/h (2 for ALB, 1 for the task) | 11.0 |
| Secrets Manager | 1 secret | 0.4 |
| CloudWatch Logs, ECR | a few MB | 0.6 |
| S3 + CloudFront | tiny traffic, within free tier | 0.5 |
| **Total** | | **~58** |

About **$0.08/hour, $1.9/day**. A 3-hour session that ends with `pulumi destroy` costs roughly **$0.25**. The expensive items are the ALB, public IPv4 addresses and RDS, all billed per hour while they exist.

Cheaper variants considered, not chosen:
- Drop the ALB (CloudFront cannot target a changing Fargate IP; would need App Runner or API Gateway + VPC link): saves ~$25 but changes the architecture being learned.
- Fargate on ARM64 (Graviton): ~20% cheaper compute, but cross-building images on Windows needs emulation.
- NAT Gateway for a fully private task: +~$33/month.

## Consequences
- Always `pulumi destroy` after a session; leaving it up for a month costs about $58.
- Traffic between CloudFront and the ALB is unencrypted and the ALB is reachable by any CloudFront distribution (the prefix list is not per-distribution). Acceptable for a playground; production would add HTTPS on the ALB and a secret origin header.
- Fargate task has a public IP; its security group is the only barrier.
- A single task and single-AZ database mean no high availability.
