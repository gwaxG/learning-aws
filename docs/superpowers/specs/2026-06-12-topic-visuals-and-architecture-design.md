# Topic visuals, AWS doc links & DDIA architecture topic

Date: 2026-06-12

## Goal

Improve the AWS SAA-C03 trainer's topic pages with:
1. **Visual schemas** — hand-authored, offline, dark-theme SVG diagrams.
2. **Official AWS documentation links** per essential section.
3. A new cross-cutting topic **Architecture & Data-Intensive Design**, grounding *Designing
   Data-Intensive Applications* (DDIA) principles in concrete AWS services.

The app stays a dependency-free, build-step-free, offline static site. No hotlinked images.

## Schema changes (all optional, backward-compatible)

In `content/topics/<slug>.json`, each `essentials[]` entry may add:

- `links`: `[{ "label": string, "url": string }]` — official AWS doc links for that section.
- `diagram`: `{ "src": string, "caption": string }` — `src` is a filename under
  `content/diagrams/`; the SVG is fetched and inlined.

A topic may also add a top-level optional `references`: same shape as `links`, rendered once
at the page bottom.

Diagrams are standalone files in `content/diagrams/*.svg`, authored as dark-theme SVG using the
site palette (navy `#16263d`/`#1d3150`, orange `#ff9900`, blue `#4aa3ff`, text `#e8eef6`).

## Renderer & styling

- `js/views.js` `renderTopic`: after each essential's body, render its `diagram` (as a
  `<figure class="diagram">` with inlined SVG + `<figcaption>`) and its `links` (as a compact
  `.doc-links` list). Render optional topic `references` at the page bottom.
- Diagrams are fetched via a small `loadDiagram(src)` helper in `js/content.js` and inlined as
  markup (not `<img>`), so they inherit theme and scale responsively.
- `css/styles.css`: add `.diagram`, `.diagram figcaption`, `.doc-links`, `.refs`.

## Validator

`scripts/validate-content.mjs`: for each essential, if `links` present, each entry must have
non-empty `label` + `url`; if `diagram` present, `diagram.src` must name a file that exists in
`content/diagrams/` and have a non-empty `caption`. Same `links` check for topic `references`.

## New topic: `architecture`

- Manifest entry placed **first** in `topics`: `{ "slug": "architecture",
  "title": "Architecture & Data-Intensive Design", "domains": [2, 3] }`.
- `content/topics/architecture.json` — full topic: essentials + labs + ≥6 questions.
- Essentials map DDIA → AWS: reliability/scalability/maintainability; replication
  (leader-follower, multi-leader, quorum) → RDS/Aurora/DynamoDB global tables; partitioning →
  DynamoDB partition keys & hot partitions; consistency (strong vs eventual) → S3, DynamoDB;
  batch vs stream → Glue/EMR vs Kinesis/MSK + Lambda.
- Diagrams (in `content/diagrams/`): layered data-intensive reference architecture, replication
  topologies, partitioning/sharding, batch-vs-stream pipeline.
- Doc links to official AWS docs on each essential.

## Diagram coverage

- New `architecture` topic: 4 diagrams.
- Existing topics enhanced with 1 diagram each: `vpc-networking`, `storage`, `ha-dr`.
- AWS doc links added to all essentials of the above topics (others unchanged this pass).

## Verification

1. `node scripts/validate-content.mjs` → passes (incl. new diagram/link checks).
2. `node --test` → passes.
3. Serve locally and load `#/topic/architecture` + an enhanced topic; confirm diagrams and doc
   links render, theme intact, no console errors.
