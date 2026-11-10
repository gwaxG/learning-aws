// Weak-points map checks. Pure and unit-tested.
export function checkWeakPoints(data, serviceIds, topics) {
  const errors = [];
  const err = (m) => errors.push(`content/weak/weak-points.json: ${m}`);
  const ids = new Set();
  for (const a of data.areas ?? []) {
    if (!a.id || ids.has(a.id)) err(`duplicate or missing area id "${a.id}"`);
    ids.add(a.id);
    if (![1, 2, 3].includes(a.severity)) err(`${a.id}: severity must be 1, 2 or 3`);
    for (const k of ["title", "why"]) if (!a[k]) err(`${a.id}: missing ${k}`);
    for (const k of ["evidence", "rules", "theory", "services"]) if (!a[k]?.length) err(`${a.id}: empty ${k}`);
    for (const s of a.services ?? []) if (!serviceIds.has(s)) err(`${a.id}: unknown service "${s}"`);
    for (const t of a.theory ?? []) {
      const heads = topics.get(t.topic);
      if (!heads) err(`${a.id}: unknown topic "${t.topic}"`);
      else if (!heads.includes(t.heading)) err(`${a.id}: topic ${t.topic} has no essential "${t.heading}"`);
    }
  }
  const d = data.diagnostic;
  if (d) {
    if (d.results.length !== d.asked) err(`diagnostic: asked=${d.asked} but ${d.results.length} results`);
    if (d.results.filter((r) => r.ok).length !== d.correct) err(`diagnostic: correct count does not match results`);
    for (const r of d.results) if (r.area && !ids.has(r.area)) err(`diagnostic: unknown area "${r.area}"`);
  }
  return errors;
}
