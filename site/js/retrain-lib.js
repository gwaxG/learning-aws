// Pure helpers for #/retrain — drill over the user's own missed questions (hub cards with source.type "user").

export const MODES = { todo: "To retrain", wrong: "Wrong", known: "Known", all: "All" };

export function statusOf(rec) {
  if (!rec) return "new";
  return rec.correct ? "known" : "wrong";
}

export function buildPool(docs) {
  return docs.filter((d) => d.source?.type === "user" && d.question?.stem && Array.isArray(d.question.options));
}

const norm = (s) => String(s ?? "").toLowerCase();

export function matches(doc, status, { mode = "todo", topic = "", domain = "", q = "" } = {}) {
  if (mode === "todo" && status === "known") return false;
  if (mode === "wrong" && status !== "wrong") return false;
  if (mode === "known" && status !== "known") return false;
  if (topic && !(doc.topics || []).includes(topic)) return false;
  if (domain && String(doc.domain) !== String(domain)) return false;
  const needle = norm(q).trim();
  if (needle) {
    const hay = norm(`${doc.question.stem} ${doc.concept} ${(doc.keywords || []).join(" ")}`);
    if (!hay.includes(needle)) return false;
  }
  return true;
}

// Wrong first, then never seen, then known; random order inside each group.
export function orderQueue(items, rand = Math.random) {
  const rank = { wrong: 0, new: 1, known: 2 };
  return items
    .map((x) => ({ x, k: rank[x.status] + rand() * 0.99 }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.x);
}

export function counts(items) {
  const c = { new: 0, wrong: 0, known: 0, total: items.length };
  for (const it of items) c[it.status]++;
  return c;
}
