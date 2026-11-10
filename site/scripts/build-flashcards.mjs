// Builds content/flashcards/cards.json from content/maps/services.json (+ content/flashcards/extra.json).
//   node scripts/build-flashcards.mjs          -> validate + write
//   node scripts/build-flashcards.mjs --check  -> validate + fail if cards.json is stale
import { readFile, writeFile } from "node:fs/promises";
import { generateCards, mergeExtra, checkCards } from "./flashcards-lib.mjs";

export async function buildFlashcards() {
  const services = JSON.parse(await readFile("content/maps/services.json", "utf8"));
  const extra = JSON.parse(await readFile("content/flashcards/extra.json", "utf8").catch(() => "[]"));
  const cards = mergeExtra(generateCards(services), extra, services);
  const errors = checkCards(cards, services, extra);
  return { cards, errors, json: JSON.stringify({ version: 1, count: cards.length, cards }) };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const { cards, errors, json } = await buildFlashcards();
  if (errors.length) {
    console.error(`✗ ${errors.length} flashcard errors:\n` + errors.join("\n"));
    process.exit(1);
  }
  if (process.argv.includes("--check")) {
    const cur = await readFile("content/flashcards/cards.json", "utf8").catch(() => "");
    if (cur !== json) {
      console.error("✗ content/flashcards/cards.json is stale — run: node scripts/build-flashcards.mjs");
      process.exit(1);
    }
    console.log(`✓ flashcards up to date (${cards.length} cards)`);
  } else {
    await writeFile("content/flashcards/cards.json", json);
    console.log(`✓ wrote content/flashcards/cards.json (${cards.length} cards)`);
  }
}
