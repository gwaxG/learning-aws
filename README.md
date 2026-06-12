# AWS SAA-C03 Trainer

A personal, offline study trainer for the **AWS Certified Solutions Architect – Associate (SAA-C03)** exam. Static web app — no backend, no build step, no dependencies. All content (study notes, hands-on labs, practice questions, mock exams) lives in JSON and is rendered by a small vanilla-JS app. Progress is saved in your browser's `localStorage`.

## Run it

ES modules + `fetch` need an HTTP origin (opening `index.html` as `file://` is blocked by CORS), so serve the folder:

```bash
node serve.js          # → http://localhost:8000
# or: python3 -m http.server 8000
```

Then open **http://localhost:8000**.

## What's inside

- **13 topics** (by service area, tagged with the 4 exam domains): Architecture & Data-Intensive Design, IAM & Security, VPC & Networking, EC2 & Compute, S3 & Storage, Databases, Decoupling & Integration, Serverless & Containers, Monitoring & Auditing, Content Delivery & DNS, HA/DR & Resilience, Cost Optimization, Data/Analytics & Migration.
  - Each topic = **Exam essentials** (bare-minimum-to-pass notes) + **Hands-on labs** (AWS CLI + Pulumi Python snippets) + **practice questions** with full explanations.
  - Essentials may include inline **architecture diagrams** (offline SVGs in `content/diagrams/`) and **official AWS documentation links**.
- **5 mock exams**, 65 questions each, timed (130 min), domain-weighted like the real blueprint (≈30/26/24/20%). Score report with per-domain breakdown and a full per-question review.
- **Dashboard** tracking per-topic progress and exam attempt history.

> Practice questions are original, written in authentic SAA-C03 scenario style — they are **not** real AWS exam questions.

## Project layout

```
index.html            app shell + nav
serve.js              tiny static server
css/styles.css        styling
js/
  storage.js          localStorage progress wrapper
  content.js          fetches manifest/topic/exam JSON
  quiz.js             answer-checking + scoring + question rendering
  exam.js             timed exam controller + score report
  views.js            dashboard / topic / exam-list rendering
  app.js              hash router + boot
content/
  manifest.json       lists topics, exams, domains
  topics/<slug>.json  one file per topic
  exams/exam-N.json   five mock exams
  diagrams/*.svg      offline architecture diagrams referenced by topics
scripts/
  validate-content.mjs   schema validator (run after editing content)
  debias-answers.mjs     one-shot: evens out correct-answer positions
tests/                    unit tests for storage + scoring
```

## Develop / maintain

```bash
node --test                      # run unit tests
node scripts/validate-content.mjs  # validate all content JSON
```

**Add a topic:** add an entry to `content/manifest.json` `topics`, create `content/topics/<slug>.json` (see an existing file for the schema), then run the validator.

**Add an exam:** add an entry to `manifest.json` `exams`, create `content/exams/exam-N.json` with `questions` (count must match the manifest), then validate.

### Question schema

```json
{
  "id": "unique-id",
  "domain": 1,
  "stem": "scenario...",
  "options": ["A", "B", "C", "D"],
  "answer": 1,
  "explanation": "why right, why others wrong"
}
```

`answer` is a 0-based index, or an array like `[0, 2]` for multi-select (put "(Choose two)" in the stem). `domain` is 1–4.

Pass mark is 720/1000; the score is scaled `100 + (correct/total) × 900`.
