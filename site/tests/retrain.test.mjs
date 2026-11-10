import assert from "node:assert/strict";
import test from "node:test";
import { buildPool, matches, orderQueue, counts, statusOf } from "../js/retrain-lib.js";

const doc = (id, type, extra = {}) => ({
  id,
  source: { type },
  question: { stem: `stem ${id}`, options: ["a", "b"], answer: 0, explanation: "" },
  concept: `concept ${id}`,
  topics: ["storage"],
  domain: 1,
  ...extra,
});

test("pool keeps only user questions", () => {
  const pool = buildPool([doc("u-1", "user"), doc("e1-q1", "exam"), doc("s-1", "topic")]);
  assert.deepEqual(pool.map((d) => d.id), ["u-1"]);
});

test("status and mode filtering", () => {
  assert.equal(statusOf(null), "new");
  assert.equal(statusOf({ correct: true }), "known");
  assert.equal(statusOf({ correct: false }), "wrong");
  const d = doc("u-1", "user");
  assert.equal(matches(d, "known", { mode: "todo" }), false);
  assert.equal(matches(d, "wrong", { mode: "todo" }), true);
  assert.equal(matches(d, "new", { mode: "wrong" }), false);
  assert.equal(matches(d, "known", { mode: "known" }), true);
  assert.equal(matches(d, "known", { mode: "all" }), true);
});

test("topic, domain and text filters", () => {
  const d = doc("u-1", "user", { keywords: ["Glacier"] });
  assert.equal(matches(d, "new", { mode: "all", topic: "cost" }), false);
  assert.equal(matches(d, "new", { mode: "all", topic: "storage", domain: "1" }), true);
  assert.equal(matches(d, "new", { mode: "all", domain: "2" }), false);
  assert.equal(matches(d, "new", { mode: "all", q: "glacier" }), true);
  assert.equal(matches(d, "new", { mode: "all", q: "nothing" }), false);
});

test("queue puts wrong first, then new, then known; counts add up", () => {
  const items = [
    { d: 1, status: "known" },
    { d: 2, status: "new" },
    { d: 3, status: "wrong" },
  ];
  assert.deepEqual(orderQueue(items, () => 0).map((x) => x.status), ["wrong", "new", "known"]);
  assert.deepEqual(counts(items), { new: 1, wrong: 1, known: 1, total: 3 });
});
