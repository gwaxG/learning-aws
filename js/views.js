import { loadManifest, loadTopic } from "./content.js";
import { store } from "./storage.js";
import { renderQuestion } from "./quiz.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Tiny inline markdown: **bold**, `code`, *italic*, newlines.
const mdLite = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

export async function renderNav(nav) {
  const m = await loadManifest();
  nav.innerHTML =
    `<a href="#/">Dashboard</a>` +
    `<a href="#/exams">Mock Exams</a>` +
    `<span class="nav-sep">Topics</span>` +
    m.topics.map((t) => `<a href="#/topic/${t.slug}">${esc(t.title)}</a>`).join("");
}

export async function renderDashboard(view) {
  const m = await loadManifest();
  const rows = await Promise.all(
    m.topics.map(async (t) => {
      const topic = await loadTopic(t.slug).catch(() => null);
      if (!topic) {
        return `<tr><td><a href="#/topic/${t.slug}">${esc(t.title)}</a></td><td colspan="3">not loaded</td></tr>`;
      }
      const total = topic.questions.length;
      const done = topic.questions.filter((q) => store.getQuestion(q.id)).length;
      const right = topic.questions.filter((q) => store.getQuestion(q.id)?.correct).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `<tr>
        <td><a href="#/topic/${t.slug}">${esc(t.title)}</a></td>
        <td><div class="bar"><span style="width:${pct}%"></span></div></td>
        <td>${done}/${total}</td>
        <td>${right} ✓</td></tr>`;
    })
  );
  const attempts = m.exams.flatMap((e) =>
    store.getExamAttempts(e.id).map(
      (a) =>
        `<li>${esc(e.title)}: <strong>${a.score}</strong>/1000 <span class="${a.passed ? "ok" : "bad"}">${a.passed ? "PASS" : "FAIL"}</span></li>`
    )
  );
  view.innerHTML = `<h1>Dashboard</h1>
    <p class="lead">AWS Certified Solutions Architect – Associate (SAA-C03). Pass mark ${m.exam.passScore}/1000.</p>
    <table class="dash">
      <thead><tr><th>Topic</th><th>Progress</th><th>Answered</th><th>Correct</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <h2>Exam attempts</h2>
    <ul class="attempts">${attempts.join("") || "<li>None yet — try a mock exam.</li>"}</ul>
    <button id="reset" class="danger">Reset all progress</button>`;
  view.querySelector("#reset").onclick = () => {
    if (confirm("Erase all saved progress?")) {
      store.reset();
      location.reload();
    }
  };
}

export async function renderTopic(view, slug) {
  const t = await loadTopic(slug);
  view.innerHTML = `<h1>${esc(t.title)}</h1>
    <section class="card">
      <h2>Exam essentials</h2>
      ${t.essentials.map((e) => `<h3>${esc(e.heading)}</h3><p>${mdLite(e.body)}</p>`).join("")}
    </section>
    <section class="card">
      <h2>Hands-on labs</h2>
      <div id="labs"></div>
    </section>
    <section class="card">
      <h2>Practice questions</h2>
      <div id="qs"></div>
    </section>`;

  const labs = view.querySelector("#labs");
  t.labs.forEach((lab) => {
    const el = document.createElement("div");
    el.className = "lab";
    el.innerHTML = `
      <label class="lab-head"><input type="checkbox" ${store.isLabDone(lab.id) ? "checked" : ""}>
        <strong>${esc(lab.title)}</strong></label>
      <p>${mdLite(lab.intro)}</p>
      <div class="code-label">AWS CLI</div>
      <pre class="cli"><code>${esc(lab.cli)}</code></pre>
      <details><summary>Pulumi (Python)</summary>
        <pre class="pulumi"><code>${esc(lab.pulumi)}</code></pre>
      </details>
      <p class="lab-note">${mdLite(lab.note)}</p>`;
    el.querySelector("input").onchange = (ev) => store.setLabDone(lab.id, ev.target.checked);
    labs.append(el);
  });

  const qs = view.querySelector("#qs");
  t.questions.forEach((q, i) => {
    const wrap = document.createElement("div");
    wrap.className = "q-card";
    const num = document.createElement("div");
    num.className = "q-num";
    num.textContent = `Question ${i + 1}`;
    wrap.append(num);
    const body = document.createElement("div");
    wrap.append(body);
    qs.append(wrap);
    renderQuestion(body, q, { onAnswered: (c) => store.recordQuestion(q.id, c) });
  });
}

export async function renderExamList(view) {
  const m = await loadManifest();
  view.innerHTML = `<h1>Mock Exams</h1>
    <p class="lead">Full-length timed exams. ${m.exams[0]?.questions ?? 65} questions, ${m.exams[0]?.minutes ?? 130} minutes, domain-weighted like the real SAA-C03.</p>
    <div class="exam-grid">${m.exams
      .map((e) => {
        const attempts = store.getExamAttempts(e.id);
        const best = attempts.reduce((mx, a) => Math.max(mx, a.score), 0);
        return `<a class="exam-card" href="#/exam/${e.id}">
          <h3>${esc(e.title)}</h3>
          <p>${e.questions} questions · ${e.minutes} min</p>
          <p class="exam-best">Best: ${best ? best + "/1000" : "—"} · ${attempts.length} attempt(s)</p>
        </a>`;
      })
      .join("")}</div>`;
}
