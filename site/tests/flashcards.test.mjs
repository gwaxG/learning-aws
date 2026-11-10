import assert from "node:assert/strict";
import test from "node:test";
import { generateCards, checkCards, mergeExtra } from "../scripts/flashcards-lib.mjs";

const svc = {
  categories: [
    {
      id: "storage",
      name: "Storage",
      services: [
        {
          id: "s3", name: "Amazon S3", tagline: "Object storage with 11 nines durability",
          facts: ["Durability 99.999999999% (11 nines)", "Max object size 5 TB", "Bucket names are global"],
          use_when: ["Static website hosting"], not_for: ["Block storage for an OS volume"],
          vs: [{ id: "ebs", note: "EBS is block storage attached to one instance" }], keywords: ["s3"],
        },
        { id: "ebs", name: "Amazon EBS", tagline: "Block volumes for EC2", facts: ["Single AZ"], use_when: [], vs: [], keywords: ["ebs"] },
      ],
    },
  ],
};

test("generates all card types with stable ids", () => {
  const cards = generateCards(svc);
  const ids = cards.map((c) => c.id);
  for (const id of ["s3:purpose", "s3:reverse", "s3:when", "s3:facts", "s3:trap", "s3:vs:ebs", "s3:cloze:2"])
    assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(checkCards(cards, svc), []);
});

test("cloze masks the number and keeps the full fact on the back", () => {
  const c = generateCards(svc).find((x) => x.id === "s3:cloze:2");
  assert.match(c.q, /Max object size _____/);
  assert.match(c.a, /^5 TB/);
});

test("reverse card is skipped when the tagline leaks the name; empty when_/trap skipped", () => {
  const leak = { categories: [{ id: "c", name: "C", services: [{ id: "x", name: "Amazon Foo", tagline: "Foo is great", facts: ["a"], keywords: ["x"] }] }] };
  const ids = generateCards(leak).map((c) => c.id);
  assert.ok(!ids.includes("x:reverse") && !ids.includes("x:when") && !ids.includes("x:trap"));
});

test("extra cards merge and are validated", () => {
  const extra = [{ id: "s3-limit", service: "s3", q: "Multipart upload required above?", a: "5 GB single PUT" }];
  const cards = mergeExtra(generateCards(svc), extra, svc);
  assert.ok(cards.some((c) => c.id === "x:s3-limit" && c.cat === "storage"));
  assert.deepEqual(checkCards(cards, svc, extra), []);
  assert.ok(checkCards(cards, svc, [{ id: "Bad", service: "nope", q: "?", a: "" }]).length >= 2);
});
