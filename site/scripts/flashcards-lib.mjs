// Pure helpers for the flashcards page. Cards are generated from content/maps/services.json
// (+ optional hand-written content/flashcards/extra.json). Used by build-flashcards.mjs,
// validate-content.mjs and tests.

export const TYPES = {
  purpose: "Purpose",
  reverse: "Which service?",
  when: "When to use",
  facts: "Key facts",
  cloze: "Numbers & limits",
  trap: "Not for / traps",
  vs: "Compare",
  extra: "Extra",
};

// number + unit (or "N nines"): worth a fill-in-the-blank card
const CLOZE_RE =
  /\b\d[\d,.]*(?:\s?[-–]\s?\d[\d,.]*)?\s?(?:%|nines|(?:[KMGTP]i?B|[KMGT]bps|[KMGT]iB)(?:\/s)?|ms|seconds?|minutes?|hours?|days?|weeks?|months?|years?|AZs?|Regions?|copies|shards|vCPUs?|instances?|buckets?|objects?|requests?|connections?|TPS|IOPS)\b/i;

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function generateCards(services) {
  const cards = [];
  const add = (svc, cat, type, suffix, q, a) =>
    cards.push({ id: `${svc.id}:${type}${suffix ? ":" + suffix : ""}`, svc: svc.id, cat: cat.id, type, q, a });

  for (const cat of services.categories) {
    for (const s of cat.services) {
      add(s, cat, "purpose", "", `What is ${s.name}?`, s.tagline);

      // Reverse: description -> service. Skip when the tagline leaks the name.
      const nameRe = new RegExp(escRe(s.name.replace(/^(Amazon|AWS)\s+/i, "")), "i");
      if (!nameRe.test(s.tagline))
        add(s, cat, "reverse", "", `Which ${cat.name} service/concept is this?\n“${s.tagline}”`, s.name);

      if (s.use_when?.length)
        add(s, cat, "when", "", `When would you choose ${s.name}?`, s.use_when.slice(0, 4).map((x) => "• " + x).join("\n"));

      if (s.facts?.length)
        add(s, cat, "facts", "", `${s.name}: what are the key exam facts?`, s.facts.slice(0, 6).map((x) => "• " + x).join("\n"));

      (s.facts || []).forEach((f, i) => {
        const m = f.match(CLOZE_RE);
        if (!m) return;
        const blank = f.replace(m[0], "_____");
        add(s, cat, "cloze", String(i + 1), `${s.name} — fill in the blank:\n${blank}`, `${m[0]}\n\n${f}`);
      });

      if (s.not_for?.length)
        add(s, cat, "trap", "", `When is ${s.name} NOT the right choice?`, s.not_for.slice(0, 3).map((x) => "• " + x).join("\n"));

      (s.vs || []).forEach((v) => {
        const other = services.categories.flatMap((c) => c.services).find((x) => x.id === v.id);
        add(s, cat, "vs", v.id, `${s.name} vs ${other ? other.name : v.id}: what's the difference?`, v.note);
      });
    }
  }
  return cards;
}

// Hand-written extras: [{ id, service, q, a }]; merged after generated cards.
export function mergeExtra(cards, extra, services) {
  const catOf = new Map();
  services.categories.forEach((c) => c.services.forEach((s) => catOf.set(s.id, c.id)));
  const out = [...cards];
  for (const x of extra || [])
    out.push({ id: `x:${x.id}`, svc: x.service, cat: catOf.get(x.service), type: "extra", q: x.q, a: x.a });
  return out;
}

export function checkCards(cards, services, extra = []) {
  const errs = [];
  const ids = new Set(services.categories.flatMap((c) => c.services.map((s) => s.id)));
  const seen = new Set();
  for (const x of extra) {
    if (!/^[a-z0-9-]+$/.test(x.id || "")) errs.push(`flashcard extra: bad id "${x.id}"`);
    if (!ids.has(x.service)) errs.push(`flashcard extra ${x.id}: unknown service "${x.service}"`);
    if (typeof x.q !== "string" || x.q.length < 5 || typeof x.a !== "string" || x.a.length < 1)
      errs.push(`flashcard extra ${x.id}: need q and a`);
  }
  for (const c of cards) {
    if (seen.has(c.id)) errs.push(`flashcard ${c.id}: duplicate id`);
    seen.add(c.id);
    if (!ids.has(c.svc)) errs.push(`flashcard ${c.id}: unknown service ${c.svc}`);
    if (!TYPES[c.type]) errs.push(`flashcard ${c.id}: unknown type ${c.type}`);
    if (!c.q || !c.a) errs.push(`flashcard ${c.id}: empty q/a`);
  }
  return errs;
}
export { clip };
