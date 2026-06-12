import { loadExam, loadManifest } from "./content.js";
import { isCorrect, scoreExam } from "./quiz.js";
import { store } from "./storage.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function renderExam(view, examId) {
  const [m, exam] = await Promise.all([loadManifest(), loadExam(examId)]);
  const questions = exam.questions;
  const responses = {};
  const flagged = new Set();
  let idx = 0;
  let remaining = (exam.minutes ?? 130) * 60;
  let finished = false;

  view.innerHTML = `
    <div class="exam-bar">
      <span id="timer" class="timer"></span>
      <span id="counter"></span>
      <button id="finish" class="danger">Finish exam</button>
    </div>
    <div id="q" class="q-card"></div>
    <div class="exam-controls">
      <button id="prev">◀ Prev</button>
      <button id="flag" class="ghost">⚑ Flag</button>
      <button id="next">Next ▶</button>
    </div>
    <div id="grid" class="q-grid"></div>`;

  const qEl = view.querySelector("#q");
  const timerEl = view.querySelector("#timer");
  const counterEl = view.querySelector("#counter");
  const gridEl = view.querySelector("#grid");

  const tick = () => {
    if (finished) return;
    const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
    const ss = String(remaining % 60).padStart(2, "0");
    timerEl.textContent = `⏱ ${mm}:${ss}`;
    if (remaining <= 0) {
      clearInterval(timer);
      finish();
      return;
    }
    if (remaining <= 300) timerEl.classList.add("low");
    remaining--;
  };
  const timer = setInterval(tick, 1000);
  tick();

  function drawGrid() {
    gridEl.innerHTML = questions
      .map((q, i) => {
        const cls = [
          "grid-cell",
          i === idx ? "current" : "",
          q.id in responses ? "answered" : "",
          flagged.has(i) ? "flagged" : "",
        ].join(" ");
        return `<button class="${cls}" data-go="${i}">${i + 1}</button>`;
      })
      .join("");
    gridEl.querySelectorAll("[data-go]").forEach((b) => {
      b.onclick = () => {
        idx = +b.dataset.go;
        draw();
      };
    });
  }

  function draw() {
    const q = questions[idx];
    counterEl.textContent = `Question ${idx + 1} / ${questions.length}`;
    const multi = Array.isArray(q.answer);
    qEl.innerHTML =
      `<p class="q-stem">${esc(q.stem)}</p>` +
      (multi ? `<p class="q-hint">(Choose ${q.answer.length})</p>` : "") +
      `<div class="q-options">` +
      q.options
        .map((o, i) => {
          const chosen = multi ? (responses[q.id] || []).includes(i) : responses[q.id] === i;
          return `<button class="q-option ${chosen ? "sel" : ""}" data-i="${i}">${esc(o)}</button>`;
        })
        .join("") +
      `</div>`;
    qEl.querySelectorAll(".q-option").forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.i;
        if (multi) {
          const cur = new Set(responses[q.id] || []);
          cur.has(i) ? cur.delete(i) : cur.add(i);
          responses[q.id] = [...cur];
        } else {
          responses[q.id] = i;
        }
        draw();
      };
    });
    view.querySelector("#flag").classList.toggle("active", flagged.has(idx));
    drawGrid();
  }

  view.querySelector("#prev").onclick = () => {
    if (idx > 0) {
      idx--;
      draw();
    }
  };
  view.querySelector("#next").onclick = () => {
    if (idx < questions.length - 1) {
      idx++;
      draw();
    }
  };
  view.querySelector("#flag").onclick = () => {
    flagged.has(idx) ? flagged.delete(idx) : flagged.add(idx);
    draw();
  };
  view.querySelector("#finish").onclick = () => {
    const unanswered = questions.length - Object.keys(responses).length;
    const msg = unanswered ? `${unanswered} question(s) unanswered. Finish anyway?` : "Finish and score the exam?";
    if (confirm(msg)) finish();
  };
  draw();

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    const result = scoreExam(questions, responses, m.exam.passScore);
    store.addExamAttempt(examId, {
      score: result.score,
      passed: result.passed,
      correct: result.correct,
      total: result.total,
      perDomain: result.perDomain,
    });
    view.innerHTML = `<h1>${esc(exam.title)} — Result</h1>
      <p class="big ${result.passed ? "ok" : "bad"}">${result.score} / 1000 — ${result.passed ? "PASS" : "FAIL"}</p>
      <p class="lead">${result.correct} / ${result.total} correct (pass mark ${m.exam.passScore})</p>
      <h2>By domain</h2>
      <ul class="domain-breakdown">${m.domains
        .map((d) => {
          const pd = result.perDomain[d.id] || { correct: 0, total: 0 };
          const pct = pd.total ? Math.round((pd.correct / pd.total) * 100) : 0;
          return `<li><span>${esc(d.name)}</span> <strong>${pd.correct}/${pd.total}</strong> (${pct}%)</li>`;
        })
        .join("")}</ul>
      <div class="result-actions">
        <a class="btn" href="#/exams">Back to exams</a>
        <button id="retake" class="btn">Retake</button>
      </div>
      <h2>Review all questions</h2>
      <div id="review"></div>`;
    view.querySelector("#retake").onclick = () => renderExam(view, examId);

    const review = view.querySelector("#review");
    questions.forEach((q, n) => {
      const ok = q.id in responses && isCorrect(q, responses[q.id]);
      const el = document.createElement("div");
      el.className = "q-card";
      const multi = Array.isArray(q.answer);
      el.innerHTML =
        `<p class="q-stem"><span class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"}</span> ${n + 1}. ${esc(q.stem)}</p>` +
        `<div class="q-options">` +
        q.options
          .map((o, i) => {
            const isAns = multi ? q.answer.includes(i) : i === q.answer;
            const chosen = multi
              ? (responses[q.id] || []).includes(i)
              : responses[q.id] === i;
            const cls = ["q-option", isAns ? "correct" : "", chosen && !isAns ? "wrong" : ""].join(" ");
            return `<div class="${cls}">${esc(o)}</div>`;
          })
          .join("") +
        `</div>` +
        `<div class="q-explain ${ok ? "ok" : "bad"}">${esc(q.explanation)}</div>`;
      review.append(el);
    });
    window.scrollTo(0, 0);
  }
}
