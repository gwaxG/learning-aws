import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, checkDoc, similarity } from "../scripts/hub-lib.mjs";

const base = (id, extra = {}) => ({
  id,
  source: { type: "topic", ref: "storage" },
  concept: "S3 Lifecycle: storage class cascade",
  tests: "tests lifecycle",
  expected: "Standard → IA → Deep Archive",
  why_not: "others cost more",
  keywords: ["lifecycle", "Glacier", "retention"],
  services: ["s3-lifecycle", "glacier"],
  topics: ["storage"],
  domain: 4,
  ...extra,
});
const serviceIds = new Set(["s3-lifecycle", "glacier", "sqs"]);

test("checkDoc accepts a valid topic doc", () => {
  assert.deepEqual(checkDoc(base("a"), { serviceIds, sourceQuestions: new Map([["a", {}]]), fileName: "a.json" }), []);
});

test("checkDoc flags unknown service, file name and missing source question", () => {
  const errs = checkDoc(base("a", { services: ["nope"] }), { serviceIds, sourceQuestions: new Map(), fileName: "b.json" });
  assert.equal(errs.length, 3);
});

test("user docs must carry a question with a valid answer", () => {
  const d = base("u-1", { source: { type: "user", added: "2026-09-27" }, question: { stem: "?", options: ["a", "b"], answer: 5, explanation: "x" } });
  assert.match(checkDoc(d, { serviceIds })[0], /answer out of range/);
  d.question.answer = [0, 1];
  assert.deepEqual(checkDoc(d, { serviceIds }), []);
});

test("similarity favours shared primary service and identical concept", () => {
  const a = base("a"), b = base("b"), c = base("c", { concept: "SQS: DLQ", services: ["sqs"], keywords: ["DLQ", "x", "y"], topics: ["integration"] });
  assert.ok(similarity(a, b) > similarity(a, c));
  assert.equal(similarity(a, c), 0);
});

test("buildIndex merges source questions, computes related and indexes", () => {
  const src = new Map([["a", { stem: "S?", options: ["1", "2"], answer: 0, explanation: "e" }], ["b", { stem: "T?", options: ["1", "2"], answer: 1, explanation: "e" }]]);
  const user = base("u-1", { source: { type: "user" }, services: ["sqs"], concept: "SQS: DLQ", keywords: ["DLQ", "q", "z"], question: { stem: "U?", options: ["x", "y"], answer: 1, explanation: "e" } });
  const idx = buildIndex([base("b"), base("a"), user], src);
  assert.deepEqual(idx.docs.map((d) => d.id), ["a", "b", "u-1"]);
  assert.equal(idx.docs[0].question.stem, "S?");
  assert.equal(idx.docs[2].question.stem, "U?");
  assert.deepEqual(idx.docs[0].related, ["b"]);
  assert.deepEqual(idx.docs[2].related, []);
  assert.deepEqual(idx.byService.sqs, ["u-1"]);
  assert.equal(idx.byConcept["S3 Lifecycle: storage class cascade"].length, 2);
});
