# Architecture Decision Records

Implementation decisions for everything under `playground/`. One file per decision: `NNNN-short-title.md`.
Never rewrite history: when a decision changes, add a new ADR and set the old one to `Superseded by NNNN`.

Template:

```
# NNNN. Title
Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by NNNN

## Context
## Decision
## Consequences
```

| # | Title | Status |
|---|-------|--------|
| [0001](0001-record-decisions-as-adrs.md) | Record decisions as ADRs | Accepted |
| [0002](0002-pulumi-with-python.md) | Pulumi with Python for infrastructure | Accepted |
| [0003](0003-three-tier-app-stack.md) | Three-tier app stack | Accepted |
| [0004](0004-three-tier-aws-architecture-and-cost.md) | Three-tier AWS architecture and cost estimate | Accepted |
| [0005](0005-cloudwatch-monitoring.md) | CloudWatch monitoring (Container Insights, alarms, dashboard) | Accepted |
| [0006](0006-github-actions-pulumi-deploy.md) | Deploy three-tier with GitHub Actions and Pulumi | Accepted |
