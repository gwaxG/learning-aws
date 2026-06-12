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
