# AWS SAA-C03 Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal, offline static web app to study for and pass the AWS Solutions Architect Associate (SAA-C03) exam, with per-topic essentials, hands-on CLI/Pulumi labs, practice questions, and 5 timed mock exams.

**Architecture:** Pure static site (HTML/CSS/vanilla JS), no backend, no build step. Content lives in JSON files under `content/`; JS is a generic data-driven renderer. Progress persists in `localStorage`. A Node validation script enforces content schema correctness as the test harness.

**Tech Stack:** HTML5, CSS3, vanilla ES modules (JS), `localStorage`, Node 22 (validation script + a tiny static file server for local use). No external dependencies.

> **Note on git:** This directory is not a git repository and the environment forbids git writes. "Commit" steps are replaced by **Checkpoint** steps (verify state, move on). Do not run git commands.

> **Note on serving:** ES modules + `fetch` of local JSON require an HTTP origin (file:// is blocked by CORS). Run `python3 -m http.server 8000` (or `node serve.js`) from the project root and open `http://localhost:8000`.

---

## File Structure

```
aws-learning/
  index.html              # app shell, nav container, view root
  serve.js                # tiny static server (optional convenience)
  css/styles.css          # all styling
  js/
    storage.js            # localStorage progress wrapper (pure, testable)
    content.js            # fetch + cache manifest/topic/exam JSON
    quiz.js               # render a question, check answer, scoring helpers
    exam.js               # timed exam controller + score report
    views.js              # render dashboard / topic / exam-list views
    app.js                # hash router, wires everything, boot
  content/
    manifest.json
    topics/<slug>.json    # 12 files
    exams/exam-1..5.json  # 5 files
  scripts/
    validate-content.mjs  # Node schema validator (the test harness)
  tests/
    storage.test.mjs      # unit tests for storage + scoring helpers
```

**Responsibilities:**
- `storage.js` — read/write/reset progress. No DOM. Importable in Node for tests.
- `quiz.js` — pure scoring functions (`isCorrect`, `scoreExam`) + DOM rendering of one question. Pure parts importable in Node.
- `exam.js` — owns timer + exam session state; delegates scoring to `quiz.js`.
- `content.js` — only place that does `fetch`.
- `views.js` / `app.js` — DOM + routing glue.
- `validate-content.mjs` — fails loudly on any malformed content.

---

## Task 1: Project scaffold + manifest + local server

**Files:**
- Create: `index.html`, `serve.js`, `content/manifest.json`, `css/styles.css` (stub)

- [ ] **Step 1: Create `content/manifest.json`**

```json
{
  "exam": {"code": "SAA-C03", "passScore": 720, "scaleMax": 1000},
  "domains": [
    {"id": 1, "name": "Design Secure Architectures", "weight": 30},
    {"id": 2, "name": "Design Resilient Architectures", "weight": 26},
    {"id": 3, "name": "Design High-Performing Architectures", "weight": 24},
    {"id": 4, "name": "Design Cost-Optimized Architectures", "weight": 20}
  ],
  "topics": [
    {"slug": "iam-security", "title": "IAM & Security", "domains": [1]},
    {"slug": "vpc-networking", "title": "VPC & Networking", "domains": [1, 2]},
    {"slug": "ec2-compute", "title": "EC2 & Compute", "domains": [2, 3]},
    {"slug": "storage", "title": "S3 & Storage", "domains": [1, 3, 4]},
    {"slug": "databases", "title": "Databases", "domains": [2, 3]},
    {"slug": "integration", "title": "Decoupling & Integration", "domains": [2, 3]},
    {"slug": "serverless-containers", "title": "Serverless & Containers", "domains": [3, 4]},
    {"slug": "monitoring", "title": "Monitoring & Auditing", "domains": [1, 2]},
    {"slug": "edge-dns", "title": "Content Delivery & DNS", "domains": [3]},
    {"slug": "ha-dr", "title": "HA, DR & Resilience", "domains": [2]},
    {"slug": "cost", "title": "Cost Optimization", "domains": [4]},
    {"slug": "data-migration", "title": "Data, Analytics & Migration", "domains": [3]}
  ],
  "exams": [
    {"id": 1, "title": "Mock Exam 1", "questions": 65, "minutes": 130},
    {"id": 2, "title": "Mock Exam 2", "questions": 65, "minutes": 130},
    {"id": 3, "title": "Mock Exam 3", "questions": 65, "minutes": 130},
    {"id": 4, "title": "Mock Exam 4", "questions": 65, "minutes": 130},
    {"id": 5, "title": "Mock Exam 5", "questions": 65, "minutes": 130}
  ]
}
```

- [ ] **Step 2: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AWS SAA-C03 Trainer</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="topbar">
    <a class="brand" href="#/">AWS SAA-C03 Trainer</a>
    <nav id="nav" class="nav"></nav>
  </header>
  <main id="view" class="view"><p>Loading…</p></main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `serve.js`**

```js
// Minimal static server: node serve.js  -> http://localhost:8000
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json" };

createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split("?")[0]);
  if (path === "/") path = "/index.html";
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}).listen(8000, () => console.log("http://localhost:8000"));
```

- [ ] **Step 4: Create stub `css/styles.css`** with `:root` color vars (filled in Task 7).

```css
:root { --bg:#0f1b2d; --panel:#16263d; --fg:#e8eef6; --accent:#ff9900; --muted:#8aa0bd;
  --ok:#2ecc71; --bad:#e74c3c; }
* { box-sizing: border-box; } body { margin:0; font-family: system-ui, sans-serif;
  background: var(--bg); color: var(--fg); }
```

- [ ] **Step 5: Checkpoint** — run `node serve.js`, open `http://localhost:8000`, confirm page loads showing "Loading…" with the header. Stop the server.

---

## Task 2: storage.js + unit tests (TDD)

**Files:**
- Create: `js/storage.js`, `tests/storage.test.mjs`

- [ ] **Step 1: Write failing test `tests/storage.test.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { makeStore } from "../js/storage.js";

function memBackend() {
  let s = {};
  return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); },
    removeItem: k => { delete s[k]; } };
}

test("records question answers and reports correctness", () => {
  const store = makeStore(memBackend());
  store.recordQuestion("iam-q1", true);
  store.recordQuestion("iam-q2", false);
  assert.equal(store.getQuestion("iam-q1").correct, true);
  assert.equal(store.getQuestion("iam-q2").correct, false);
  assert.equal(store.getQuestion("missing"), null);
});

test("marks labs done and persists across instances", () => {
  const backend = memBackend();
  makeStore(backend).setLabDone("iam-create-role", true);
  assert.equal(makeStore(backend).isLabDone("iam-create-role"), true);
});

test("stores exam attempts and reset clears everything", () => {
  const store = makeStore(memBackend());
  store.addExamAttempt(1, { score: 800, passed: true, perDomain: {} });
  assert.equal(store.getExamAttempts(1).length, 1);
  store.reset();
  assert.equal(store.getExamAttempts(1).length, 0);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node --test tests/`
Expected: FAIL — cannot find `makeStore`.

- [ ] **Step 3: Implement `js/storage.js`**

```js
const KEY = "aws-saa-trainer:v1";
const empty = () => ({ questions: {}, labs: {}, exams: {} });

export function makeStore(backend = globalThis.localStorage) {
  const load = () => { try { return { ...empty(), ...JSON.parse(backend.getItem(KEY)) }; }
    catch { return empty(); } };
  const save = (s) => backend.setItem(KEY, JSON.stringify(s));

  return {
    recordQuestion(id, correct) { const s = load(); s.questions[id] = { correct, ts: Date.now() }; save(s); },
    getQuestion(id) { return load().questions[id] ?? null; },
    setLabDone(id, done) { const s = load(); s.labs[id] = !!done; save(s); },
    isLabDone(id) { return !!load().labs[id]; },
    addExamAttempt(examId, result) { const s = load(); (s.exams[examId] ||= []).push({ ...result, ts: Date.now() }); save(s); },
    getExamAttempts(examId) { return load().exams[examId] ?? []; },
    snapshot() { return load(); },
    reset() { backend.removeItem(KEY); },
  };
}

export const store = makeStore();
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test tests/`
Expected: PASS (3 tests).

- [ ] **Step 5: Checkpoint** — tests green.

---

## Task 3: quiz.js scoring helpers + unit tests (TDD)

**Files:**
- Create: `js/quiz.js`, add tests to `tests/storage.test.mjs` (or `tests/quiz.test.mjs`)

- [ ] **Step 1: Write failing test `tests/quiz.test.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { isCorrect, scoreExam } from "../js/quiz.js";

test("isCorrect handles single and multi answer", () => {
  assert.equal(isCorrect({ answer: 2 }, 2), true);
  assert.equal(isCorrect({ answer: 2 }, 1), false);
  assert.equal(isCorrect({ answer: [0, 2] }, [2, 0]), true);
  assert.equal(isCorrect({ answer: [0, 2] }, [0]), false);
});

test("scoreExam scales to 100-1000 and computes per-domain", () => {
  const qs = [
    { id: "a", domain: 1, answer: 0 }, { id: "b", domain: 1, answer: 1 },
    { id: "c", domain: 2, answer: 0 }, { id: "d", domain: 2, answer: 0 },
  ];
  const responses = { a: 0, b: 0, c: 0, d: 0 }; // 3/4 correct (b wrong)
  const r = scoreExam(qs, responses, 720);
  assert.equal(r.correct, 3);
  assert.equal(r.total, 4);
  assert.equal(r.score, Math.round(100 + (3 / 4) * 900)); // 775
  assert.equal(r.passed, true);
  assert.equal(r.perDomain[1].correct, 1);
  assert.equal(r.perDomain[2].correct, 2);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test tests/`
Expected: FAIL — cannot find `isCorrect`.

- [ ] **Step 3: Implement scoring portion of `js/quiz.js`**

```js
export function isCorrect(question, response) {
  const ans = question.answer;
  if (Array.isArray(ans)) {
    if (!Array.isArray(response)) return false;
    const a = [...ans].sort(), b = [...response].sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return response === ans;
}

export function scoreExam(questions, responses, passScore = 720) {
  const perDomain = {};
  let correct = 0;
  for (const q of questions) {
    const ok = q.id in responses && isCorrect(q, responses[q.id]);
    if (ok) correct++;
    (perDomain[q.domain] ||= { correct: 0, total: 0 }).total++;
    if (ok) perDomain[q.domain].correct++;
  }
  const total = questions.length;
  const score = total ? Math.round(100 + (correct / total) * 900) : 100;
  return { correct, total, score, passed: score >= passScore, perDomain };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test tests/`
Expected: PASS (all tests).

- [ ] **Step 5: Add DOM rendering to `js/quiz.js`** (not unit-tested; verified manually in Task 6)

```js
// Renders one question into a container; calls onAnswered(correct) after reveal.
export function renderQuestion(container, question, { reveal = null, onAnswered } = {}) {
  const multi = Array.isArray(question.answer);
  const selected = new Set();
  container.innerHTML = "";
  const stem = document.createElement("p");
  stem.className = "q-stem";
  stem.textContent = question.stem;
  container.append(stem);
  const list = document.createElement("div");
  list.className = "q-options";
  question.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "q-option";
    btn.textContent = opt;
    btn.onclick = () => {
      if (multi) { selected.has(i) ? selected.delete(i) : selected.add(i); btn.classList.toggle("sel"); }
      else { submit(i); }
    };
    list.append(btn);
  });
  container.append(list);
  if (multi) {
    const go = document.createElement("button");
    go.className = "q-submit"; go.textContent = "Submit";
    go.onclick = () => submit([...selected]);
    container.append(go);
  }
  function submit(response) {
    const correct = isCorrect(question, response);
    [...list.children].forEach((b, i) => {
      const isAns = multi ? question.answer.includes(i) : i === question.answer;
      if (isAns) b.classList.add("correct");
      const chosen = multi ? response.includes(i) : i === response;
      if (chosen && !isAns) b.classList.add("wrong");
      b.disabled = true;
    });
    const exp = document.createElement("div");
    exp.className = "q-explain " + (correct ? "ok" : "bad");
    exp.textContent = (correct ? "Correct. " : "Incorrect. ") + question.explanation;
    container.append(exp);
    onAnswered?.(correct);
  }
}
```

- [ ] **Step 6: Checkpoint** — tests green; rendering code present.

---

## Task 4: content.js loader

**Files:**
- Create: `js/content.js`

- [ ] **Step 1: Implement `js/content.js`**

```js
const cache = new Map();
async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  cache.set(path, data);
  return data;
}
export const loadManifest = () => getJSON("content/manifest.json");
export const loadTopic = (slug) => getJSON(`content/topics/${slug}.json`);
export const loadExam = (id) => getJSON(`content/exams/exam-${id}.json`);
```

- [ ] **Step 2: Checkpoint** — file present (exercised in Task 6).

---

## Task 5: views.js (dashboard, topic, exam list) + nav

**Files:**
- Create: `js/views.js`

- [ ] **Step 1: Implement `js/views.js`** — exports `renderNav`, `renderDashboard`, `renderTopic`, `renderExamList`.

```js
import { loadManifest, loadTopic } from "./content.js";
import { store } from "./storage.js";
import { renderQuestion } from "./quiz.js";

const mdLite = (s) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/`(.+?)`/g, "<code>$1</code>")
  .replace(/\n/g, "<br>");

export async function renderNav(nav) {
  const m = await loadManifest();
  nav.innerHTML =
    `<a href="#/">Dashboard</a>` +
    `<a href="#/exams">Mock Exams</a>` +
    `<span class="nav-sep">Topics</span>` +
    m.topics.map(t => `<a href="#/topic/${t.slug}">${t.title}</a>`).join("");
}

export async function renderDashboard(view) {
  const m = await loadManifest();
  const rows = await Promise.all(m.topics.map(async t => {
    const topic = await loadTopic(t.slug).catch(() => null);
    if (!topic) return `<tr><td>${t.title}</td><td colspan="2">—</td></tr>`;
    const total = topic.questions.length;
    const done = topic.questions.filter(q => store.getQuestion(q.id)).length;
    const right = topic.questions.filter(q => store.getQuestion(q.id)?.correct).length;
    return `<tr><td><a href="#/topic/${t.slug}">${t.title}</a></td>
      <td>${done}/${total} answered</td><td>${right} correct</td></tr>`;
  }));
  const attempts = m.exams.flatMap(e => store.getExamAttempts(e.id)
    .map(a => `<li>${e.title}: <strong>${a.score}</strong> (${a.passed ? "PASS" : "FAIL"})</li>`));
  view.innerHTML = `<h1>Dashboard</h1>
    <table class="dash"><thead><tr><th>Topic</th><th>Progress</th><th>Correct</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>
    <h2>Exam attempts</h2><ul>${attempts.join("") || "<li>None yet</li>"}</ul>
    <button id="reset" class="danger">Reset all progress</button>`;
  view.querySelector("#reset").onclick = () => { if (confirm("Erase all progress?")) { store.reset(); location.reload(); } };
}

export async function renderTopic(view, slug) {
  const t = await loadTopic(slug);
  view.innerHTML = `<h1>${t.title}</h1>
    <section><h2>Exam essentials</h2>${t.essentials.map(e =>
      `<h3>${e.heading}</h3><p>${mdLite(e.body)}</p>`).join("")}</section>
    <section><h2>Hands-on labs</h2><div id="labs"></div></section>
    <section><h2>Practice questions</h2><div id="qs"></div></section>`;
  const labs = view.querySelector("#labs");
  t.labs.forEach(lab => {
    const el = document.createElement("div");
    el.className = "lab";
    el.innerHTML = `<label><input type="checkbox" ${store.isLabDone(lab.id) ? "checked" : ""}> 
      <strong>${lab.title}</strong></label><p>${mdLite(lab.intro)}</p>
      <pre class="cli"><code>${lab.cli.replace(/</g,"&lt;")}</code></pre>
      <details><summary>Pulumi (Python)</summary><pre class="pulumi"><code>${lab.pulumi.replace(/</g,"&lt;")}</code></pre></details>
      <p class="lab-note">${mdLite(lab.note)}</p>`;
    el.querySelector("input").onchange = (ev) => store.setLabDone(lab.id, ev.target.checked);
    labs.append(el);
  });
  const qs = view.querySelector("#qs");
  t.questions.forEach(q => {
    const wrap = document.createElement("div");
    wrap.className = "q-card";
    qs.append(wrap);
    renderQuestion(wrap, q, { onAnswered: (c) => store.recordQuestion(q.id, c) });
  });
}

export async function renderExamList(view) {
  const m = await loadManifest();
  view.innerHTML = `<h1>Mock Exams</h1><div class="exam-grid">${m.exams.map(e => {
    const best = store.getExamAttempts(e.id).reduce((mx, a) => Math.max(mx, a.score), 0);
    return `<a class="exam-card" href="#/exam/${e.id}"><h3>${e.title}</h3>
      <p>${e.questions} questions · ${e.minutes} min</p>
      <p>Best: ${best || "—"}</p></a>`;
  }).join("")}</div>`;
}
```

- [ ] **Step 2: Checkpoint** — file present (exercised in Task 6).

---

## Task 6: exam.js (timed mode + report) + app.js router; manual smoke

**Files:**
- Create: `js/exam.js`, `js/app.js`

- [ ] **Step 1: Implement `js/exam.js`**

```js
import { loadExam, loadManifest } from "./content.js";
import { isCorrect, scoreExam } from "./quiz.js";
import { store } from "./storage.js";

export async function renderExam(view, examId) {
  const [m, exam] = await Promise.all([loadManifest(), loadExam(examId)]);
  const questions = exam.questions;
  const responses = {};
  let idx = 0;
  let remaining = (exam.minutes ?? 130) * 60;

  view.innerHTML = `<div class="exam-bar"><span id="timer"></span>
    <span id="counter"></span><button id="finish" class="danger">Finish exam</button></div>
    <div id="q"></div>
    <div class="exam-nav"><button id="prev">Prev</button><button id="next">Next</button></div>`;
  const qEl = view.querySelector("#q");
  const timerEl = view.querySelector("#timer");
  const counterEl = view.querySelector("#counter");

  const tick = () => {
    const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
    const ss = String(remaining % 60).padStart(2, "0");
    timerEl.textContent = `⏱ ${mm}:${ss}`;
    if (remaining-- <= 0) { clearInterval(timer); finish(); }
  };
  const timer = setInterval(tick, 1000); tick();

  function draw() {
    const q = questions[idx];
    counterEl.textContent = `Question ${idx + 1} / ${questions.length}`;
    const multi = Array.isArray(q.answer);
    qEl.innerHTML = `<p class="q-stem">${q.stem}</p>` + q.options.map((o, i) => {
      const chosen = multi ? (responses[q.id] || []).includes(i) : responses[q.id] === i;
      return `<button class="q-option ${chosen ? "sel" : ""}" data-i="${i}">${o}</button>`;
    }).join("");
    qEl.querySelectorAll(".q-option").forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (multi) { const cur = new Set(responses[q.id] || []); cur.has(i) ? cur.delete(i) : cur.add(i); responses[q.id] = [...cur]; }
      else { responses[q.id] = i; }
      draw();
    });
  }
  view.querySelector("#prev").onclick = () => { if (idx > 0) { idx--; draw(); } };
  view.querySelector("#next").onclick = () => { if (idx < questions.length - 1) { idx++; draw(); } };
  view.querySelector("#finish").onclick = finish;
  draw();

  function finish() {
    clearInterval(timer);
    const result = scoreExam(questions, responses, m.exam.passScore);
    store.addExamAttempt(examId, { score: result.score, passed: result.passed, perDomain: result.perDomain });
    view.innerHTML = `<h1>${exam.title} — Result</h1>
      <p class="big ${result.passed ? "ok" : "bad"}">${result.score} / 1000 — ${result.passed ? "PASS" : "FAIL"}</p>
      <p>${result.correct} / ${result.total} correct (pass = ${m.exam.passScore})</p>
      <h2>By domain</h2><ul>${m.domains.map(d => {
        const pd = result.perDomain[d.id] || { correct: 0, total: 0 };
        return `<li>${d.name}: ${pd.correct}/${pd.total}</li>`;
      }).join("")}</ul>
      <h2>Review</h2><div id="review"></div>`;
    const review = view.querySelector("#review");
    questions.forEach((q, n) => {
      const ok = q.id in responses && isCorrect(q, responses[q.id]);
      const el = document.createElement("div");
      el.className = "q-card";
      el.innerHTML = `<p class="q-stem">${n + 1}. ${q.stem}</p>` +
        q.options.map((o, i) => {
          const isAns = Array.isArray(q.answer) ? q.answer.includes(i) : i === q.answer;
          const chosen = Array.isArray(responses[q.id]) ? responses[q.id].includes(i) : responses[q.id] === i;
          return `<div class="q-option ${isAns ? "correct" : ""} ${chosen && !isAns ? "wrong" : ""}">${o}</div>`;
        }).join("") +
        `<div class="q-explain ${ok ? "ok" : "bad"}">${q.explanation}</div>`;
      review.append(el);
    });
  }
}
```

- [ ] **Step 2: Implement `js/app.js` (hash router + boot)**

```js
import { renderNav, renderDashboard, renderTopic, renderExamList } from "./views.js";
import { renderExam } from "./exam.js";

const view = document.getElementById("view");

async function route() {
  const hash = location.hash.slice(1) || "/";
  const [, kind, arg] = hash.split("/");
  try {
    if (kind === "topic") await renderTopic(view, arg);
    else if (kind === "exams") await renderExamList(view);
    else if (kind === "exam") await renderExam(view, arg);
    else await renderDashboard(view);
    window.scrollTo(0, 0);
  } catch (e) {
    view.innerHTML = `<p class="bad">Error: ${e.message}</p>`;
  }
}

window.addEventListener("hashchange", route);
renderNav(document.getElementById("nav")).then(route);
```

- [ ] **Step 3: Manual smoke test** — Run `node serve.js`. With at least one topic JSON (Task 8) and one exam JSON (Task 9) present, verify:
  - Dashboard lists topics.
  - A topic page shows essentials, labs (checkbox persists on reload), and questions (answering reveals explanation; correct/wrong styling; persists).
  - Mock Exams page lists 5 exams.
  - Starting an exam shows timer counting down, navigation works, Finish produces a scored report with per-domain breakdown and full review.

- [ ] **Step 4: Checkpoint** — all views function end-to-end.

---

## Task 7: styles.css (full styling)

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Replace `css/styles.css`** with full styling: topbar/nav, view container max-width, tables (`.dash`), `.q-card`, `.q-option` states (`.sel`, `.correct` green, `.wrong` red, `:disabled`), `.q-explain.ok/.bad`, `.lab` with `pre.cli`/`pre.pulumi` monospace blocks, `.exam-bar` sticky timer, `.exam-grid`/`.exam-card`, `.big`, `.danger` button. Use the `:root` vars from Task 1. Keep it one focused file; readable and uncluttered.

- [ ] **Step 2: Checkpoint** — reload app, confirm legible layout and that correct/wrong answer colors render.

---

## Task 8: Topic content (12 files)

**Files:**
- Create: `content/topics/<slug>.json` for all 12 slugs in the manifest.

Each file follows this exact schema (worked example for `iam-security`):

```json
{
  "slug": "iam-security",
  "title": "IAM & Security",
  "domains": [1],
  "essentials": [
    {"heading": "Principals, policies, evaluation",
     "body": "**IAM** governs *who* can do *what*. Identity-based policies attach to users/groups/roles; resource-based policies attach to resources (e.g. S3 bucket policy). Evaluation: explicit **Deny** > explicit **Allow** > implicit deny. Prefer **roles** over long-lived access keys; use **STS** for temporary credentials."}
  ],
  "labs": [
    {"id": "iam-role-ec2", "title": "Create an EC2 instance role",
     "intro": "Grant an EC2 instance read-only S3 access via an instance profile (no keys on disk).",
     "cli": "aws iam create-role --role-name demo-ec2 --assume-role-policy-document file://trust.json\naws iam attach-role-policy --role-name demo-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
     "pulumi": "import json, pulumi_aws as aws\nrole = aws.iam.Role(\"demoEc2\", assume_role_policy=json.dumps({\n  \"Version\": \"2012-10-17\",\n  \"Statement\": [{\"Effect\": \"Allow\", \"Principal\": {\"Service\": \"ec2.amazonaws.com\"}, \"Action\": \"sts:AssumeRole\"}]\n}))\naws.iam.RolePolicyAttachment(\"s3ro\", role=role.name, policy_arn=\"arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess\")",
     "note": "Cleanup: detach policy then delete role. Never bake access keys into AMIs."}
  ],
  "questions": [
    {"id": "iam-q1", "domain": 1,
     "stem": "A company needs EC2 instances to read objects from an S3 bucket without storing credentials on the instances. What is the MOST secure approach?",
     "options": ["Create an IAM user, generate access keys, and store them in the AMI",
       "Attach an IAM role to the instances via an instance profile",
       "Embed access keys in environment variables via user data",
       "Use the root account access keys"],
     "answer": 1,
     "explanation": "An IAM role attached through an instance profile provides automatically-rotated temporary credentials via the instance metadata service — no static keys to leak. Storing or embedding access keys (A, C) is insecure and hard to rotate. Root keys (D) violate least privilege and should never be used."}
  ]
}
```

- [ ] **Step 1:** Author `iam-security.json` with **≥6 essentials blocks**, **≥2 labs**, **6–8 questions** covering: principals/policies, MFA & password policy, roles vs users, STS/cross-account, KMS & encryption at rest, Secrets Manager vs SSM Parameter Store, security groups vs NACLs (cross-ref networking), AWS Organizations SCPs.
- [ ] **Step 2:** Author `vpc-networking.json` — subnets, route tables, IGW/NAT, SG vs NACL, VPC endpoints (gateway vs interface), peering vs Transit Gateway, VPN/Direct Connect, flow logs.
- [ ] **Step 3:** Author `ec2-compute.json` — instance families, purchasing options (On-Demand/Reserved/Spot/Savings Plans), AMIs, user data, placement groups, ELB types (ALB/NLB/GWLB), Auto Scaling policies & health checks.
- [ ] **Step 4:** Author `storage.json` — S3 storage classes & lifecycle, durability/consistency, versioning, encryption, replication, S3 Transfer Acceleration, EBS volume types & snapshots, EFS vs FSx, Storage Gateway.
- [ ] **Step 5:** Author `databases.json` — RDS Multi-AZ vs read replicas, Aurora, DynamoDB (capacity modes, GSIs, DAX, streams), ElastiCache (Redis vs Memcached), Redshift, when to pick which.
- [ ] **Step 6:** Author `integration.json` — SQS (standard vs FIFO, DLQ, visibility timeout), SNS fan-out, EventBridge, Step Functions, API Gateway, decoupling patterns.
- [ ] **Step 7:** Author `serverless-containers.json` — Lambda (limits, concurrency, triggers, VPC), ECS vs EKS vs Fargate, ECR, Lambda vs containers trade-offs, cost angle.
- [ ] **Step 8:** Author `monitoring.json` — CloudWatch metrics/alarms/logs/dashboards, CloudWatch Agent, CloudTrail, AWS Config, EventBridge for ops, X-Ray.
- [ ] **Step 9:** Author `edge-dns.json` — CloudFront (origins, behaviors, OAC, caching), Route 53 routing policies (simple/weighted/latency/failover/geo), health checks, Global Accelerator vs CloudFront.
- [ ] **Step 10:** Author `ha-dr.json` — Multi-AZ vs multi-Region, RTO/RPO, DR strategies (backup-restore, pilot light, warm standby, multi-site), backups, AWS Backup.
- [ ] **Step 11:** Author `cost.json` — pricing fundamentals, Savings Plans vs RIs, Spot, S3/EBS cost levers, Budgets, Cost Explorer, Cost & Usage Report, tagging, Trusted Advisor.
- [ ] **Step 12:** Author `data-migration.json` — Kinesis (Data Streams/Firehose/Analytics), Glue, Athena, EMR basics, DMS & SCT, Snow family, DataSync, Transfer Family.

After each file: run the validator (Task 10) — but since Task 10 is created once, the practical order is: do Task 10 first if executing strictly TDD. **Execution note:** create `scripts/validate-content.mjs` (Task 10) before/alongside authoring so each new file is validated immediately.

- [ ] **Step 13: Checkpoint** — `node scripts/validate-content.mjs` passes for all 12 topics; spot-check 2 topics in the browser.

---

## Task 9: Mock exam content (5 files, 65 questions each)

**Files:**
- Create: `content/exams/exam-1.json` … `exam-5.json`

Exam file schema:

```json
{
  "id": 1,
  "title": "Mock Exam 1",
  "minutes": 130,
  "questions": [
    {"id": "e1-q1", "domain": 2,
     "stem": "A web app must stay available if a single AZ fails. The team runs EC2 behind an ALB. What change BEST improves resilience?",
     "options": ["Increase the instance size", "Deploy instances across multiple AZs in an Auto Scaling group",
       "Enable termination protection", "Move to a larger Reserved Instance"],
     "answer": 1,
     "explanation": "Spreading instances across multiple AZs within an Auto Scaling group lets the ALB route around an AZ failure and replace lost capacity automatically. Bigger instances (A, D) or termination protection (C) do not provide AZ-level fault tolerance."}
  ]
}
```

- [ ] **Step 1–5:** Author exams 1–5. Each has **exactly 65 questions**, domain-weighted ≈ **20 / 17 / 16 / 12** (domains 1/2/3/4) to match the 30/26/24/20% blueprint. Vary scenarios across exams (no duplicate stems). Include several multi-select (`"answer": [..]`) questions per exam (the real exam has them). Unique `id` prefix per exam (`e1-`, `e2-`, …). Every question has a full explanation covering why the right answer wins and the distractors lose.
- [ ] **Step 6: Checkpoint** — validator passes; take Exam 1 end-to-end in the browser; confirm timer, scoring, per-domain breakdown, and review render correctly.

---

## Task 10: Content validation script (the test harness)

> **Execution order:** build this early (right after Task 1), so Tasks 8–9 are validated as authored.

**Files:**
- Create: `scripts/validate-content.mjs`

- [ ] **Step 1: Implement `scripts/validate-content.mjs`**

```js
import { readFile } from "node:fs/promises";

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

function checkQuestion(where, q, expectDomain = true) {
  if (!q.id) err(where, "missing id");
  if (typeof q.stem !== "string" || !q.stem) err(where, "missing stem");
  if (!Array.isArray(q.options) || q.options.length < 2) err(where, "needs >=2 options");
  if (typeof q.explanation !== "string" || !q.explanation) err(where, "missing explanation");
  if (expectDomain && ![1, 2, 3, 4].includes(q.domain)) err(where, `bad domain ${q.domain}`);
  const ans = q.answer;
  const n = q.options?.length ?? 0;
  const ok = Array.isArray(ans)
    ? ans.length > 0 && ans.every(i => Number.isInteger(i) && i >= 0 && i < n)
    : Number.isInteger(ans) && ans >= 0 && ans < n;
  if (!ok) err(where, `answer out of range: ${JSON.stringify(ans)}`);
}

const manifest = JSON.parse(await readFile("content/manifest.json", "utf8"));
const ids = new Set();

for (const t of manifest.topics) {
  const where = `topic ${t.slug}`;
  let topic;
  try { topic = JSON.parse(await readFile(`content/topics/${t.slug}.json`, "utf8")); }
  catch (e) { err(where, `cannot read/parse: ${e.message}`); continue; }
  if (!Array.isArray(topic.essentials) || !topic.essentials.length) err(where, "no essentials");
  if (!Array.isArray(topic.labs) || !topic.labs.length) err(where, "no labs");
  (topic.labs || []).forEach(l => { if (!l.id || !l.cli || !l.pulumi) err(where, `lab ${l.id} incomplete`); });
  if (!Array.isArray(topic.questions) || topic.questions.length < 6) err(where, "need >=6 questions");
  (topic.questions || []).forEach(q => {
    checkQuestion(`${where} ${q.id}`, q);
    if (ids.has(q.id)) err(where, `duplicate id ${q.id}`); ids.add(q.id);
  });
}

for (const e of manifest.exams) {
  const where = `exam ${e.id}`;
  let exam;
  try { exam = JSON.parse(await readFile(`content/exams/exam-${e.id}.json`, "utf8")); }
  catch (err2) { err(where, `cannot read/parse: ${err2.message}`); continue; }
  if (!Array.isArray(exam.questions) || exam.questions.length !== e.questions)
    err(where, `expected ${e.questions} questions, got ${exam.questions?.length}`);
  (exam.questions || []).forEach(q => {
    checkQuestion(`${where} ${q.id}`, q);
    if (ids.has(q.id)) err(where, `duplicate id ${q.id}`); ids.add(q.id);
  });
}

if (errors.length) { console.error(`✗ ${errors.length} content errors:\n` + errors.join("\n")); process.exit(1); }
console.log("✓ All content valid");
```

- [ ] **Step 2: Run on the worked-example IAM topic + Exam 1 sample**

Run: `node scripts/validate-content.mjs`
Expected (before full content exists): reports missing files for un-authored topics/exams — this is the harness working. Once Tasks 8–9 complete: `✓ All content valid`.

- [ ] **Step 3: Checkpoint** — validator green after all content authored.

---

## Task 11: Final verification

- [ ] **Step 1:** Run `node --test tests/` → all unit tests pass.
- [ ] **Step 2:** Run `node scripts/validate-content.mjs` → `✓ All content valid`.
- [ ] **Step 3:** `node serve.js`; full manual pass: dashboard, every topic loads, answer persistence, lab checkbox persistence, take one full mock exam, verify score math (correct/total → scaled 100–1000, pass at 720) and per-domain breakdown, then "Reset all progress" clears state.
- [ ] **Step 4:** Write a short `README.md` at project root: what it is, how to run (`node serve.js` → open `http://localhost:8000`), how to validate content, how to add a topic/exam (edit manifest + add JSON).

---

## Self-Review notes

- **Spec coverage:** UI (Tasks 1,5,6,7) · 12 service-area topics tagged with domains (Task 8, manifest Task 1) · essentials + CLI/Pulumi labs + questions per topic (Task 8 schema) · 5 timed 65-question domain-weighted mock exams with explanations + verification (Task 9) · progress in localStorage (Task 2) · validation/testing (Tasks 2,3,10,11). All spec sections map to tasks.
- **Type consistency:** `store` methods (`recordQuestion/getQuestion/setLabDone/isLabDone/addExamAttempt/getExamAttempts/reset`) defined in Task 2 and used identically in Tasks 5,6. `isCorrect`/`scoreExam`/`renderQuestion` defined in Task 3, used in 5,6. `loadManifest/loadTopic/loadExam` defined Task 4, used 5,6. Question schema (`id,domain,stem,options,answer,explanation`) identical across Tasks 3,8,9,10.
- **Placeholders:** none — all steps contain concrete code or concrete authoring requirements with a worked example.
