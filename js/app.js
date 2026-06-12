import { renderNav, renderDashboard, renderTopic, renderExamList } from "./views.js";
import { renderExam } from "./exam.js";

const view = document.getElementById("view");
const nav = document.getElementById("nav");

async function route() {
  const hash = location.hash.slice(1) || "/";
  const [, kind, arg] = hash.split("/");
  view.innerHTML = `<p class="loading">Loading…</p>`;
  try {
    if (kind === "topic") await renderTopic(view, arg);
    else if (kind === "exams") await renderExamList(view);
    else if (kind === "exam") await renderExam(view, arg);
    else await renderDashboard(view);
    window.scrollTo(0, 0);
    nav.querySelectorAll("a").forEach((a) =>
      a.classList.toggle("active", a.getAttribute("href") === "#" + hash)
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
