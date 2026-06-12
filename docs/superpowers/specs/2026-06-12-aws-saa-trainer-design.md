# AWS SAA-C03 Trainer — Design Spec

Date: 2026-06-12
Status: Approved

## Goal

A personal, local, offline study trainer to pass the **AWS Certified Solutions
Architect – Associate (SAA-C03)** exam and build practical AWS + Pulumi skill.
All content is authored in-repo (no copyrighted exam questions; practice
questions are original, written in authentic SAA-C03 scenario style).

## Non-Goals

- No backend, no accounts, no network calls. Pure static site.
- No reproduction of real AWS exam questions.
- No build tooling / framework. Plain HTML/CSS/vanilla JS so it just opens.

## Architecture

Static web app. Content is data (JSON); JS is a generic renderer. Editing or
adding content never requires touching JS.

```
aws-learning/
  index.html            # app shell + navigation
  css/styles.css
  js/
    app.js              # hash router + view rendering
    quiz.js             # question rendering, answer check, scoring
    exam.js             # timed mock-exam mode + score report
    storage.js          # localStorage progress wrapper
  content/
    manifest.json       # lists topics + exams for nav
    topics/<slug>.json  # one file per topic
    exams/exam-N.json   # five mock exams
  docs/superpowers/specs/...
```

### Data flow

1. `app.js` loads `content/manifest.json` → builds nav.
2. Selecting a topic loads `content/topics/<slug>.json` and renders three
   sections: essentials, labs, questions.
3. Selecting a mock exam loads `content/exams/exam-N.json` into timed mode.
4. `storage.js` persists progress (answered questions + correctness, completed
   labs, exam attempts/scores) in `localStorage` under a versioned key.

### Progress / state

- `localStorage` key `aws-saa-trainer:v1`.
- Tracks: per-question last answer + correct flag, per-lab done flag, per-exam
  attempt history (score, per-domain breakdown, timestamp).
- A "Reset progress" action clears it.

## Content model

### manifest.json

```json
{
  "domains": [
    {"id": 1, "name": "Design Secure Architectures", "weight": 30},
    {"id": 2, "name": "Design Resilient Architectures", "weight": 26},
    {"id": 3, "name": "Design High-Performing Architectures", "weight": 24},
    {"id": 4, "name": "Design Cost-Optimized Architectures", "weight": 20}
  ],
  "topics": [{"slug": "iam-security", "title": "IAM & Security", "domains": [1]}],
  "exams": [{"id": 1, "title": "Mock Exam 1", "questions": 65, "minutes": 130}]
}
```

### topic file

```json
{
  "slug": "iam-security",
  "title": "IAM & Security",
  "domains": [1],
  "essentials": [
    {"heading": "IAM basics", "body": "markdown string with key facts, limits, traps"}
  ],
  "labs": [
    {"id": "iam-create-role", "title": "...", "intro": "...",
     "cli": "aws iam create-role ...", "pulumi": "import pulumi_aws as aws ...",
     "note": "what to observe / cleanup"}
  ],
  "questions": [
    {"id": "iam-q1", "domain": 1, "stem": "scenario...",
     "options": ["A ...", "B ...", "C ...", "D ..."],
     "answer": 2, "explanation": "why C is right and A/B/D wrong"}
  ]
}
```

Multi-answer questions use `"answer": [0, 2]` and the UI renders checkboxes.

### exam file

Same question shape as topic questions, 65 per exam, domain-weighted to the
blueprint (≈ 20/17/16/12 questions for domains 1–4). Mix of single- and
multi-select, scenario-heavy.

## Topics (12)

1. IAM & Security — D1
2. VPC & Networking — D1, D2
3. EC2 & Compute (ASG, ELB) — D2, D3
4. S3 & Storage (EBS, EFS, FSx) — D1, D3, D4
5. Databases (RDS, Aurora, DynamoDB, ElastiCache, Redshift) — D2, D3
6. Decoupling & Integration (SQS, SNS, EventBridge, API Gateway) — D2, D3
7. Serverless & Containers (Lambda, ECS, EKS, Fargate) — D3, D4
8. Monitoring & Auditing (CloudWatch, CloudTrail, Config) — D1, D2
9. Content Delivery & DNS (CloudFront, Route 53, Global Accelerator) — D3
10. HA, DR & Resilience — D2
11. Cost Optimization (pricing, Budgets, Savings Plans, Spot) — D4
12. Data, Analytics & Migration (Kinesis, Glue, Athena, DMS, Snow) — D3

Each topic: **exam essentials** (bare-minimum-to-pass notes) + **hands-on labs**
(AWS CLI + Pulumi Python snippets) + **practice questions** (≈6–8 each).

## Views / UI

- **Dashboard**: overall progress, per-topic completion %, exam attempt history,
  weakest domains.
- **Topic page**: tabs or sections — Essentials / Labs / Questions. Questions
  give immediate feedback + explanation on submit.
- **Exam page**: timed, paginated 65 questions, flag-for-review, submit →
  score report with pass/fail (720/1000 ≈ 72%), per-domain breakdown, and full
  per-question review with explanations.
- Minimal clean styling, keyboard-friendly, AWS-ish color accents.

## Content volume

Full set: ~80 topic practice questions + 5 × 65 = 325 exam questions (~400
total). Authored incrementally in batches; structure makes adding more trivial.

## Testing

- Content validation: a small script (`node`/plain JS or a checked-in HTML
  self-test) verifies every topic/exam JSON parses, every question has a valid
  `answer` index within `options` range, and exam question counts/domain weights
  are correct.
- Manual smoke: load each view, answer a question (right/wrong paths),
  complete an exam, verify score math and localStorage persistence/reset.

## Risks

- Large content effort → mitigated by batching and a strict JSON schema.
- Answer-key correctness → each question includes an explanation forcing the
  rationale; validation script catches structural errors.
