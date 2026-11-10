import assert from "node:assert/strict";
import test from "node:test";
import { makeStore } from "../js/storage.js";

function memBackend() {
  let s = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => {
      s[k] = String(v);
    },
    removeItem: (k) => {
      delete s[k];
    },
  };
}

test("flashcard Leitner boxes: known advances (max 3), unknown resets to 1", () => {
  const store = makeStore(memBackend());
  assert.equal(store.getCard("s3:purpose"), null);
  store.recordCard("s3:purpose", true);
  assert.equal(store.getCard("s3:purpose").box, 1);
  store.recordCard("s3:purpose", true);
  store.recordCard("s3:purpose", true);
  store.recordCard("s3:purpose", true);
  assert.equal(store.getCard("s3:purpose").box, 3);
  store.recordCard("s3:purpose", false);
  assert.equal(store.getCard("s3:purpose").box, 1);
});

test("records question answers and reports correctness", () => {
  const store = makeStore(memBackend());
  store.recordQuestion("iam-q1", true);
  store.recordQuestion("iam-q2", false);
  assert.equal(store.getQuestion("iam-q1").correct, true);
  assert.equal(store.getQuestion("iam-q2").correct, false);
  assert.equal(store.getQuestion("missing"), null);
});

test("marks labs done and persists across instances", () => {
  const backend = memBackend();
  makeStore(backend).setLabDone("iam-create-role", true);
  assert.equal(makeStore(backend).isLabDone("iam-create-role"), true);
});

test("stores exam attempts and reset clears everything", () => {
  const store = makeStore(memBackend());
  store.addExamAttempt(1, { score: 800, passed: true, perDomain: {} });
  assert.equal(store.getExamAttempts(1).length, 1);
  store.reset();
  assert.equal(store.getExamAttempts(1).length, 0);
});
