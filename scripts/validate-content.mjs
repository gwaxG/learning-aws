import { readFile, access } from "node:fs/promises";

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const fileExists = (p) =>
  access(p).then(
    () => true,
    () => false
  );

function checkLinks(where, links) {
  if (links === undefined) return;
  if (!Array.isArray(links)) return err(where, "links must be an array");
  links.forEach((l, i) => {
    if (!l || typeof l.label !== "string" || !l.label) err(where, `link[${i}] missing label`);
    if (!l || typeof l.url !== "string" || !/^https?:\/\//.test(l.url)) err(where, `link[${i}] bad url`);
  });
}

async function checkDiagram(where, diagram) {
  if (diagram === undefined) return;
  if (typeof diagram.src !== "string" || !diagram.src) return err(where, "diagram missing src");
  if (typeof diagram.caption !== "string" || !diagram.caption) err(where, "diagram missing caption");
  if (!(await fileExists(`content/diagrams/${diagram.src}`)))
    err(where, `diagram file not found: ${diagram.src}`);
}

function checkQuestion(where, q) {
  if (!q.id) err(where, "missing id");
  if (typeof q.stem !== "string" || !q.stem) err(where, "missing stem");
  if (!Array.isArray(q.options) || q.options.length < 2) err(where, "needs >=2 options");
  if (typeof q.explanation !== "string" || !q.explanation) err(where, "missing explanation");
  if (![1, 2, 3, 4].includes(q.domain)) err(where, `bad domain ${q.domain}`);
  const ans = q.answer;
  const n = q.options?.length ?? 0;
  const ok = Array.isArray(ans)
    ? ans.length > 0 && ans.every((i) => Number.isInteger(i) && i >= 0 && i < n)
    : Number.isInteger(ans) && ans >= 0 && ans < n;
  if (!ok) err(where, `answer out of range: ${JSON.stringify(ans)}`);
}

const manifest = JSON.parse(await readFile("content/manifest.json", "utf8"));
const ids = new Set();

for (const t of manifest.topics) {
  const where = `topic ${t.slug}`;
  let topic;
  try {
    topic = JSON.parse(await readFile(`content/topics/${t.slug}.json`, "utf8"));
  } catch (e) {
    err(where, `cannot read/parse: ${e.message}`);
    continue;
  }
  if (!Array.isArray(topic.essentials) || !topic.essentials.length) err(where, "no essentials");
  for (const e of topic.essentials || []) {
    checkLinks(`${where} essential "${e.heading || "?"}"`, e.links);
    await checkDiagram(`${where} essential "${e.heading || "?"}"`, e.diagram);
  }
  checkLinks(`${where} references`, topic.references);
  if (!Array.isArray(topic.labs) || !topic.labs.length) err(where, "no labs");
  (topic.labs || []).forEach((l) => {
    if (!l.id || !l.cli || !l.pulumi) err(where, `lab ${l.id || "?"} incomplete`);
  });
  if (!Array.isArray(topic.questions) || topic.questions.length < 6) err(where, "need >=6 questions");
  (topic.questions || []).forEach((q) => {
    checkQuestion(`${where} ${q.id}`, q);
    if (ids.has(q.id)) err(where, `duplicate id ${q.id}`);
    ids.add(q.id);
  });
}

for (const e of manifest.exams) {
  const where = `exam ${e.id}`;
  let exam;
  try {
    exam = JSON.parse(await readFile(`content/exams/exam-${e.id}.json`, "utf8"));
  } catch (e2) {
    err(where, `cannot read/parse: ${e2.message}`);
    continue;
  }
  if (!Array.isArray(exam.questions) || exam.questions.length !== e.questions)
    err(where, `expected ${e.questions} questions, got ${exam.questions?.length}`);
  (exam.questions || []).forEach((q) => {
    checkQuestion(`${where} ${q.id}`, q);
    if (ids.has(q.id)) err(where, `duplicate id ${q.id}`);
    ids.add(q.id);
  });
}

if (errors.length) {
  console.error(`✗ ${errors.length} content errors:\n` + errors.join("\n"));
  process.exit(1);
}
console.log("✓ All content valid");
