// Pure helpers for the question hub (map #2). Used by build-hub.mjs, validate-content.mjs and tests.

export const TOPIC_SLUGS = [
  "architecture", "iam-security", "vpc-networking", "ec2-compute", "storage", "databases",
  "integration", "serverless-containers", "monitoring", "edge-dns", "ha-dr", "cost", "data-migration",
];

const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е").trim();

// Validate one hub doc. `serviceIds` is a Set of ids from content/maps/services.json.
// `sourceQuestions` maps question id -> question (for topic/exam docs).
export function checkDoc(doc, { serviceIds, sourceQuestions, fileName } = {}) {
  const errs = [];
  const e = (m) => errs.push(`hub ${doc?.id || fileName}: ${m}`);
  if (!doc || typeof doc !== "object") return [`hub ${fileName}: not an object`];
  if (!doc.id || !/^[a-z0-9-]+$/.test(doc.id)) e("bad id (lowercase, digits, dashes)");
  if (fileName && fileName !== `${doc.id}.json`) e(`file name must be ${doc.id}.json`);
  for (const k of ["concept", "tests", "expected", "why_not"])
    if (typeof doc[k] !== "string" || doc[k].trim().length < 5) e(`missing ${k}`);
  if (!Array.isArray(doc.keywords) || doc.keywords.length < 3) e("need >= 3 keywords");
  if (!Array.isArray(doc.services) || !doc.services.length) e("need >= 1 service");
  (doc.services || []).forEach((s) => serviceIds && !serviceIds.has(s) && e(`unknown service id "${s}"`));
  (doc.topics || []).forEach((t) => !TOPIC_SLUGS.includes(t) && e(`unknown topic "${t}"`));
  if (![1, 2, 3, 4].includes(doc.domain)) e(`bad domain ${doc.domain}`);
  const src = doc.source || {};
  if (src.type === "topic" || src.type === "exam") {
    if (sourceQuestions && !sourceQuestions.has(doc.id)) e(`source question ${doc.id} not found in ${src.type} ${src.ref}`);
  } else if (src.type === "user") {
    const q = doc.question;
    if (!q || typeof q.stem !== "string" || !Array.isArray(q.options) || q.options.length < 2)
      e("user doc needs question {stem, options[], answer, explanation}");
    else {
      const n = q.options.length;
      const a = q.answer;
      const ok = Array.isArray(a) ? a.length && a.every((i) => Number.isInteger(i) && i >= 0 && i < n) : Number.isInteger(a) && a >= 0 && a < n;
      if (!ok) e(`answer out of range: ${JSON.stringify(a)}`);
    }
  } else e(`bad source.type "${src.type}"`);
  (doc.related || []).forEach((r) => typeof r !== "string" && e("related must be ids"));
  return errs;
}

// Similarity between two docs: shared services dominate, then concept, keywords, topics.
export function similarity(a, b) {
  let s = 0;
  const bs = new Set(b.services);
  a.services.forEach((x, i) => {
    if (bs.has(x)) s += i === 0 && b.services[0] === x ? 4 : 2;
  });
  if (norm(a.concept) === norm(b.concept)) s += 5;
  else if (norm(a.concept).split(":")[0] === norm(b.concept).split(":")[0]) s += 1.5;
  const bk = new Set(b.keywords.map(norm));
  a.keywords.forEach((k) => bk.has(norm(k)) && (s += 1));
  const bt = new Set(b.topics || []);
  (a.topics || []).forEach((t) => bt.has(t) && (s += 0.5));
  return s;
}

// Build the hub index consumed by the app.
// docs: raw hub docs; sourceQuestions: Map id -> question from topics/exams.
export function buildIndex(docs, sourceQuestions, { maxRelated = 6, minScore = 4 } = {}) {
  const full = docs
    .map((d) => {
      const q = d.source?.type === "user" ? d.question : sourceQuestions.get(d.id);
      return { ...d, question: q ? { stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation } : null };
    })
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

  for (const d of full) {
    const manual = (d.related || []).filter((id) => full.some((x) => x.id === id));
    const auto = full
      .filter((o) => o.id !== d.id && !manual.includes(o.id))
      .map((o) => [o.id, similarity(d, o)])
      .filter(([, s]) => s >= minScore)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, Math.max(0, maxRelated - manual.length))
      .map(([id]) => id);
    d.related = [...manual, ...auto];
  }

  const byService = {};
  const byConcept = {};
  const keywordCount = {};
  for (const d of full) {
    d.services.forEach((s) => (byService[s] ||= []).push(d.id));
    (byConcept[d.concept] ||= []).push(d.id);
    d.keywords.forEach((k) => {
      const c = (keywordCount[norm(k)] ||= { k, n: 0 });
      c.n++;
    });
  }
  const topKeywords = Object.values(keywordCount)
    .sort((a, b) => b.n - a.n || a.k.localeCompare(b.k))
    .slice(0, 60);

  return { version: 1, count: full.length, docs: full, byService, byConcept, topKeywords };
}
