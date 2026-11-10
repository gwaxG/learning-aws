// Weak points (#/weak-points) — personal weak-area map from the diagnostic + ingested questions.
// Data: content/weak/weak-points.json. Theory is pulled live from topic essentials; practice links go to flashcards and the hub.
import { loadServices, loadTopic, loadHub } from "./content.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mdLite = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

const SEV = { 3: ["High", "sev-3"], 2: ["Medium", "sev-2"], 1: ["Low", "sev-1"] };

async function loadWeak() {
  const res = await fetch("content/weak/weak-points.json");
  if (!res.ok) throw new Error(`Failed to load weak points: ${res.status}`);
  return res.json();
}
async function loadCardCounts() {
  const res = await fetch("content/flashcards/cards.json");
  if (!res.ok) return new Map();
  const m = new Map();
  for (const c of (await res.json()).cards) m.set(c.svc, (m.get(c.svc) || 0) + 1);
  return m;
}

export async function renderWeakPoints(view) {
  const [weak, svc, hub, counts] = await Promise.all([loadWeak(), loadServices(), loadHub(), loadCardCounts()]);
  const svcById = new Map(svc.categories.flatMap((c) => c.services.map((s) => [s.id, s])));
  const slugs = [...new Set(weak.areas.flatMap((a) => a.theory.map((t) => t.topic)))];
  const topics = new Map(await Promise.all(slugs.map(async (s) => [s, await loadTopic(s)])));
  const areas = [...weak.areas].sort((a, b) => b.severity - a.severity);
  const d = weak.diagnostic;

  const stat = (a) => {
    const set = new Set(a.services);
    const cards = a.services.reduce((n, s) => n + (counts.get(s) || 0), 0);
    const docs = hub.docs.filter((x) => x.services.some((s) => set.has(s)));
    const mine = docs.filter((x) => x.source?.type === "user");
    return { cards, docs, mine };
  };

  const diag = `<section class="card">
    <h2>Diagnostic · ${esc(d.date)}</h2>
    <div class="wp-score"><span class="wp-big">${d.correct}<small> / ${d.asked}</small></span>
      <p class="muted">${esc(d.note)}</p></div>
    <ul class="wp-results">${d.results
      .map((r) => `<li class="${r.ok ? "r-ok" : "r-miss"}"><span>${r.ok ? "✓" : "✗"}</span> ${esc(r.q)}${r.ok ? "" : ` <em class="muted">→ ${esc(r.answer)}</em>`}</li>`)
      .join("")}</ul>
  </section>`;

  const priority = `<section class="card"><h2>Priority map</h2>
    ${areas
      .map((a) => {
        const s = stat(a);
        return `<a class="wp-row" href="#wp-${esc(a.id)}" data-jump="${esc(a.id)}">
          <span class="wp-sev ${SEV[a.severity][1]}">${SEV[a.severity][0]}</span>
          <span class="wp-name">${esc(a.title)}</span>
          <span class="bar wp-bar"><span class="${SEV[a.severity][1]}" style="width:${a.severity * 33.3}%"></span></span>
          <small class="muted">${s.cards} cards · ${s.mine.length} questions</small></a>`;
      })
      .join("")}</section>`;

  const section = (a) => {
    const s = stat(a);
    const theory = a.theory
      .map((t) => {
        const e = topics.get(t.topic).essentials.find((x) => x.heading === t.heading);
        return `<details class="wp-theory"><summary>${esc(t.heading)} <small class="muted">· ${esc(topics.get(t.topic).title)}</small></summary>
          <p>${mdLite(e.body)}</p><a href="#/topic/${esc(t.topic)}">Open the full topic →</a></details>`;
      })
      .join("");
    const qs = s.mine
      .slice(0, 15)
      .map((x) => `<li><a href="#/hub/${esc(x.id)}">${esc(x.concept)}</a></li>`)
      .join("");
    return `<section class="card wp-area" id="wp-${esc(a.id)}">
      <h2>${esc(a.title)} <span class="wp-sev ${SEV[a.severity][1]}">${SEV[a.severity][0]}</span></h2>
      <p>${esc(a.why)}</p>
      <h3>Evidence</h3><ul>${a.evidence.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Rules to remember</h3><ul class="wp-rules">${a.rules.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Theory</h3>${theory}
      <h3>Practice</h3>
      <p><a class="btn" href="#/flashcards?w=${esc(a.id)}&mode=all">Flashcards: ${s.cards} cards →</a></p>
      ${s.mine.length ? `<p class="muted">Your questions in this area (${s.mine.length}${s.mine.length > 15 ? ", first 15" : ""}):</p><ul class="wp-qs">${qs}</ul>` : ""}
      <p class="muted">${s.docs.length - s.mine.length} more related questions from the mock exams:
        <a href="#/hub?s=${esc(a.services[0])}">open in Question Hub →</a></p>
      <div class="chips">${a.services.map((id) => `<a class="chip svc" style="--c:${svcById.get(id)?.color}" href="#/services/${esc(id)}">${esc(svcById.get(id)?.name || id)}</a>`).join("")}</div>
    </section>`;
  };

  view.innerHTML = `<h1>Weak points</h1>${diag}${priority}${areas.map(section).join("")}`;
  view.querySelectorAll("[data-jump]").forEach((el) => {
    el.onclick = (e) => {
      e.preventDefault();
      document.getElementById("wp-" + el.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
}
