# 0005. CloudWatch monitoring
Date: 2026-10-25
Status: Accepted

## Context
[0004](0004-three-tier-aws-architecture-and-cost.md) only collected container logs (log group, 7-day retention). To learn CloudWatch and see how the three tiers behave, add metrics, alarms and a dashboard.

## Decision
| Piece | Choice | Why |
|---|---|---|
| ECS Container Insights | enabled on the cluster, switch `containerInsights` (default `true`) | Task-level CPU/memory/network metrics; the one non-free item, so it can be turned off |
| Alarms (6, standard, 60 s periods) | ALB target 5xx, unhealthy hosts, ECS CPU and memory > 80%, RDS CPU > 80%, RDS free storage < 2 GiB | One or two signals per tier; each is a failure you would otherwise find out about from a user |
| Notifications | SNS topic `alarms`; optional email subscription via `alarmEmail` config | Email needs a confirmation click; without it alarms still change state, visible in the console |
| Dashboard | One, "three-tier-<stack>", 9 widgets (ALB, ECS, RDS) | First 3 dashboards per account are free |
| Missing data | `notBreaching` | An idle playground has no ALB metrics; that is not an incident |
| Not added | RDS Enhanced Monitoring, Performance Insights, ALB access logs, X-Ray | Extra IAM role / S3 bucket / cost for little learning value right now |

## Cost estimate (eu-west-1, USD, 24/7)
Rounded, from memory of the public price lists; verify with the [AWS Pricing Calculator](https://calculator.aws/) and the [CloudWatch pricing page](https://aws.amazon.com/cloudwatch/pricing/).

| Item | Basis | ~ $/month |
|---|---|---|
| Container Insights | custom metrics for cluster, service and 1 task (~$0.30 per metric) + performance log ingestion | 6.0 (range 3 to 8) |
| Alarms | 6 x $0.10 | 0.6 |
| Dashboard | first 3 free | 0 |
| SNS email | first 1,000 notifications free | 0 |
| Built-in metrics (ALB, ECS, RDS) | free | 0 |
| **Added by this ADR** | | **~6.6** |

New total: ~$58 (ADR 0004) + ~$6.6 = **~$65/month, about $0.09/hour**. With `pulumi config set containerInsights false` the addition drops to ~$0.6 (total ~$59).

## Consequences
- Container Insights is about 10% of the bill for a single tiny task; turn it off if the cost is not worth the detail, or keep it for a session to see what it shows.
- Alarms on a `db.t4g.micro` CPU can fire when burst credits run out, which is useful to learn from.
- Alarms and dashboard are destroyed with the stack; metric history stays in CloudWatch only for the retention AWS applies to deleted resources (not relevant for the playground).
