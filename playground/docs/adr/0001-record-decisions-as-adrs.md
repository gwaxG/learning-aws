# 0001. Record decisions as ADRs
Date: 2026-10-25
Status: Accepted

## Context
The playground is for learning Pulumi and AWS together. Choices (why this service, why this size) are the learning material and are easy to forget.

## Decision
Every non-trivial implementation decision gets a short ADR in `playground/docs/adr/`, written at the time it is made, and linked from the table in `README.md`.

## Consequences
Small overhead per decision; the reasoning and rejected alternatives stay visible. Superseding is done with a new ADR, not an edit.
