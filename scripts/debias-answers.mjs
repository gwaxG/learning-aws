// One-shot: spread correct-answer positions evenly by shuffling each question's
// options deterministically (seeded by question id) and remapping the answer.
// Skips questions whose explanation/stem references option letters positionally.
import { readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("content/manifest.json", "utf8"));
const files = [
  ...manifest.topics.map((t) => `content/topics/${t.slug}.json`),
  ...manifest.exams.map((e) => `content/exams/exam-${e.id}.json`),
];

const positional = /\b(option|choice|answer)s?\s+["']?[A-D]["']?\b/i;

function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffledIndices(n, rng) {
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx; // idx[newPos] = oldPos
}

let changed = 0,
  skipped = 0;

for (const f of files) {
  const data = JSON.parse(await readFile(f, "utf8"));
  for (const q of data.questions) {
    if (positional.test(q.explanation) || positional.test(q.stem)) {
      skipped++;
      continue;
    }
    const n = q.options.length;
    const rng = mulberry32(hash(q.id));
    const order = shuffledIndices(n, rng); // newPos -> oldPos
    const oldToNew = new Map(order.map((oldPos, newPos) => [oldPos, newPos]));

    const correctOldText = Array.isArray(q.answer)
      ? q.answer.map((i) => q.options[i])
      : q.options[q.answer];

    q.options = order.map((oldPos) => q.options[oldPos]);
    q.answer = Array.isArray(q.answer)
      ? q.answer.map((i) => oldToNew.get(i)).sort((a, b) => a - b)
      : oldToNew.get(q.answer);

    // Verify text preserved
    const newText = Array.isArray(q.answer)
      ? q.answer.map((i) => q.options[i])
      : q.options[q.answer];
    const ok = Array.isArray(q.answer)
      ? JSON.stringify([...correctOldText].sort()) === JSON.stringify([...newText].sort())
      : correctOldText === newText;
    if (!ok) throw new Error(`Answer text mismatch on ${q.id}`);
    changed++;
  }
  await writeFile(f, JSON.stringify(data, null, 2) + "\n");
}

console.log(`Shuffled ${changed} questions, skipped ${skipped} (positional refs).`);
