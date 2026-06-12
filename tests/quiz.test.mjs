import assert from "node:assert/strict";
import test from "node:test";
import { isCorrect, scoreExam } from "../js/quiz.js";

test("isCorrect handles single and multi answer", () => {
  assert.equal(isCorrect({ answer: 2 }, 2), true);
  assert.equal(isCorrect({ answer: 2 }, 1), false);
  assert.equal(isCorrect({ answer: [0, 2] }, [2, 0]), true);
  assert.equal(isCorrect({ answer: [0, 2] }, [0]), false);
  assert.equal(isCorrect({ answer: [0, 2] }, 0), false);
});

test("scoreExam scales to 100-1000 and computes per-domain", () => {
  const qs = [
    { id: "a", domain: 1, answer: 0 },
    { id: "b", domain: 1, answer: 1 },
    { id: "c", domain: 2, answer: 0 },
    { id: "d", domain: 2, answer: 0 },
  ];
  const responses = { a: 0, b: 0, c: 0, d: 0 }; // 3/4 correct (b wrong)
  const r = scoreExam(qs, responses, 720);
  assert.equal(r.correct, 3);
  assert.equal(r.total, 4);
  assert.equal(r.score, Math.round(100 + (3 / 4) * 900)); // 775
  assert.equal(r.passed, true);
  assert.equal(r.perDomain[1].correct, 1);
  assert.equal(r.perDomain[2].correct, 2);
});

test("scoreExam fails below pass mark", () => {
  const qs = [
    { id: "a", domain: 1, answer: 0 },
    { id: "b", domain: 1, answer: 0 },
  ];
  const r = scoreExam(qs, { a: 1, b: 1 }, 720); // 0 correct
  assert.equal(r.score, 100);
  assert.equal(r.passed, false);
});
