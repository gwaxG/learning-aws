// Map 1 (#/services) — AWS services mind map + cheat sheet.
// Map 2 (#/hub)      — question hub: graph of questions ↔ services with keyword highlighting.
import { loadServices, loadHub, loadManifest } from "./content.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е");
const SVGNS = "http://www.w3.org/2000/svg";
const PALETTE = ["#ff9900", "#4aa3ff", "#2ecc71", "#e056fd", "#f1c40f", "#1abc9c", "#ff6b6b", "#a29bfe", "#fd9644", "#45aaf2", "#26de81", "#fc5c65"];
const DOMAIN_COLORS = { 1: "#ff6b6b", 2: "#4aa3ff", 3: "#2ecc71", 4: "#f1c40f" };

// Replace the hash without triggering a re-render (keeps zoom/selection state).
const setHash = (h) => history.replaceState(null, "", h);

export function parseQuery(qs) {
  const out = {};
  new URLSearchParams(qs || "").forEach((v, k) => (out[k] = v));
  return out;
}

function mdLite(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

// Wheel-zoom + drag-pan on an SVG via its viewBox.
function panZoom(svg, box) {
  let vb = { ...box };
  const apply = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  apply();
  const toSvg = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return { x: vb.x + ((cx - r.left) / r.width) * vb.w, y: vb.y + ((cy - r.top) / r.height) * vb.h };
  };
  const zoom = (f, cx, cy) => {
    const p = cx === undefined ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : toSvg(cx, cy);
    const w = Math.min(box.w * 3, Math.max(box.w / 12, vb.w * f));
    const k = w / vb.w;
    vb = { x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w, h: vb.h * k };
    apply();
  };
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
  }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, vb: { ...vb }, moved: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    svg.classList.add("panning");
    vb.x = drag.vb.x - (dx / r.width) * vb.w;
    vb.y = drag.vb.y - (dy / r.height) * vb.h;
    apply();
  });
  window.addEventListener("pointerup", () => {
    if (drag?.moved) svg.dataset.justPanned = "1", setTimeout(() => delete svg.dataset.justPanned, 0);
    drag = null;
    svg.classList.remove("panning");
  });
  return {
    zoomIn: () => zoom(1 / 1.3),
    zoomOut: () => zoom(1.3),
    reset: () => ((vb = { ...box }), apply()),
    focus: (x, y, w = box.w / 3) => ((vb = { x: x - w / 2, y: y - (w * box.h) / box.w / 2, w, h: (w * box.h) / box.w }), apply()),
  };
}

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}

const zoomButtons = `<div class="map-zoom"><button data-z="in" title="Zoom in">+</button><button data-z="out" title="Zoom out">−</button><button data-z="reset" title="Reset">⟲</button></div>`;
function wireZoom(root, pz) {
  root.querySelectorAll("[data-z]").forEach((b) => (b.onclick = () => ({ in: pz.zoomIn, out: pz.zoomOut, reset: pz.reset })[b.dataset.z]()));
}

// ---------------------------------------------------------------- services

function serviceIndex(svc) {
  const list = [];
  svc.categories.forEach((c, ci) =>
    c.services.forEach((s) => list.push({ ...s, cat: c, color: PALETTE[ci % PALETTE.length] }))
  );
  const byId = new Map(list.map((s) => [s.id, s]));
  return { list, byId };
}

function serviceHaystack(s) {
  return norm([s.id, s.name, s.tagline, ...(s.keywords || []), ...(s.facts || []), ...(s.use_when || []), ...(s.not_for || [])].join(" | "));
}

function matchTerms(q) {
  return norm(q).split(",").map((t) => t.trim()).filter(Boolean);
}

