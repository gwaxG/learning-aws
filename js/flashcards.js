// Flashcards (#/flashcards[?cat=&s=&type=&mode=&q=]) — short service-fact cards generated from map #1.
import { loadServices } from "./content.js";
import { store } from "./storage.js";

const TYPES = {
  purpose: "Purpose",
  reverse: "Which service?",
  when: "When to use",
  facts: "Key facts",
  cloze: "Numbers & limits",
  trap: "Not for / traps",
  vs: "Compare",
  extra: "Extra",
};
const MODES = { learn: "To learn", all: "All", mastered: "Mastered" };
const MAX_BOX = 3;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = (s) => String(s ?? "").toLowerCase();
const html = (s) => esc(s).replace(/\n/g, "<br>");

async function loadCards() {
  const res = await fetch("content/flashcards/cards.json");
  if (!res.ok) throw new Error(`Failed to load flashcards: ${res.status}`);
  return (await res.json()).cards;
}

const boxOf = (id) => store.getCard(id)?.box ?? 0;

// Unseen/low-box cards first; random order inside a box.
function orderDeck(cards) {
  return cards
    .map((c) => ({ c, k: boxOf(c.id) + Math.random() * 0.99 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
}

export async function renderFlashcards(view, arg, query) {
  const [svc, all] = await Promise.all([loadServices(), loadCards()]);
  const svcById = new Map(svc.categories.flatMap((c) => c.services.map((s) => [s.id, s])));
  const st = {
    cat: query.cat || "",
    s: query.s || "",
    type: query.type || "",
    mode: MODES[query.mode] ? query.mode : "learn",
    q: query.q || "",
  };
  let deck = [];
  let pos = 0;
  let flipped = false;

  const filtered = () => {
    const q = norm(st.q).trim();
    return all.filter((c) => {
      if (st.cat && c.cat !== st.cat) return false;
      if (st.s && c.svc !== st.s) return false;
      if (st.type && c.type !== st.type) return false;
      const b = boxOf(c.id);
      if (st.mode === "learn" && b >= MAX_BOX) return false;
      if (st.mode === "mastered" && b < MAX_BOX) return false;
      if (q && !norm(`${c.q} ${c.a} ${svcById.get(c.svc)?.name}`).includes(q)) return false;
      return true;
    });
  };

  const setHash = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(st)) if (v && !(k === "mode" && v === "learn")) p.set(k, v);
    const qs = p.toString();
    history.replaceState(null, "", "#/flashcards" + (qs ? "?" + qs : ""));
  };

  const rebuild = () => {
    deck = orderDeck(filtered());
    pos = 0;
    flipped = false;
    setHash();
    draw();
  };

  view.innerHTML = `<div class="fc-root">
    <div class="map-head">
      <h1>Flashcards</h1>
      <select id="fcCat"><option value="">All categories</option>${svc.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>
      <select id="fcSvc"></select>
      <select id="fcType"><option value="">All types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select id="fcMode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <input id="fcQ" type="search" placeholder="Search cards…" />
      <button class="btn" id="fcShuffle" title="Reshuffle">Shuffle</button>
    </div>
    <div id="fcStats" class="muted fc-stats"></div>
    <div id="fcStage"></div>
  </div>`;

  const $ = (id) => view.querySelector(id);
  const fillServices = () => {
    const list = svc.categories.filter((c) => !st.cat || c.id === st.cat).flatMap((c) => c.services);
    if (st.s && !list.some((s) => s.id === st.s)) st.s = "";
    $("#fcSvc").innerHTML =
      `<option value="">All services</option>` + list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
    $("#fcSvc").value = st.s;
  };
  $("#fcCat").value = st.cat;
  fillServices();
  $("#fcType").value = st.type;
  $("#fcMode").value = st.mode;
  $("#fcQ").value = st.q;

  $("#fcCat").onchange = (e) => { st.cat = e.target.value; fillServices(); rebuild(); };
  $("#fcSvc").onchange = (e) => { st.s = e.target.value; rebuild(); };
  $("#fcType").onchange = (e) => { st.type = e.target.value; rebuild(); };
  $("#fcMode").onchange = (e) => { st.mode = e.target.value; rebuild(); };
  $("#fcQ").oninput = (e) => { st.q = e.target.value; rebuild(); };
  $("#fcShuffle").onclick = rebuild;

  function stats() {
    const scope = all.filter((c) => (!st.cat || c.cat === st.cat) && (!st.s || c.svc === st.s) && (!st.type || c.type === st.type));
    const done = scope.filter((c) => boxOf(c.id) >= MAX_BOX).length;
    const seen = scope.filter((c) => boxOf(c.id) > 0).length;
    $("#fcStats").textContent = `${deck.length ? pos + 1 : 0} / ${deck.length} in this deck · mastered ${done} of ${scope.length} · seen ${seen}`;
  }

  function draw() {
    stats();
    const stage = $("#fcStage");
    const c = deck[pos];
    if (!c) {
      stage.innerHTML = `<div class="card fc-empty"><p>No cards here${st.mode === "learn" ? " — everything in this selection is mastered 🎉" : ""}.</p>
        ${st.mode !== "all" ? `<button class="btn" id="fcAll">Show all cards</button>` : ""}</div>`;
      const b = $("#fcAll");
      if (b) b.onclick = () => { st.mode = "all"; $("#fcMode").value = "all"; rebuild(); };
      return;
    }
    const s = svcById.get(c.svc);
    const box = boxOf(c.id);
    stage.innerHTML = `
      <div class="fc-card ${flipped ? "flipped" : ""}" id="fcCard" tabindex="0" title="Click or press Space to flip">
        <div class="fc-meta"><span class="chip">${esc(TYPES[c.type])}</span> <span class="muted">${esc(s?.name || c.svc)}</span>
          <span class="fc-box" title="Leitner box">${"●".repeat(box)}${"○".repeat(MAX_BOX - box)}</span></div>
        <div class="fc-face fc-front">${html(c.q)}<div class="fc-hint muted">click to reveal</div></div>
        <div class="fc-face fc-back">${html(c.a)}
          <div class="svc-links">
            <a href="#/services/${esc(c.svc)}">Open in Services Map →</a>
            <a href="#/hub?s=${esc(c.svc)}">Hub questions →</a>
          </div>
        </div>
      </div>
      <div class="fc-actions">
        <button class="btn" id="fcPrev">← Don't know</button>
        <button class="btn fc-flip" id="fcFlip">Flip (Space)</button>
        <button class="btn fc-ok" id="fcOk">Know → </button>
      </div>
      <p class="muted fc-keys">Keys: Space = flip · → know · ← don't know (box resets to 1)</p>`;
    $("#fcCard").onclick = flip;
    $("#fcFlip").onclick = flip;
    $("#fcOk").onclick = () => answer(true);
    $("#fcPrev").onclick = () => answer(false);
  }

  function flip() {
    flipped = !flipped;
    $("#fcCard")?.classList.toggle("flipped", flipped);
  }
  function answer(known) {
    const c = deck[pos];
    if (!c) return;
    store.recordCard(c.id, known);
    flipped = false;
    if (pos + 1 < deck.length) pos++;
    else {
      deck = orderDeck(filtered());
      pos = 0;
    }
    draw();
  }

  const onKey = (e) => {
    if (!document.body.contains(view.querySelector(".fc-root"))) return document.removeEventListener("keydown", onKey);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    else if (e.key === "ArrowRight") answer(true);
    else if (e.key === "ArrowLeft") answer(false);
  };
  document.addEventListener("keydown", onKey);

  rebuild();
}
