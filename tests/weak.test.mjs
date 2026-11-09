import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkWeakPoints } from "../scripts/weak-lib.mjs";

const base = () => ({
  areas: [{ id: "a", title: "A", why: "w", severity: 2, evidence: ["e"], rules: ["r"], theory: [{ topic: "t", heading: "H" }], services: ["s"] }],
  diagnostic: { asked: 2, correct: 1, results: [{ area: "a", ok: true }, { area: null, ok: false }] },
});
const ctx = [new Set(["s"]), new Map([["t", ["H"]]])];

test("valid data passes", () => assert.deepEqual(checkWeakPoints(base(), ...ctx), []));
test("unknown service, topic heading and bad counts are reported", () => {
  const d = base();
  d.areas[0].services = ["nope"];
  d.areas[0].theory = [{ topic: "t", heading: "X" }];
  d.diagnostic.correct = 2;
  const e = checkWeakPoints(d, ...ctx).join("\n");
  assert.match(e, /unknown service "nope"/);
  assert.match(e, /no essential "X"/);
  assert.match(e, /correct count/);
});
test("real weak-points file is consistent", async () => {
  const weak = JSON.parse(await readFile("content/weak/weak-points.json", "utf8"));
  const services = JSON.parse(await readFile("content/maps/services.json", "utf8"));
  const ids = new Set(services.categories.flatMap((c) => c.services.map((s) => s.id)));
  const manifest = JSON.parse(await readFile("content/manifest.json", "utf8"));
  const topics = new Map();
  for (const t of manifest.topics) topics.set(t.slug, JSON.parse(await readFile(`content/topics/${t.slug}.json`, "utf8")).essentials.map((e) => e.heading));
  assert.deepEqual(checkWeakPoints(weak, ids, topics), []);
});
