export function isCorrect(question, response) {
  const ans = question.answer;
  if (Array.isArray(ans)) {
    if (!Array.isArray(response)) return false;
    const a = [...ans].sort();
    const b = [...response].sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return response === ans;
}

export function scoreExam(questions, responses, passScore = 720) {
  const perDomain = {};
  let correct = 0;
  for (const q of questions) {
    const ok = q.id in responses && isCorrect(q, responses[q.id]);
    if (ok) correct++;
    (perDomain[q.domain] ||= { correct: 0, total: 0 }).total++;
    if (ok) perDomain[q.domain].correct++;
  }
  const total = questions.length;
  const score = total ? Math.round(100 + (correct / total) * 900) : 100;
  return { correct, total, score, passed: score >= passScore, perDomain };
}

// Renders one question into a container; calls onAnswered(correct) after reveal.
export function renderQuestion(container, question, { onAnswered } = {}) {
  const multi = Array.isArray(question.answer);
  const selected = new Set();
  container.innerHTML = "";

  const stem = document.createElement("p");
  stem.className = "q-stem";
  stem.textContent = question.stem;
  container.append(stem);

  if (multi) {
    const hint = document.createElement("p");
    hint.className = "q-hint";
    hint.textContent = `(Choose ${question.answer.length})`;
    container.append(hint);
  }

  const list = document.createElement("div");
  list.className = "q-options";
  question.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "q-option";
    btn.textContent = opt;
    btn.onclick = () => {
      if (multi) {
        selected.has(i) ? selected.delete(i) : selected.add(i);
        btn.classList.toggle("sel");
      } else {
        submit(i);
      }
    };
    list.append(btn);
  });
  container.append(list);

  if (multi) {
    const go = document.createElement("button");
    go.className = "q-submit";
    go.textContent = "Submit";
    go.onclick = () => submit([...selected]);
    container.append(go);
  }

  function submit(response) {
    const correct = isCorrect(question, response);
    [...list.children].forEach((b, i) => {
      const isAns = multi ? question.answer.includes(i) : i === question.answer;
      if (isAns) b.classList.add("correct");
      const chosen = multi ? response.includes(i) : i === response;
      if (chosen && !isAns) b.classList.add("wrong");
      b.disabled = true;
    });
    const submitBtn = container.querySelector(".q-submit");
    if (submitBtn) submitBtn.remove();
    const exp = document.createElement("div");
    exp.className = "q-explain " + (correct ? "ok" : "bad");
    exp.textContent = (correct ? "✓ Correct. " : "✗ Incorrect. ") + question.explanation;
    container.append(exp);
    onAnswered?.(correct);
  }
}
