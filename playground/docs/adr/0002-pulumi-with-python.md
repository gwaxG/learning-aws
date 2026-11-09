# 0002. Pulumi with Python for infrastructure
Date: 2026-10-25
Status: Accepted

## Context
Pulumi supports TypeScript, Python, Go, C#, Java and YAML. The backend is Python and the existing lab snippets in this repo (`content/topics/*.json`) use `pulumi_aws` in Python. Pulumi CLI 3.134 and uv are installed locally; no system Python (uv manages 3.12).

## Decision
Infrastructure code is Python (`pulumi_aws`), one project per app under `playground/<app>/pulumi`, dependencies managed by uv. Default region `eu-west-1` (matches the AWS CLI config). The local file backend or Pulumi Cloud is chosen per project when first deployed.

## Consequences
One language across server and infra; type hints give editor completion for resources. Fewer community examples than TypeScript, so the guide (`docs/pulumi.html`) links the Python API reference.
