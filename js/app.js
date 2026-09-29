import { renderNav, renderDashboard, renderTopic, renderExamList } from "./views.js";
import { renderExam } from "./exam.js";
import { renderServices, renderHub, parseQuery } from "./maps.js";
import { renderFlashcards } from "./flashcards.js";

const view = document.getElementById("view");
const nav = document.getElementById("nav");

async function route() {
  const hash = location.hash.slice(1) || "/";
  const [path, qs] = hash.split("?");
  const [, kind, arg] = path.split("/");
  const query = parseQuery(qs);
  const wide = kind === "services" || kind === "hub";
  view.classList.toggle("wide", wide);
  view.innerHTML = `<p class="loading">Loading…</p>`;
  try {
    if (kind === "services") await renderServices(view, arg, query);
    else if (kind === "hub") await renderHub(view, arg, query);
    else if (kind === "flashcards") await renderFlashcards(view, arg, query);
    else if (kind === "topic") await renderTopic(view, arg);
    else if (kind === "exams") await renderExamList(view);
    else if (kind === "exam") await renderExam(view, arg);
    else await renderDashboard(view);
    if (!wide) window.scrollTo(0, 0);
    nav.querySelectorAll("a").forEach((a) =>
      a.classList.toggle("active", a.getAttribute("href") === "#" + (wide || kind === "flashcards" ? "/" + kind : path))
    );
  } catch (e) {
    view.innerHTML = `<div class="card"><h1>Something went wrong</h1>
      <p class="bad">${e.message}</p>
      <p>If content files are missing, author them under <code>content/</code> and reload.</p></div>`;
  }
}

const toggle = document.getElementById("navToggle");
if (toggle) toggle.onclick = () => nav.classList.toggle("open");
window.addEventListener("hashchange", () => {
  nav.classList.remove("open");
  route();
});

renderNav(nav).then(route).catch((e) => {
  view.innerHTML = `<p class="bad">Failed to load: ${e.message}</p>`;
});
