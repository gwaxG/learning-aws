// Prints the service-id vocabulary of map #1 (content/maps/services.json).
//   node scripts/list-services.mjs [filter]
import { readFile } from "node:fs/promises";
const svc = JSON.parse(await readFile("content/maps/services.json", "utf8"));
const f = (process.argv[2] || "").toLowerCase();
for (const c of svc.categories)
  for (const s of c.services) {
    const line = `${s.id.padEnd(26)} ${s.name}  [${c.id}]`;
    if (!f || line.toLowerCase().includes(f) || (s.keywords || []).some((k) => k.toLowerCase().includes(f))) console.log(line);
  }
