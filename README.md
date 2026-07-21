# Skewbiks.com

A static site for Skewb solving and learning — a sister project of
[pyraminx.net](https://pyraminx.net) (forked from
[pyraminx-oo](https://github.com/Harsha-Paladugu/pyraminx-oo), kept as the
`upstream` remote so shared-layer fixes stay cherry-pickable). Five pages share
one Skewb engine and one set of UI layers; the only build step compiles the
algorithm data and bundles the trainer. No server, no framework — everything
runs as plain `<script>` tags.

The Pyraminx→Skewb port is **complete** (milestones M0–M7; history in
[docs/port-plan.md](docs/port-plan.md)): engine, renderer, census, algorithm
data, trainer, and solver are all Skewb.

| Page | Files | What it is |
| --- | --- | --- |
| Home | `index.html` | landing page |
| OO | `oo.html` + `js/oo.js` | "objectively optimal" census — one best human solution for each of 132,315 positions (all 24 rotations folded; mirrors counted separately, shown side-by-side as 66,321 pages), plus a centers-first (CF) browse scope |
| Solver | `solver.html` + `js/solver.js`, `js/solver-core.js` | movecount-only method solver: first layer → TCLL / EG2 finishes drawn from the imported method sheets, reconstruction printed in Rubik'skewb (NS) notation |
| Trainer | `trainer.html` + `js/trainer.js` | Skewb trainer (algorithm drills, recognition quiz, one-look prediction), bundled from `src/trainer/` — see [src/trainer/README.md](src/trainer/README.md) |
| Algorithms | `algs.html` + `js/algs.js` | browse/search every subset & case in the community's sheet-style case diagrams; admin add/remove with auto-validation |

## Shared layers (`js/`)

Every layer is a classic browser script attached to `window`:

- **`engine.js`** (`window.OOEngine`) — the Skewb engine: state model over the
  full 3,149,280-state space, moves, alg parsing (WCA + NS notations),
  symmetry/canonicalization (including the 24-rotation hold fold), the BFS
  optimal solver, **and the single source of the keying + alg→case helpers**
  (`stateKey`, `realCanonKey`, `caseStateOf`, `algSolvesKey`, `normAlg`, …).
  Everything else builds on these.
- **`solver-core.js`** (`window.OOSolverCore`) — the *physical* facelet model
  (what a human actually holds and turns, as opposed to the engine's internal
  parsing frame): method search, finish indexing, setup-rotation spelling, and
  the case-diagram orientation used by the Algorithms page and trainer.
- **`render.js`** (`window.OORender`) — SVG puzzle diagrams (net + 3D + the
  sheet-style case picture).
- **`tables.js`** (`window.OOTables`) — shared IndexedDB cache + BFS
  distance/class-table builder used by both the census and the solver/trainer.
- **`account.js`** (`window.OOAccount`) — Firebase Auth + per-user cloud data,
  with a localStorage demo fallback when no Firebase is configured.
- **`dom.js`** (`window.OODom`) — small shared DOM helpers.
- **`navbar.js`** (`window.SiteNavbar`) — the shared top navigation.
- **`config.js`** (`window.OO_CONFIG`) — Firebase config + `adminEmails`. The
  `apiKey` is a public client identifier, not a secret; access is enforced by
  Firestore rules, and admin rights come solely from the `admins/{uid}`
  collection (`adminEmails` only gates UI). See [SETUP.md](SETUP.md).

## Data flow & source of truth

```
data/sources/*.json        ← verbatim transcriptions of the community method sheets
        │  node tools/import-method-sheets.mjs   (regenerates the TCLL / EG2 / NS subsets)
        ▼
data/skewb_algs.json       ← the authored algorithm authority (version-controlled)
        │                        ▲ fetched AT RUNTIME by algs.html, trainer.html and solver.html
        │  npm run build:sheet  (tools/compile-sheet.mjs)
        ▼
js/sheet.js + data/classmap.json   ← generated DATA-QUALITY GATES (no page reads them)
```

- **`data/skewb_algs.json`** is the authority: the real TCLL / EG2 / NS method
  sheets, imported from `data/sources/` (credits and sheet-notation caveats in
  [data/sources/README.md](data/sources/README.md)).
- The **Algorithms page, trainer and solver all fetch `skewb_algs.json`
  directly at runtime** — the compiled `js/sheet.js` + `data/classmap.json`
  have no page consumer; they exist so `npm run check` can machine-verify every
  authored alg against the engine. `js/trainer.js` is the esbuild bundle of
  `src/trainer/` and does not embed the sheet.
- **`js/sheet.js`, `data/classmap.json` and `js/trainer.js` are generated — do
  not hand-edit them.** They are committed so the site works on the host
  without a build.
- Display notation is normalized everywhere by the shared `engine.normAlg`, so
  every surface shows identical algorithms.

> **Notation warning:** three rotation-letter conventions coexist by
> machine-verified necessity — the sheets' letters, WCA, and the engine's
> internal tokens all differ (e.g. sheet `x`/`y`/`z` = engine `z'`/`y'`/`x`,
> and engine `x`/`y`/`z` are the physical inverses of WCA). Humans read sheet
> letters; engine letters are internal. Before touching any notation code,
> read [docs/skewb-ground-truth.md](docs/skewb-ground-truth.md) §Notation.

## Build, test & deploy

```
npm install
npm run build        # build:sheet + bundle trainer + stamp asset hashes + check
npm run check        # verify the compiled sheet against the engine (also: npm test)
npm run check:fresh  # assert the committed generated files + HTML stamps are fresh
npm run test:engine  # engine unit tests (fast)
npm run test:solver  # solver-core physical-model + finish-index tests
npm run test:trainer # trainer substrate tests (builds two full BFS tables — slow-ish)
npm run test:space   # full state-space enumeration/census-count verification (slow)
npm run test:rules   # Firestore rules tests (opt-in: needs the emulator + dev deps)
npm run test:all     # check:fresh + every non-emulator runner (what CI runs)
npm run watch:trainer    # esbuild watch (note: does NOT recompile the sheet)
```

Deploy is just the static files (no server). Cache-busting is automatic: every
local `js`/`css`/`img` asset is loaded with a content-hash `?v=` query that
`npm run stamp` (part of `npm run build`) rewrites from the file's bytes — there
is no manual version to bump. Run `npm run check:fresh` before committing; it
fails if any committed generated file or HTML stamp is stale.

To preview locally, serve over HTTP (`npx serve` or `python -m http.server`) —
the pages `fetch` JSON and use dynamic `import()`, neither of which works from
`file://`.

### Editing the algorithm sheet

Two kinds of subsets live in `data/skewb_algs.json`:

- **Imported subsets (TCLL, EG2, NS)** are owned by the importer — do *not*
  hand-edit them. Edit the transcriptions in `data/sources/` and re-run
  `node tools/import-method-sheets.mjs`, then `npm run build`.
- **Hand-authored subsets** (future — e.g. Sarah's method) can be edited
  directly in the JSON, or via the Algorithms page as an admin: add/remove algs
  (each is auto-checked that it actually solves the case), then **Export JSON**
  to download the updated file, commit it, and `npm run build`. Admin edits are
  a per-browser draft until exported — there is no live shared store.

## Tooling

- **`tools/import-method-sheets.mjs`** — regenerates the TCLL/EG2/NS subsets of
  `skewb_algs.json` from `data/sources/`; encodes the machine-derived
  sheet→engine rotation-letter mapping (derivation notes in its header).
- **`tools/compile-sheet.mjs`** — compiles the JSON into `js/sheet.js` +
  `data/classmap.json`. Self-checks every emitted alg and refuses to write a
  sheet that fails; a new unparseable alg fails the build. The carry-forward
  baseline **`data/prior-sheet.json`** is currently empty (`{}`) — the JSON is
  the sole authority — and **`data/broken-algs.json`** is the explicit
  allowlist for known-broken algs (currently empty).
- **`tools/check-sheet.mjs`** — verifier of the shipped `js/sheet.js`, run via
  `npm run check` (also wired into `npm run build`). It shares the engine's
  keying helpers, so it catches data/structural problems but not engine-level
  keying bugs.
- **`tools/stamp-assets.mjs`** — rewrites each asset's `?v=` query to an 8-hex
  content hash (`npm run stamp`, part of `npm run build`).
- **`tools/check-fresh.mjs`** — re-runs the pipeline and asserts the committed
  generated files + HTML stamps match a clean build (`npm run check:fresh`).
- **`tools/test-engine.mjs` / `test-solver.mjs` / `test-trainer.mjs`** — the
  three dependency-light test runners (there is deliberately no test
  framework). `tools/verify-space.mjs` (`npm run test:space`) re-enumerates the
  state space and pins the census counts.
- **`tools/solver-lab.mjs`** — ad-hoc dev harness for exercising the solver
  from Node (not part of any npm script).
- **`tools/lib/`** — small shared helpers for the tools (e.g. `bfs-dist.mjs`).
- **`build.mjs`** — esbuild config for the React trainer.

## Documentation map

- [CLAUDE.md](CLAUDE.md) — architecture + working notes (the most detailed
  current-state description of the codebase).
- [docs/port-plan.md](docs/port-plan.md) — the Pyraminx→Skewb port milestones
  (M0–M7 done) and remaining ideas.
- [docs/skewb-ground-truth.md](docs/skewb-ground-truth.md) — machine-verified
  Skewb domain facts: move tables, state space, symmetries, notation, test
  vectors. Read before touching engine/notation code.
- [docs/quality-review-2026-07-20.md](docs/quality-review-2026-07-20.md) — the
  standing code-quality backlog and its remediation checklist.
- [SETUP.md](SETUP.md) — Firebase project setup + first-admin bootstrap
  walkthrough.
- [data/sources/README.md](data/sources/README.md) — method-sheet credits and
  sheet-notation caveats.
- [src/trainer/README.md](src/trainer/README.md) — trainer source, workflow,
  and integration contract.

## License

Code and original content are [MIT](LICENSE). The transcribed community method
sheets in `data/sources/` (and the subsets generated from them) remain the work
of their credited authors — see the provenance note in the LICENSE file and
[data/sources/README.md](data/sources/README.md).

### Module strategy (why no `"type": "module"`)

The browser scripts in `js/` are classic scripts that attach to `window`
(`OOEngine`, `OOSolverCore`, …) and are **also** `require()`-d as CommonJS by
the build tools. The tools themselves are ESM and use the `.mjs` extension.
Adding `"type": "module"` would make Node treat the `js/*.js` files as ESM and
break those `require()` calls, so it is intentionally omitted.
