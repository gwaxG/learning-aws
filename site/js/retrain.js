// Retrain (#/retrain[?mode=&topic=&d=&q=]) — drill over your own missed questions with a short explanation.
import { loadHub, loadManifest } from "./content.js";
import { store } from "./storage.js";
import { renderQuestion } from "./quiz.js";
import { MODES, buildPool, matches, orderQueue, counts, statusOf } from "./retrain-lib.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const md = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");

export async function renderRetrain(view, _arg, query) {
  const [hub, manifest] = await Promise.all([loadHub(), loadManifest()]);
  const pool = buildPool(hub.docs);
  const topicTitle = new Map(manifest.topics.map((t) => [t.slug, t.title]));
  const st = {
    mode: MODES[query.mode] ? query.mode : "todo",
    topic: topicTitle.has(query.topic) ? query.topic : "",
    domain: manifest.domains.some((d) => String(d.id) === query.d) ? query.d : "",
    q: query.q || "",
  };
  let queue = [];
  let pos = 0;

  const withStatus = () => pool.map((d) => ({ d, status: statusOf(store.getQuestion(d.id)) }));
  const filtered = () => withStatus().filter((it) => matches(it.d, it.status, st));

  const setHash = () => {
    const p = new URLSearchParams();
    if (st.mode !== "todo") p.set("mode", st.mode);
    if (st.topic) p.set("topic", st.topic);
    if (st.domain) p.set("d", st.domain);
    if (st.q) p.set("q", st.q);
    const qs = p.toString();
    history.replaceState(null, "", "#/retrain" + (qs ? "?" + qs : ""));
  };

  const rebuild = () => {
    queue = orderQueue(filtered());
    pos = 0;
  };

  function draw() {
    const all = counts(withStatus());
    const topicsInPool = [...new Set(pool.flatMap((d) => d.topics || []))].filter((t) => topicTitle.has(t));
    view.innerHTML = `
      <div class="card">
        <h1>Retrain your misses</h1>
        <p class="muted">${all.total} questions you got wrong in practice tests. Answer, read the short explanation, repeat until they stick.
          <span class="bad">${all.wrong} wrong</span> · <span>${all.new} not retried</span> · <span class="ok">${all.known} known</span></p>
        <div class="chips" id="modes">${Object.entries(MODES)
          .map(([k, v]) => `<button class="chip ${st.mode === k ? "on" : ""}" data-mode="${k}">${v}</button>`)
          .join("")}</div>
        <div class="chips" id="domains">
          <button class="chip ${st.domain ? "" : "on"}" data-d="">All domains</button>
          ${manifest.domains.map((d) => `<button class="chip ${st.domain === String(d.id) ? "on" : ""}" data-d="${d.id}">D${d.id} <small>${esc(d.name.replace("Design ", ""))}</small></button>`).join("")}
        </div>
        <div class="chips" id="topics">
          <button class="chip ${st.topic ? "" : "on"}" data-topic="">All topics</button>
          ${topicsInPool.map((t) => `<button class="chip ${st.topic === t ? "on" : ""}" data-topic="${t}">${esc(topicTitle.get(t))}</button>`).join("")}
        </div>
        <input id="rq" type="search" placeholder="Search stem, concept, keyword…" value="${esc(st.q)}" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--panel-2);color:var(--fg)">
      </div>
      <div id="drill"></div>`;

    view.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => ((st.mode = b.dataset.mode), refresh())));
    view.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => ((st.domain = b.dataset.d), refresh())));
    view.querySelectorAll("[data-topic]").forEach((b) => (b.onclick = () => ((st.topic = b.dataset.topic), refresh())));
    view.querySelector("#rq").onchange = (e) => ((st.q = e.target.value), refresh());
    drill();
  }

  function refresh() {
    setHash();
    rebuild();
    draw();
  }

  function drill() {
    const box = view.querySelector("#drill");
    if (!queue.length) {
      box.innerHTML = `<div class="card"><p>Nothing in this view. ${st.mode === "todo" ? "<span class=\"ok\">Everything here is marked known.</span> Switch to “All” or “Known” to repeat.</p>" : "</p>"}</div>`;
      return;
    }
    if (pos >= queue.length) {
      const c = counts(withStatus());
      box.innerHTML = `<div class="card"><h2>Round finished</h2>
        <p><span class="ok">${c.known} known</span> · <span class="bad">${c.wrong} still wrong</span> · ${c.new} not retried.</p>
        <button class="btn" id="again">Start another round</button></div>`;
      box.querySelector("#again").onclick = () => (rebuild(), drill());
      return;
    }
    const { d } = queue[pos];
    box.innerHTML = `<div class="q-card">
      <div class="q-num">Question ${pos + 1} of ${queue.length} · Domain ${d.domain} · ${esc((d.topics || []).map((t) => topicTitle.get(t) || t).join(", "))}${
        statusOf(store.getQuestion(d.id)) === "wrong" ? ` · <span class="bad">missed again</span>` : ""
      }</div>
      <div id="rq-body"></div>
      <div id="rq-after"></div></div>`;
    const q = { ...d.question, id: d.id };
    renderQuestion(box.querySelector("#rq-body"), q, {
      onAnswered: (correct) => {
        store.recordQuestion(d.id, correct);
        const after = box.querySelector("#rq-after");
        after.innerHTML = `
          <div class="q-explain"><strong>Remember:</strong> ${md(d.concept)}
            ${d.expected ? `<br><br><strong>Expected answer:</strong> ${md(d.expected)}` : ""}
            ${d.why_not ? `<br><br><strong>Why the others are wrong:</strong> ${md(d.why_not)}` : ""}</div>
          <p><a href="#/hub/${esc(d.id)}">Open in hub</a></p>
          <button class="btn" id="next">${pos + 1 < queue.length ? "Next question" : "Finish round"}</button>`;
        after.querySelector("#next").onclick = () => (pos++, drill());
      },
    });
    const skip = document.createElement("button");
    skip.className = "ghost";
    skip.textContent = "Skip";
    skip.onclick = () => (pos++, drill());
    box.querySelector(".q-card").append(skip);
  }

  rebuild();
  draw();
}
