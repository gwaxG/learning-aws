const KEY = "aws-saa-trainer:v1";
const empty = () => ({ questions: {}, labs: {}, exams: {} });

// Deterministic timestamp helper that also works in the Node test env.
const now = () => (typeof Date !== "undefined" ? Date.now() : 0);

export function makeStore(backend = globalThis.localStorage) {
  const load = () => {
    try {
      return { ...empty(), ...JSON.parse(backend.getItem(KEY)) };
    } catch {
      return empty();
    }
  };
  const save = (s) => backend.setItem(KEY, JSON.stringify(s));

  return {
    recordQuestion(id, correct) {
      const s = load();
      s.questions[id] = { correct, ts: now() };
      save(s);
    },
    getQuestion(id) {
      return load().questions[id] ?? null;
    },
    setLabDone(id, done) {
      const s = load();
      s.labs[id] = !!done;
      save(s);
    },
    isLabDone(id) {
      return !!load().labs[id];
    },
    addExamAttempt(examId, result) {
      const s = load();
      (s.exams[examId] ||= []).push({ ...result, ts: now() });
      save(s);
    },
    getExamAttempts(examId) {
      return load().exams[examId] ?? [];
    },
    snapshot() {
      return load();
    },
    reset() {
      backend.removeItem(KEY);
    },
  };
}

export const store = makeStore();