export async function renderServices(view, arg, query) {
  const [svc, hub] = await Promise.all([loadServices(), loadHub().catch(() => null)]);
  const { list, byId } = serviceIndex(svc);
  const hay = new Map(list.map((s) => [s.id, serviceHaystack(s)]));
  const mode = query.view === "sheet" ? "sheet" : "map";
  let q = query.q || "";
  let selected = byId.has(arg) ? arg : null;

  view.innerHTML = `
    <div class="map-head">
      <h1>Services Map</h1>
      <div class="map-tabs">
        <a href="#/services" class="${mode === "map" ? "on" : ""}">Mind map</a>
        <a href="#/services?view=sheet" class="${mode === "sheet" ? "on" : ""}">Cheat sheet</a>
      </div>
      <input id="svcSearch" class="map-search" type="search" placeholder="Search: service, keyword, fact… (comma = OR)" value="${esc(q)}">
      <span id="svcCount" class="map-count"></span>
    </div>
    <div class="map-body">
      <div id="svcMain" class="map-main"></div>
      <aside id="svcPanel" class="map-panel"></aside>
    </div>`;
  const main = view.querySelector("#svcMain");
  const panel = view.querySelector("#svcPanel");
  const countEl = view.querySelector("#svcCount");

  const hits = () => {
    const terms = matchTerms(q);
    if (!terms.length) return null;
    return new Set(list.filter((s) => terms.some((t) => hay.get(s.id).includes(t))).map((s) => s.id));
  };

  function renderPanel() {
    const s = selected && byId.get(selected);
    if (!s) {
      panel.innerHTML = `<div class="panel-empty"><p>Click a service to open its card: key facts, when to choose it, traps and comparisons.</p>
        <p class="muted">${svc.categories.length} categories · ${list.length} services and concepts</p>
        <ul class="legend">${svc.categories.map((c, i) => `<li><span style="background:${PALETTE[i % PALETTE.length]}"></span>${esc(c.name)}</li>`).join("")}</ul></div>`;
      return;
    }
    const qn = hub?.byService?.[s.id]?.length || 0;
    const li = (arr) => (arr || []).map((x) => `<li>${mdLite(x)}</li>`).join("");
    panel.innerHTML = `
      <div class="svc-card" style="--c:${s.color}">
        <div class="svc-cat">${esc(s.cat.name)}</div>
        <h2>${esc(s.name)}</h2>
        <p class="svc-tag">${esc(s.tagline || "")}</p>
        ${s.facts?.length ? `<h4>Key facts</h4><ul>${li(s.facts)}</ul>` : ""}
        ${s.use_when?.length ? `<h4>Choose when…</h4><ul class="yes">${li(s.use_when)}</ul>` : ""}
        ${s.not_for?.length ? `<h4>Not for / traps</h4><ul class="no">${li(s.not_for)}</ul>` : ""}
        ${s.vs?.length ? `<h4>Compare</h4><ul class="vs">${s.vs.map((v) => `<li><a href="#/services/${esc(v.id)}" data-svc="${esc(v.id)}">${esc(byId.get(v.id)?.name || v.id)}</a> — ${esc(v.note)}</li>`).join("")}</ul>` : ""}
        <div class="chips">${(s.keywords || []).map((k) => `<button class="chip" data-kw="${esc(k)}">${esc(k)}</button>`).join("")}</div>
        <div class="svc-links">
          ${qn ? `<a class="btn" href="#/hub?s=${esc(s.id)}">Hub questions: ${qn} →</a>` : `<span class="muted">No hub questions yet</span>`}
          <a class="btn" href="#/flashcards?s=${esc(s.id)}&mode=all">Flashcards →</a>
          ${s.doc ? `<a href="${esc(s.doc)}" target="_blank" rel="noopener">📖 AWS documentation</a>` : ""}
        </div>
      </div>`;
    panel.querySelectorAll("[data-svc]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); select(a.dataset.svc, true); }));
    panel.querySelectorAll("[data-kw]").forEach((b) => (b.onclick = () => setQuery(b.dataset.kw)));
  }

  let mapApi = null;
  function select(id, focus) {
    selected = id;
    setHash(`#/services/${id}${mode === "sheet" ? "?view=sheet" : ""}`);
    renderPanel();
    mapApi?.update(focus);
    if (mode === "sheet") main.querySelector(`[data-card="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (window.innerWidth < 900) panel.scrollIntoView({ behavior: "smooth" });
  }

  function setQuery(v) {
    q = v;
    view.querySelector("#svcSearch").value = v;
    refresh();
  }

  function refresh() {
    const h = hits();
    countEl.textContent = h ? `found: ${h.size}` : "";
    if (mode === "map") mapApi.update();
    else drawSheet(h);
  }

  // --- mind map (radial)
  function drawMap() {
    const W = 1500, H = 1500, cx = W / 2, cy = H / 2, R1 = 240, R2 = 500;
    main.innerHTML = `<div class="map-canvas">${zoomButtons}<svg class="mindmap" preserveAspectRatio="xMidYMid meet"></svg></div>`;
    const svg = main.querySelector("svg");
    const pz = panZoom(svg, { x: 90, y: 90, w: W - 180, h: H - 180 });
    wireZoom(main, pz);
    const gEdges = el("g", {}, svg), gNodes = el("g", {}, svg);
    const gap = 2.2; // empty slots between categories
    const slots = list.length + gap * svc.categories.length;
    const step = (2 * Math.PI) / slots;
    let pos = 0;
    const svcPos = new Map();
    const catNodes = [];
    svc.categories.forEach((c, ci) => {
      const color = PALETTE[ci % PALETTE.length];
      const a0 = pos * step;
      c.services.forEach((s) => {
        const a = pos * step - Math.PI / 2;
        svcPos.set(s.id, { a, x: cx + R2 * Math.cos(a), y: cy + R2 * Math.sin(a) });
        pos++;
      });
      const a1 = (pos - 1) * step;
      const am = (a0 + a1) / 2 - Math.PI / 2;
      const cxy = { x: cx + R1 * Math.cos(am), y: cy + R1 * Math.sin(am) };
      catNodes.push({ c, color, ...cxy, a: am });
      pos += gap;
      el("path", { d: `M${cx},${cy} Q${cx + (R1 / 2) * Math.cos(am)},${cy + (R1 / 2) * Math.sin(am)} ${cxy.x},${cxy.y}`, class: "mm-edge cat", stroke: color }, gEdges);
      c.services.forEach((s) => {
        const p = svcPos.get(s.id);
        const mx = cx + ((R1 + R2) / 2) * Math.cos(p.a), my = cy + ((R1 + R2) / 2) * Math.sin(p.a);
        el("path", { d: `M${cxy.x},${cxy.y} Q${mx},${my} ${p.x},${p.y}`, class: "mm-edge", stroke: color, "data-e": s.id }, gEdges);
      });
    });
    // center
    el("circle", { cx, cy, r: 62, class: "mm-center" }, gNodes);
    const ct = el("text", { x: cx, y: cy - 4, class: "mm-center-t" }, gNodes);
    ct.textContent = "AWS";
    const ct2 = el("text", { x: cx, y: cy + 18, class: "mm-center-s" }, gNodes);
    ct2.textContent = "SAA-C03";
    // categories
    catNodes.forEach((n) => {
      const g = el("g", { class: "mm-cat", "data-cat": n.c.id }, gNodes);
      el("circle", { cx: n.x, cy: n.y, r: 9, fill: n.color }, g);
      const short = n.c.name.split(" (")[0];
      const words = short.split(" ");
      const lines = [];
      let cur = "";
      words.forEach((w) => ((cur + " " + w).trim().length > 16 ? (lines.push(cur), (cur = w)) : (cur = (cur + " " + w).trim())));
      lines.push(cur);
      const t = el("text", { x: n.x, y: n.y + 24, class: "mm-cat-t", fill: n.color }, g);
      lines.forEach((l, i) => {
        const ts = el("tspan", { x: n.x, dy: i ? 15 : 0 }, t);
        ts.textContent = l;
      });
      el("title", {}, g).textContent = n.c.name + (n.c.summary ? " — " + n.c.summary : "");
    });
    // services
    const nodeEls = new Map();
    list.forEach((s) => {
      const p = svcPos.get(s.id);
      const g = el("g", { class: "mm-svc", "data-id": s.id, tabindex: 0 }, gNodes);
      el("circle", { cx: p.x, cy: p.y, r: 6, fill: s.color }, g);
      const deg = (p.a * 180) / Math.PI;
      const flip = deg > 90 && deg < 270;
      const label = s.name.replace(/^(Amazon|AWS) /, "").replace(/ \(.*\)$/, "");
      const t = el("text", {
        x: p.x + (flip ? -12 : 12), y: p.y + 4, class: "mm-svc-t",
        transform: `rotate(${flip ? deg - 180 : deg} ${p.x} ${p.y})`,
        "text-anchor": flip ? "end" : "start",
      }, g);
      t.textContent = label.length > 34 ? label.slice(0, 33) + "…" : label;
      el("title", {}, g).textContent = `${s.name} — ${s.tagline || ""}`;
      g.onclick = () => { if (!svg.dataset.justPanned) select(s.id); };
      g.onkeydown = (e) => e.key === "Enter" && select(s.id);
      nodeEls.set(s.id, g);
    });
    mapApi = {
      update(focus) {
        const h = hits();
        svg.classList.toggle("filtering", !!h);
        nodeEls.forEach((g, id) => {
          g.classList.toggle("hit", !!h?.has(id));
          g.classList.toggle("sel", id === selected);
        });
        gEdges.querySelectorAll("[data-e]").forEach((p) => p.classList.toggle("hit", !!h?.has(p.dataset.e) || p.dataset.e === selected));
        gNodes.querySelectorAll(".mm-cat").forEach((g) => {
          const c = svc.categories.find((c) => c.id === g.dataset.cat);
          g.classList.toggle("hit", !!h && c.services.some((s) => h.has(s.id)));
        });
        if (focus && selected) { const p = svcPos.get(selected); pz.focus(p.x, p.y, 700); }
      },
    };
    mapApi.update(!!selected);
  }

  // --- cheat sheet (cards)
  function drawSheet(h) {
    main.innerHTML = svc.categories
      .map((c, ci) => {
        const items = c.services.filter((s) => !h || h.has(s.id));
        if (!items.length) return "";
        return `<section class="sheet-cat" style="--c:${PALETTE[ci % PALETTE.length]}">
          <h2>${esc(c.name)}</h2>${c.summary ? `<p class="muted">${esc(c.summary)}</p>` : ""}
          <div class="sheet-grid">${items
            .map((s) => `<div class="sheet-card ${s.id === selected ? "sel" : ""}" data-card="${esc(s.id)}">
              <h3>${esc(s.name)}</h3><p class="svc-tag">${esc(s.tagline || "")}</p>
              <ul>${(s.facts || []).slice(0, 4).map((f) => `<li>${mdLite(f)}</li>`).join("")}</ul></div>`)
            .join("")}</div></section>`;
      })
      .join("") || `<p class="muted">Nothing found.</p>`;
    main.querySelectorAll("[data-card]").forEach((d) => (d.onclick = () => select(d.dataset.card)));
  }

  let t;
  view.querySelector("#svcSearch").oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      q = e.target.value;
      refresh();
    }, 120);
  };
  if (mode === "map") drawMap();
  refresh();
  renderPanel();
  if (selected && mode === "sheet") main.querySelector(`[data-card="${selected}"]`)?.scrollIntoView({ block: "center" });
}

// ---------------------------------------------------------------- hub

let layoutCache = null;

// Deterministic force-directed layout: service hubs + question satellites.
function computeLayout(nodes, links, W, H) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = nodes.length;
  const idx = new Map(nodes.map((d, i) => [d.key, i]));
  const X = new Float64Array(n), Y = new Float64Array(n), VX = new Float64Array(n), VY = new Float64Array(n);
  nodes.forEach((d, i) => {
    X[i] = d.x0 ?? W / 2 + (rnd() - 0.5) * W * 0.6;
    Y[i] = d.y0 ?? H / 2 + (rnd() - 0.5) * H * 0.6;
  });
  const L = links.map((l) => [idx.get(l.a), idx.get(l.b), l.len, l.k]);
  const charge = nodes.map((d) => (d.type === "svc" ? 2600 : 190));
  const ITER = 260;
  for (let it = 0; it < ITER; it++) {
    const alpha = 1 - it / ITER;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = X[i] - X[j], dy = Y[i] - Y[j];
        let d2 = dx * dx + dy * dy;
        if (d2 > 90000) continue; // cutoff 300px
        if (d2 < 1) { dx = rnd() - 0.5; dy = rnd() - 0.5; d2 = 1; }
        const f = ((charge[i] + charge[j]) / 2 / d2) * alpha;
        const fx = dx * f, fy = dy * f;
        VX[i] += fx; VY[i] += fy; VX[j] -= fx; VY[j] -= fy;
      }
    }
    for (const [a, b, len, k] of L) {
      const dx = X[b] - X[a], dy = Y[b] - Y[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - len) / d) * k * alpha;
      const fx = dx * f, fy = dy * f;
      const wa = nodes[a].type === "svc" ? 0.25 : 1, wb = nodes[b].type === "svc" ? 0.25 : 1;
      VX[a] += fx * wa; VY[a] += fy * wa; VX[b] -= fx * wb; VY[b] -= fy * wb;
    }
    for (let i = 0; i < n; i++) {
      VX[i] += (W / 2 - X[i]) * 0.004 * alpha;
      VY[i] += (H / 2 - Y[i]) * 0.004 * alpha;
      X[i] += Math.max(-30, Math.min(30, VX[i]));
      Y[i] += Math.max(-30, Math.min(30, VY[i]));
      VX[i] *= 0.55; VY[i] *= 0.55;
    }
  }
  const pos = new Map();
  nodes.forEach((d, i) => pos.set(d.key, { x: X[i], y: Y[i] }));
  return pos;
}

function docHaystack(d) {
  return norm([d.id, d.concept, d.tests, d.expected, d.why_not, ...(d.keywords || []), d.question?.stem, ...(d.question?.options || [])].join(" | "));
}

function sourceLabel(d, manifest) {
  const s = d.source || {};
  if (s.type === "topic") return `Topic: ${manifest.topics.find((t) => t.slug === s.ref)?.title || s.ref}`;
  if (s.type === "exam") return `Mock Exam ${s.ref}`;
  return `My question${s.added ? " · " + s.added : ""}`;
}

export async function renderHub(view, arg, query) {
  const [hub, svc, manifest] = await Promise.all([loadHub(), loadServices(), loadManifest()]);
  const { byId: svcById } = serviceIndex(svc);
  const docs = hub.docs;
  const docById = new Map(docs.map((d) => [d.id, d]));
  const hay = new Map(docs.map((d) => [d.id, docHaystack(d)]));
  const svcHay = new Map([...svcById.values()].map((s) => [s.id, serviceHaystack(s)]));
  const usedSvc = Object.keys(hub.byService).filter((id) => svcById.has(id));

  let state = {
    q: query.q || "",
    s: query.s && svcById.has(query.s) ? query.s : "",
    topic: query.topic || "",
    src: query.src || "",
    sel: docById.has(arg) ? arg : null,
  };

  view.innerHTML = `
    <div class="map-head">
      <h1>Question Hub</h1>
      <input id="hubSearch" class="map-search" type="search" placeholder="Keyword: Multi-AZ, LEAST operational overhead, SQS… (comma = OR)" value="${esc(state.q)}">
      <select id="hubTopic"><option value="">All topics</option>${manifest.topics.map((t) => `<option value="${t.slug}" ${state.topic === t.slug ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select>
      <select id="hubSrc"><option value="">All sources</option><option value="topic">Topic practice</option><option value="exam">Mock exams</option><option value="user">My questions</option></select>
      <span id="hubCount" class="map-count"></span>
    </div>
    <div class="chips kw-cloud">${hub.topKeywords.slice(0, 32).map((k) => `<button class="chip" data-kw="${esc(k.k)}">${esc(k.k)} <small>${k.n}</small></button>`).join("")}</div>
    <div class="map-body">
      <div class="map-main"><div class="map-canvas">${zoomButtons}<svg class="hubgraph" preserveAspectRatio="xMidYMid meet"></svg><div id="hubTip" class="map-tip"></div></div>
        <div class="hub-legend"><span><i class="lg-svc"></i>service</span>${[1, 2, 3, 4].map((d) => `<span><i style="background:${DOMAIN_COLORS[d]}"></i>domain ${d}</span>`).join("")}<span><i class="lg-user"></i>my question</span></div>
      </div>
      <aside id="hubPanel" class="map-panel"></aside>
    </div>`;
  view.querySelector("#hubSrc").value = state.src;
  const svg = view.querySelector("svg");
  const panel = view.querySelector("#hubPanel");
  const tip = view.querySelector("#hubTip");
  const W = 1600, H = 1200;

  // ----- graph data + layout (cached across visits while docs unchanged)
  const sig = docs.length + ":" + docs.map((d) => d.id + d.services.join()).join("|").length;
  if (!layoutCache || layoutCache.sig !== sig) {
    const nodes = [];
    const links = [];
    const catOrder = svc.categories.map((c) => c.id);
    usedSvc.forEach((id) => {
      const s = svcById.get(id);
      const ci = catOrder.indexOf(s.cat.id);
      const a = (ci / catOrder.length) * 2 * Math.PI + (Math.random() * 0.001);
      nodes.push({ key: "s:" + id, type: "svc", x0: W / 2 + 420 * Math.cos(a) + ((id.length * 37) % 120) - 60, y0: H / 2 + 330 * Math.sin(a) + ((id.length * 53) % 120) - 60 });
    });
    docs.forEach((d, i) => {
      nodes.push({ key: "q:" + d.id, type: "q" });
      d.services.forEach((s, k) => svcById.has(s) && links.push({ a: "q:" + d.id, b: "s:" + s, len: k ? 110 : 42, k: k ? 0.03 : 0.35 }));
    });
    // seed question positions near their primary service
    const tmp = new Map(nodes.filter((n) => n.type === "svc").map((n) => [n.key, n]));
    nodes.forEach((n, i) => {
      if (n.type !== "q") return;
      const d = docById.get(n.key.slice(2));
      const hubN = tmp.get("s:" + d.services[0]);
      if (hubN) { n.x0 = hubN.x0 + ((i * 17) % 60) - 30; n.y0 = hubN.y0 + ((i * 29) % 60) - 30; }
    });
    layoutCache = { sig, pos: computeLayout(nodes, links, W, H) };
  }
  const pos = layoutCache.pos;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pos.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  const pad = 60;
  const box = { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
  const k = Math.max(1, box.w / 1500); // scale marks/labels to the graph extent
  svg.style.setProperty("--k", k);
  const pz = panZoom(svg, box);
  wireZoom(view, pz);

  const gRel = el("g", { class: "hub-rel" }, svg);
  const gEdges = el("g", {}, svg);
  const gQ = el("g", {}, svg);
  const gS = el("g", {}, svg);
  const edgeEls = [];
  docs.forEach((d) => {
    const p = pos.get("q:" + d.id);
    d.services.forEach((s, k) => {
      const ps = pos.get("s:" + s);
      if (!ps) return;
      edgeEls.push({ d: d.id, s, e: el("line", { x1: p.x, y1: p.y, x2: ps.x, y2: ps.y, class: k ? "hub-edge sec" : "hub-edge" }, gEdges) });
    });
  });
  const qEls = new Map();
  docs.forEach((d) => {
    const p = pos.get("q:" + d.id);
    const c = el("circle", {
      cx: p.x, cy: p.y, r: 5 * k, class: "hub-q" + (d.source?.type === "user" ? " user" : ""),
      fill: DOMAIN_COLORS[d.domain] || "#8aa0bd", "data-id": d.id,
    }, gQ);
    c.onclick = () => { if (!svg.dataset.justPanned) selectDoc(d.id); };
    c.onmouseenter = (e) => showTip(e, `<b>${esc(d.concept)}</b><br><span class="muted">${esc(d.id)} · ${esc(sourceLabel(d, manifest))}</span>`);
    c.onmouseleave = hideTip;
    qEls.set(d.id, c);
  });
  const sEls = new Map();
  usedSvc.forEach((id) => {
    const s = svcById.get(id);
    const p = pos.get("s:" + id);
    const n = hub.byService[id].length;
    const g = el("g", { class: "hub-svc", "data-id": id }, gS);
    const rr = k * (8 + Math.min(14, Math.sqrt(n) * 2.6));
    el("circle", { cx: p.x, cy: p.y, r: rr, fill: s.color }, g);
    const t = el("text", { x: p.x, y: p.y - rr - 5 * k, "font-size": 13 * k }, g);
    t.textContent = s.name.replace(/^(Amazon|AWS) /, "").replace(/ \(.*\)$/, "");
    g.onclick = () => { if (!svg.dataset.justPanned) setState({ s: state.s === id ? "" : id, sel: null }); };
    g.onmouseenter = (e) => showTip(e, `<b>${esc(s.name)}</b><br>${esc(s.tagline || "")}<br><span class="muted">questions: ${n} · click to filter</span>`);
    g.onmouseleave = hideTip;
    sEls.set(id, g);
  });

  function showTip(e, html) {
    const r = svg.parentElement.getBoundingClientRect();
    tip.innerHTML = html;
    tip.style.left = Math.min(r.width - 260, e.clientX - r.left + 14) + "px";
    tip.style.top = e.clientY - r.top + 14 + "px";
    tip.classList.add("on");
  }
  function hideTip() { tip.classList.remove("on"); }

  // ----- matching
  function compute() {
    const terms = matchTerms(state.q);
    const svcTermHits = new Set(terms.length ? usedSvc.filter((id) => terms.some((t) => svcHay.get(id).includes(t) || norm(svcById.get(id).name) === t)) : []);
    const pass = (d) =>
      (!state.topic || (d.topics || []).includes(state.topic) || d.source?.ref === state.topic) &&
      (!state.src || d.source?.type === state.src) &&
      (!state.s || d.services.includes(state.s));
    const filtered = docs.filter(pass);
    const active = !!(terms.length || state.topic || state.src || state.s);
    const scored = filtered
      .map((d) => {
        let sc = 0;
        if (terms.length) {
          const h = hay.get(d.id);
          terms.forEach((t) => {
            if (d.keywords.some((k) => norm(k).includes(t))) sc += 3;
            if (norm(d.concept).includes(t)) sc += 3;
            if (h.includes(t)) sc += 1;
          });
          d.services.forEach((s) => svcTermHits.has(s) && (sc += 1));
        } else sc = 1;
        return [d, sc];
      })
      .filter(([, sc]) => sc > 0)
      .sort((a, b) => b[1] - a[1] || a[0].id.localeCompare(b[0].id, "en", { numeric: true }));
    const strong = scored.filter(([, sc]) => sc >= 3);
    const hitIds = new Set((terms.length && strong.length ? strong : scored).map(([d]) => d.id));
    const weakIds = new Set(scored.map(([d]) => d.id).filter((id) => !hitIds.has(id)));
    return { active, scored, hitIds, weakIds };
  }

  function paint() {
    const { active, scored, hitIds, weakIds } = compute();
    const sel = state.sel && docById.get(state.sel);
    const near = new Set();
    const hotSvc = new Set();
    if (sel) { sel.related.forEach((r) => near.add(r)); sel.services.forEach((s) => hotSvc.add(s)); }
    if (active) {
      weakIds.forEach((id) => near.add(id));
      hitIds.forEach((id) => docById.get(id).services.forEach((s) => hotSvc.add(s)));
      if (hitIds.size <= 40) hitIds.forEach((id) => docById.get(id).related.forEach((r) => !hitIds.has(r) && near.add(r)));
    }
    const dimming = active || !!sel;
    svg.classList.toggle("filtering", dimming);
    qEls.forEach((c, id) => {
      c.classList.toggle("hit", active && hitIds.has(id));
      c.classList.toggle("near", near.has(id) && !(active && hitIds.has(id)));
      c.classList.toggle("sel", id === state.sel);
      c.setAttribute("r", k * (id === state.sel ? 10 : active && hitIds.has(id) ? 7 : near.has(id) ? 6 : 5));
    });
    sEls.forEach((g, id) => {
      g.classList.toggle("hit", hotSvc.has(id));
      g.classList.toggle("sel", id === state.s);
    });
    edgeEls.forEach(({ d, s, e }) => e.classList.toggle("hit", (active && hitIds.has(d) && hotSvc.has(s)) || d === state.sel));
    // related links (question ↔ question) for selection and small hit sets
    gRel.innerHTML = "";
    const relFrom = sel ? [sel] : active && hitIds.size <= 40 ? [...hitIds].map((id) => docById.get(id)) : [];
    relFrom.forEach((d) => {
      const a = pos.get("q:" + d.id);
      d.related.forEach((r) => {
        const b = pos.get("q:" + r);
        if (b) el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "hub-rel-line" }, gRel);
      });
    });
    view.querySelector("#hubCount").textContent = active ? `matches: ${hitIds.size}${weakIds.size ? ` (+${weakIds.size} text mentions)` : ""} of ${docs.length}` : `${docs.length} questions · ${usedSvc.length} services`;
    view.querySelectorAll(".kw-cloud [data-kw]").forEach((b) => b.classList.toggle("on", matchTerms(state.q).includes(norm(b.dataset.kw))));
    renderPanel(scored, active, hitIds);
  }

  function listItem(d) {
    return `<li><a href="#/hub/${esc(d.id)}" data-doc="${esc(d.id)}"><span class="dot" style="background:${DOMAIN_COLORS[d.domain]}"></span>${esc(d.concept)}</a><small>${esc(d.id)}</small></li>`;
  }

  function renderPanel(scored, active, hitIds) {
    const d = state.sel && docById.get(state.sel);
    if (!d) {
      const filt = [state.s && `service: <b>${esc(svcById.get(state.s)?.name)}</b>`, state.topic && `topic: <b>${esc(manifest.topics.find((t) => t.slug === state.topic)?.title)}</b>`, state.src && `source: <b>${esc(state.src)}</b>`].filter(Boolean);
      panel.innerHTML = active
        ? `<div class="hub-list"><h3>Matches (${hitIds.size})</h3>
            ${filt.length ? `<p class="muted">${filt.join(" · ")} <button class="linkish" id="clearF">clear filters</button></p>` : ""}
            <ul>${scored.filter(([x]) => hitIds.has(x.id)).slice(0, 200).map(([x]) => listItem(x)).join("") || "<li class='muted'>Nothing found.</li>"}</ul>
            ${scored.length > hitIds.size ? `<h4>Mentioned in question text (${scored.length - hitIds.size})</h4><ul class="weak">${scored.filter(([x]) => !hitIds.has(x.id)).slice(0, 150).map(([x]) => listItem(x)).join("")}</ul>` : ""}</div>`
        : `<div class="panel-empty"><p>Type a keyword or pick a chip — related questions and services light up on the graph.</p>
            <p>Click a question to open its card: concept, expected answer, links. Click a service to filter.</p>
            <h4>Most frequent concepts</h4>
            <ul class="concepts">${Object.entries(hub.byConcept).filter(([, ids]) => ids.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 25).map(([c, ids]) => `<li><button class="linkish" data-concept="${esc(c)}">${esc(c)}</button> <small>×${ids.length}</small></li>`).join("")}</ul></div>`;
      panel.querySelector("#clearF")?.addEventListener("click", () => setState({ s: "", topic: "", src: "" }));
      panel.querySelectorAll("[data-concept]").forEach((b) => (b.onclick = () => setQuery(b.dataset.concept)));
    } else {
      const q = d.question;
      const multi = Array.isArray(q?.answer);
      const isAns = (i) => (multi ? q.answer.includes(i) : q.answer === i);
      const srcLink = d.source?.type === "topic" ? `#/topic/${d.source.ref}` : d.source?.type === "exam" ? `#/exam/${d.source.ref}` : null;
      panel.innerHTML = `
        <div class="doc">
          <div class="doc-top"><button class="linkish" id="back">← back to list</button><span class="muted">${esc(d.id)} · ${srcLink ? `<a href="${srcLink}">${esc(sourceLabel(d, manifest))}</a>` : esc(sourceLabel(d, manifest))} · domain ${d.domain}</span></div>
          <h2>${esc(d.concept)}</h2>
          ${q ? `<p class="q-stem">${esc(q.stem)}</p>${multi ? `<p class="q-hint">(Choose ${q.answer.length})</p>` : ""}
            <div class="q-options">${q.options.map((o, i) => `<button class="q-option" data-opt="${i}">${esc(o)}</button>`).join("")}</div>
            <button class="ghost" id="reveal">Show answer and analysis</button>` : `<p class="bad">Source question not found.</p>`}
          <div id="analysis" class="doc-analysis" hidden>
            <h4>Tested concept</h4><p>${mdLite(d.tests)}</p>
            <h4>Expected answer</h4><p>${mdLite(d.expected)}</p>
            <h4>Why not the others</h4><p>${mdLite(d.why_not)}</p>
            ${q?.explanation ? `<details><summary>Source explanation</summary><p>${mdLite(q.explanation)}</p></details>` : ""}
          </div>
          <h4>Keywords</h4><div class="chips">${d.keywords.map((k) => `<button class="chip" data-kw="${esc(k)}">${esc(k)}</button>`).join("")}</div>
          <h4>Services</h4><div class="chips">${d.services.map((s) => `<a class="chip svc" style="--c:${svcById.get(s)?.color}" href="#/services/${esc(s)}">${esc(svcById.get(s)?.name || s)}</a>`).join("")}</div>
          ${d.related.length ? `<h4>Related questions</h4><ul class="hub-list-ul">${d.related.map((r) => docById.get(r)).filter(Boolean).map(listItem).join("")}</ul>` : ""}
        </div>`;
      panel.querySelector("#back").onclick = () => setState({ sel: null });
      let answered = false;
      const reveal = (chosen) => {
        if (answered) return;
        answered = true;
        panel.querySelectorAll("[data-opt]").forEach((b) => {
          const i = +b.dataset.opt;
          if (isAns(i)) b.classList.add("correct");
          if (chosen?.has(i) && !isAns(i)) b.classList.add("wrong");
          b.disabled = true;
        });
        panel.querySelector("#analysis").hidden = false;
        panel.querySelector("#reveal")?.remove();
      };
      const chosen = new Set();
      panel.querySelectorAll("[data-opt]").forEach((b) => (b.onclick = () => {
        const i = +b.dataset.opt;
        if (multi) {
          chosen.has(i) ? chosen.delete(i) : chosen.add(i);
          b.classList.toggle("sel");
          if (chosen.size === q.answer.length) reveal(chosen);
        } else { chosen.add(i); reveal(chosen); }
      }));
      panel.querySelector("#reveal")?.addEventListener("click", () => reveal(chosen));
    }
    panel.querySelectorAll("[data-doc]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); selectDoc(a.dataset.doc); }));
    panel.querySelectorAll("[data-kw]").forEach((b) => (b.onclick = () => setQuery(b.dataset.kw)));
  }

  function syncHash() {
    const p = new URLSearchParams();
    ["q", "s", "topic", "src"].forEach((k) => state[k] && p.set(k, state[k]));
    const qs = p.toString();
    setHash(`#/hub${state.sel ? "/" + state.sel : ""}${qs ? "?" + qs : ""}`);
  }
  function setState(patch) {
    state = { ...state, ...patch };
    syncHash();
    paint();
  }
  function setQuery(v) {
    view.querySelector("#hubSearch").value = v;
    setState({ q: v, sel: null });
  }
  function selectDoc(id) {
    setState({ sel: id });
    const p = pos.get("q:" + id);
    if (p) pz.focus(p.x, p.y, box.w / 2.2);
    if (window.innerWidth < 900) panel.scrollIntoView({ behavior: "smooth" });
  }

  let t;
  view.querySelector("#hubSearch").oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => setState({ q: e.target.value, sel: null }), 150);
  };
  view.querySelector("#hubTopic").onchange = (e) => setState({ topic: e.target.value });
  view.querySelector("#hubSrc").onchange = (e) => setState({ src: e.target.value });
  view.querySelectorAll(".kw-cloud [data-kw]").forEach((b) => (b.onclick = () => {
    const on = matchTerms(state.q).includes(norm(b.dataset.kw));
    setQuery(on ? "" : b.dataset.kw);
  }));
  paint();
  if (state.sel) { const p = pos.get("q:" + state.sel); if (p) pz.focus(p.x, p.y, box.w / 2.2); }
}
