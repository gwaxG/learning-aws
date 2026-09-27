// Builds content/hub/index.json from content/hub/docs/*.json + topic/exam questions.
//   node scripts/build-hub.mjs          -> validate + write index
//   node scripts/build-hub.mjs --check  -> validate + fail if index.json is stale
import { readFile, readdir, writeFile } from "node:fs/promises";
import { buildIndex, checkDoc } from "./hub-lib.mjs";

export async function loadHubInputs() {
  const manifest = JSON.parse(await readFile("content/manifest.json", "utf8"));
  const sourceQuestions = new Map();
  for (const t of manifest.topics) {
    const topic = JSON.parse(await readFile(`content/topics/${t.slug}.json`, "utf8"));
    topic.questions.forEach((q) => sourceQuestions.set(q.id, q));
  }
  for (const e of manifest.exams) {
    const exam = JSON.parse(await readFile(`content/exams/exam-${e.id}.json`, "utf8"));
    exam.questions.forEach((q) => sourceQuestions.set(q.id, q));
  }
  const services = JSON.parse(await readFile("content/maps/services.json", "utf8"));
  const serviceIds = new Set(services.categories.flatMap((c) => c.services.map((s) => s.id)));
  const files = (await readdir("content/hub/docs")).filter((f) => f.endsWith(".json")).sort();
  const docs = [];
  const errors = [];
  for (const f of files) {
    let d;
    try {
      d = JSON.parse(await readFile(`content/hub/docs/${f}`, "utf8"));
    } catch (e) {
      errors.push(`hub ${f}: bad JSON: ${e.message}`);
      continue;
    }
    errors.push(...checkDoc(d, { serviceIds, sourceQuestions, fileName: f }));
    docs.push(d);
  }
  const ids = new Set(docs.map((d) => d.id));
  docs.forEach((d) => (d.related || []).forEach((r) => !ids.has(r) && errors.push(`hub ${d.id}: related id "${r}" not found`)));
  return { docs, sourceQuestions, errors };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const { docs, sourceQuestions, errors } = await loadHubInputs();
  if (errors.length) {
    console.error(`✗ ${errors.length} hub errors:\n` + errors.join("\n"));
    process.exit(1);
  }
  const out = JSON.stringify(buildIndex(docs, sourceQuestions));
  if (process.argv.includes("--check")) {
    const cur = await readFile("content/hub/index.json", "utf8").catch(() => "");
    if (cur !== out) {
      console.error("✗ content/hub/index.json is stale — run: node scripts/build-hub.mjs");
      process.exit(1);
    }
    console.log(`✓ hub index up to date (${docs.length} docs)`);
  } else {
    await writeFile("content/hub/index.json", out);
    console.log(`✓ wrote content/hub/index.json (${docs.length} docs)`);
  }
}
