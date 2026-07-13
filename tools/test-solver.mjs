/* Skewbiks.com — solver-core unit tests (M7; physical-model rework 2026-07-07,
 * RubiksSkewb layer display 2026-07-10).
 *
 * Asserts the method solver's substrate: the first-step target spaces (counts
 * pinned by the 2026-07-07 machine probe + membership of every imported sheet
 * case), the RubiksSkewb layer emitter (only {R,B,r,b}, reproduces the native
 * moves from every hold), the PHYSICAL finish index (texts fold their leading
 * rotations into the setup; per text the index holds Φ⁻¹ of the 24 solved
 * orientations; junctions match under 24 rotations), and the search — every
 * emitted solution's method view is physically re-proved AND independently
 * reassembled FROM THE HELD FACELETS (physPerm of the scramble text — the raw
 * pinned facelets sit rotated in hand when the text has written free-corner
 * letters; USER bug report 2026-07-10, pinned below), its layer is {R,B,r,b}
 * on the bottom, the three USER-reported solves are pinned as full lines, and
 * constructed decompositions must be found.
 *
 * Run: node tools/test-solver.mjs   (exit 0 = OK, 1 = a test failed)
 * Builds the full BFS distance table once (~30 s), like test-trainer.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { buildDist } from './lib/bfs-dist.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = {};
require(path.join(ROOT, 'js', 'engine.js'));
const E = globalThis.window.OOEngine;
require(path.join(ROOT, 'js', 'solver-core.js'));
const { makeSolverCore, METHOD_DEFS, METHOD_PRIORITY } = globalThis.window.OOSolverCore;
const algData = JSON.parse(readFileSync(path.join(ROOT, 'data', 'skewb_algs.json'), 'utf8'));

let passed = 0, failed = 0;
function t(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('assertion returned false');
    console.log('✓ ' + name); passed++;
  } catch (e) {
    console.log('✗ ' + name + '\n    ' + (e && e.message)); failed++;
  }
}
const rndInt = n => Math.floor(Math.random() * n);

console.log('building distance table…');
const dist = buildDist(E);
const C = makeSolverCore(E, dist, algData);
const { syms, rotBy } = C;
const IDS = Object.keys(METHOD_DEFS);

/* ---------- target spaces ---------- */
t('method registry: fl/tcll/eg2 with priority order', () => {
  if (JSON.stringify(IDS) !== '["fl","tcll","eg2"]') throw new Error(IDS.join());
  if (JSON.stringify(METHOD_PRIORITY) !== '["fl","tcll","eg2"]') throw new Error('priority');
});
t('D-anchored spaces: 540 fl / 2,160 tcll / 540 eg2, all reachable', () => {
  for (const [id, n] of [['fl', 540], ['tcll', 2160], ['eg2', 540]]) {
    const states = C.dAnchored(id);
    if (states.length !== n) throw new Error(id + ': ' + states.length);
    for (const s of states) if (dist[E.idx(s)] < 0) throw new Error(id + ': unreachable state');
  }
});
t('expanded target maps: 3,110 fl / 11,964 tcll / 3,204 eg2 (12-rotation orbit)', () => {
  for (const [id, n] of [['fl', 3110], ['tcll', 11964], ['eg2', 3204]])
    if (C.targets[id].size !== n) throw new Error(id + ': ' + C.targets[id].size);
});
t('D-anchored predicates: layer pieces as specced per method', () => {
  for (const id of IDS) for (const s of C.dAnchored(id)) {
    if (s.ctr[3] !== 3 || s.fx[2] !== 0 || s.fx[3] !== 0) throw new Error(id + ': layer ctr/axis');
    const twists = [s.fo[2], s.fo[3]].filter(v => v !== 0).length;
    if (id === 'fl' && (s.fp.join('') !== '0123' || twists !== 0)) throw new Error('fl layer dirty');
    if (id === 'tcll' && (s.fp.join('') !== '0123' || twists !== 1)) throw new Error('tcll needs exactly one twist');
    if (id === 'eg2' && (s.fp.join('') !== '1032' || twists !== 0)) throw new Error('eg2 needs the pair swap');
  }
});
t('every imported sheet case sits in its method space (minus 5 known outliers)', () => {
  const subs = { ...(algData.subsets || {}), ...(algData.other_subsets || {}) };
  const expect = { NS: ['fl', 134, 135], EG2: ['eg2', 136, 136], TCLL: ['tcll', 1076, 1080] };
  for (const key of Object.keys(expect)) {
    const [meth, want, total] = expect[key];
    let got = 0, seen = 0;
    for (const c of subs[key].cases) {
      let st = null;
      for (const a of c.algs || []) { st = E.caseStateOf(a.alg); if (st) break; }
      if (!st) continue;
      seen++;
      if (C.targets[meth].has(E.idx(st))) got++;
    }
    if (seen !== total || got !== want) throw new Error(`${key}: ${got}/${seen} (want ${want}/${total})`);
  }
});
t('target faces: solved state carries a face; faces are valid letters', () => {
  const f = C.targets.fl.get(E.idx(E.solved()));
  if (!E.FACES.includes(f)) throw new Error('solved: ' + f);
  for (const id of IDS) for (const face of new Set(C.targets[id].values()))
    if (!E.FACES.includes(face)) throw new Error(id + ': ' + face);
});

/* ---------- the RubiksSkewb layer emitter + the physical model ---------- */
const ONLY_RIGHT = /^(?:[RBrb]'?(?:\s+|$))+$/;         // NS layer vocabulary: only R B r b
t('emitNS: only {R,B,r,b}, reproduces the native moves, from every one of the 24 holds', () => {
  for (let trial = 0; trial < 300; trial++) {
    const mis = []; for (let i = 0; i < 1 + rndInt(8); i++) mis.push(rndInt(8));
    const target = E.solved(); for (const m of mis) E.applyMoveIdx(target, m);
    for (const lead of C.LEAD) {
      const str = C.emitNS(mis, lead.frame).tokens.join(' ');
      if (str && !ONLY_RIGHT.test(str)) throw new Error('forbidden letter: ' + str);
      // the leading rotation (engine spelling) + the moves engine-land the native moves
      const line = (lead.engStr ? lead.engStr + ' ' : '') + str;
      const s = E.applyParsed(E.parseAlg(E.preprocessAlg(line), 'ns'), E.solved(), syms, rotBy);
      if (!E.eq(s, target)) throw new Error('emitNS mismatch from ' + (lead.engStr || 'id'));
    }
  }
});
t('ROT24 + LEAD: 24 orientations (identity first, sheet spellings); LEAD covers all 24 holds', () => {
  if (C.ROT24.length !== 24 || C.ROT24[0].spell !== '') throw new Error('ROT24 head');
  const seen = new Set();
  for (const r of C.ROT24) {
    for (const tok of r.spell.split(/\s+/).filter(Boolean))
      if (!/^[xyz](2'|2|')?$/.test(tok)) throw new Error('not a rotation token: ' + tok);
    seen.add(r.perm.join(','));
  }
  if (seen.size !== 24) throw new Error('duplicate perms: ' + seen.size);
  if (C.LEAD.length !== 24) throw new Error('LEAD length ' + C.LEAD.length);
  const frames = new Set(C.LEAD.map(l => JSON.stringify(l.frame.fp)));
  if (frames.size !== 24) throw new Error('LEAD frames not distinct: ' + frames.size);
});
t('physical corpus anchor: every imported text solves its WCA-field case state under the SHEET reading', () => {
  // The authored ns fields are VERBATIM sheet strings (importer keeps the
  // source untouched), so rotation tokens are SHEET letters. physPermNS must
  // solve each text's case state — caseStateOf(alg), the WCA field, an
  // INDEPENDENT ground truth — from its raw pinned facelets, in any final
  // orientation. Machine-established 2026-07-10: of the 928 mid-rotation
  // texts, 916 pass ONLY under this reading (12 are the unparseable slash
  // texts) and ZERO under the engine-letter reading physPerm used before.
  const subs = { ...(algData.subsets || {}), ...(algData.other_subsets || {}) };
  let checked = 0;
  for (const key of Object.keys(subs)) for (const c of subs[key].cases || [])
    for (const a of c.algs || []) {
      const toks = E.parseAlg(E.preprocessAlg(a.ns || a.alg), 'ns');
      if (!toks) continue;
      const st = E.caseStateOf(a.alg);
      if (!st) throw new Error('no case state: ' + a.alg);
      const end = C.pApply(E.toFacelets(st), C.physPermNS(toks));
      if (!C.SOLVED24_KEYS.has(C.flKey(end))) throw new Error('not solved physically: ' + (a.ns || a.alg));
      checked++;
    }
  if (checked !== 3082) throw new Error('checked ' + checked + ' texts (want 3082)');
});

/* ---------- the physical finish index (leading rotations folded) ---------- */
t('foldLeadRots: cuts plain leading rotations; grouped/odd texts fall back untouched', () => {
  const cases = [
    ["x z' R B r'", "R B r'"],
    ["y B2' F r", "B2' F r"],       // preprocess rewrite kept authored in the body
    ["R B r'", "R B r'"],           // no leading rotations
    ["z x y2 y", "z x y2 y"],       // all rotations
    ["y (r b' r')", "y (r b' r')"], // grouping chars: never cut (post-review guard)
    ["[y2] r b' r'", "[y2] r b' r'"],
  ];
  for (const [inp, want] of cases) {
    const toks = E.parseAlg(E.preprocessAlg(inp), 'ns');
    if (!toks) throw new Error('fixture does not parse: ' + inp);
    const got = C.foldLeadRots(inp, toks).ns;
    if (got !== want) throw new Error(`"${inp}" -> "${got}" (want "${want}")`);
  }
});
t('alg index: 58,608 pre-states / 73,968 entries; texts lead with a turn; entries re-prove physically', () => {
  // 65,640 -> 58,608 with the sheet-letter Φ (2026-07-10): the 928
  // mid-rotation bodies now index at their TRUE pre-states, which collide
  // with other texts' far more often. Entries stay 3,082 × 24 (no text is
  // rotation-symmetric under either reading).
  const idx = C.algIndex();
  if (idx.size !== 58608) throw new Error('size ' + idx.size);
  let entries = 0; for (const l of idx.values()) entries += l.length;
  if (entries !== 73968) throw new Error('entries ' + entries);
  const keys = [...idx.keys()];
  for (let trial = 0; trial < 200; trial++) {
    const k = keys[rndInt(keys.length)];
    const arr = k.split('').map(Number);
    for (const row of idx.get(k)) {
      // by construction: the body's physical perm solves this pre-state
      if (!C.SOLVED24_KEYS.has(C.flKey(C.pApply(arr, row.phi)))) throw new Error('entry does not solve: ' + row.ns);
      const toks = E.parseAlg(E.preprocessAlg(row.ns), 'ns');
      if (row.moves > 0 && (!toks || toks[0].kind === 'rot')) throw new Error('indexed text leads with a rotation: ' + row.ns);
      if (!row.preKeys.has(k)) throw new Error('row.preKeys misses its own key');
    }
  }
});
t('physical-finish coverage over the method spaces: 3109/3110 fl, 11964/11964 tcll, 3204/3204 eg2', () => {
  // re-measured 2026-07-10 with the sheet-letter Φ: coverage is essentially
  // COMPLETE. The old 2733/10392/3180 "≈12% gap" was an artifact of reading
  // the 928 mid-rotation ns bodies with engine letters — those texts were
  // indexed at states no junction ever hits. Update deliberately when the
  // alg data changes.
  const idx = C.algIndex();
  for (const [id, want, total] of [['fl', 3109, 3110], ['tcll', 11964, 11964], ['eg2', 3204, 3204]]) {
    let cov = 0;
    const seen = new Set();
    for (const st of C.dAnchored(id)) for (const rot of syms.rots) {
      const s = rot.apply(st);
      const k = E.stateKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      const jArr = E.toFacelets(s);
      for (const r of C.ROT24) if (idx.has(C.flKey(C.pApply(jArr, r.perm)))) { cov++; break; }
    }
    if (seen.size !== total || cov !== want) throw new Error(`${id}: ${cov}/${seen.size}`);
  }
});

/* ---------- search: soundness (every emitted view proves physically) ---------- */
const FIXTURES = [
  "L R L U' B R' U' R' L R B",   // KPW 2015 official final
  "R U' B L' U R' B'",
  "B U L R' U' B' L R",
  "U L R B U' R' B' L'",
];
const NS_BODIES = (() => {  // display-membership oracle: every shipped text's token
  const s = new Set();      // stream AFTER its leading rotations (independent fold)
  const subs = { ...(algData.subsets || {}), ...(algData.other_subsets || {}) };
  for (const key of Object.keys(subs)) for (const c of subs[key].cases || [])
    for (const a of c.algs || []) {
      const p = E.parseAlg(E.preprocessAlg(a.ns || a.alg), 'ns');
      if (!p) continue;
      let i = 0;
      while (i < p.length && p[i].kind === 'rot') i++;
      s.add(JSON.stringify(i < p.length ? p.slice(i) : p));
    }
  return s;
})();
const isRot = s => s === '' || s.split(/\s+/).filter(Boolean).every(t => /^[xyz](2'|2|')?$/.test(t));
// independent physical proof of a displayed reconstruction, reassembled from
// its SEPARATE fields (lead / first / setup rot / alg) and executed from the
// facelets the human actually HOLDS (heldFl — physPerm of the scramble text,
// NOT the state's raw facelets): rotations are SHEET letters, layer + alg are
// NS twists — must land a solved cube in any orientation.
// physPermNS: displayed bodies are authored ns texts (sheet rotation letters);
// the layer field is pure letters, identical under either reading
const nsPerm = txt => C.physPermNS(E.parseAlg(E.preprocessAlg(txt), 'ns'));
function displayedSolves(heldFl, mv) {
  let P = heldFl;
  if (mv.lead) P = C.pApply(P, C.sheetStrPerm(mv.lead));
  if (mv.first) P = C.pApply(P, nsPerm(mv.first));
  if (mv.alg) { if (mv.rot) P = C.pApply(P, C.sheetStrPerm(mv.rot)); P = C.pApply(P, nsPerm(mv.alg)); }
  return C.SOLVED24_KEYS.has(C.flKey(P));
}
const runFixture = (scr) => {
  const parsed = E.parseAlg(scr);
  const state = E.applyParsed(parsed, E.solved(), syms, rotBy);
  const heldFl = C.heldFacelets(parsed);
  const res = C.search(state, { methods: { fl: true, tcll: true, eg2: true }, caps: {} });
  return { state, heldFl, dopt: dist[E.idx(state)], res };
};
t('fixtures: solutions exist, none truncated', () => {
  for (const scr of FIXTURES) {
    const { res } = runFixture(scr);
    if (res.truncated) throw new Error(scr + ': truncated');
    if (!Object.values(res.byLength).some(items => items.length)) throw new Error(scr + ': no solutions');
  }
});
t('fixtures: every solution proves physically; layer is {R,B,r,b} on the bottom; alg is a sheet body', () => {
  for (const scr of FIXTURES) {
    const { state, heldFl, res } = runFixture(scr);
    for (const [L, items] of Object.entries(res.byLength)) for (const it of items) {
      if (it.total !== +L || it.v + it.fin !== it.total) throw new Error('bucket algebra');
      if (it.v !== it.pmoves.length) throw new Error('v vs pmoves');
      if (it.v > METHOD_DEFS[it.id].cap) throw new Error('over cap ' + it.id);
      const mv = C.methodView(state, it, heldFl);
      if (!mv || !mv.ok) throw new Error('method view fails: ' + it.id + ' total ' + L);
      if (mv.first && !ONLY_RIGHT.test(mv.first)) throw new Error('layer uses a forbidden letter: ' + mv.first);
      if (!isRot(mv.lead) || !isRot(mv.rot)) throw new Error('non-rotation shown: ' + mv.lead + ' / ' + mv.rot);
      if (!displayedSolves(heldFl, mv)) throw new Error('displayed line does not physically solve: ' + mv.text);
      if (it.row) {
        if (mv.alg !== it.row.ns) throw new Error('alg text differs from the indexed row');
        const p = E.parseAlg(E.preprocessAlg(mv.alg), 'ns');
        if (!p || p[0].kind === 'rot') throw new Error('alg text leads with a rotation: ' + mv.alg);
        if (!NS_BODIES.has(JSON.stringify(p))) throw new Error('alg text is not a sheet body: ' + mv.alg);
        if (E.countMoves(E.parseAlg(E.preprocessAlg(mv.text), 'ns')) !== it.total) throw new Error('text movecount');
        if (mv.face !== 'D') throw new Error('built layer not on the bottom: ' + mv.face);
      } else {
        if (it.fin !== 0 || mv.rot || mv.alg || mv.lead) throw new Error('solved junction shape');
      }
    }
  }
});

/* ---------- the USER-reported solves, re-pinned to the RubiksSkewb display ---------- */
// Three junctions the site owner physically executed (2026-07-07). The display
// was reworked 2026-07-10 (layer in {R,B,r,b}, a leading rotation that builds
// the layer on the bottom), so these pin the NEW full lines — each is
// physically re-proved (mv.ok) and independently reassembled (displayedSolves).
const USER = [
  { label: 'Pi Triple Sledge 135',
    scr: E.inverseState(E.applyParsed(E.parseAlg(E.preprocessAlg("B' l r l' b r l y x r' R r R'"), 'ns'), E.solved(), syms, rotBy)),
    pmoves: '1,2,4,3,6,2,0', alg: "r' R r R'", text: "z' b' B r R' B r b x r' R r R'" },
  { label: 'BST- BL S1',
    scr: E.keyToState('015432|30212220|0022'),
    pmoves: '2,4', alg: "R' B' r' R r R B R'", text: "x r R x R' B' r' R r R B R'" },
  { label: 'Pi Triple Sledge 136',
    scr: (() => { const s = E.copy(E.keyToState('415302|01230210|0201')); E.applyMoveIdx(s, 3); E.applyMoveIdx(s, 1); return s; })(),
    pmoves: '0,2', alg: "R r' R' r", text: "z R r y x R r' R' r" },
];
// These pins are state-built (no scramble text), so the assumed hold is the
// raw pinned facelets — methodView's default (G = identity).
for (const u of USER) t(`USER solve: ${u.label} — full RubiksSkewb line + physical proof`, () => {
  const res = C.search(u.scr, { methods: { fl: true, tcll: true, eg2: true }, caps: {} });
  for (const items of Object.values(res.byLength)) for (const it of items) {
    if (!it.row || it.pmoves.join(',') !== u.pmoves || it.row.ns !== u.alg) continue;
    const mv = C.methodView(u.scr, it);
    if (!mv.ok || !displayedSolves(E.toFacelets(u.scr), mv)) throw new Error('does not physically verify');
    if (mv.text !== u.text) throw new Error(`text "${mv.text}" (want "${u.text}")`);
    if (mv.face !== 'D') throw new Error('layer not on the bottom');
    return;
  }
  throw new Error('solution not found');
});

/* ---------- the USER's 2026-07-10 lead-rotation bug report, pinned ---------- */
// Scramble B' R L U' L' B' R' U' (two written B's -> the real cube in hand is
// rotated relative to the pinned state's raw facelets). The solver printed
// "y' R' r b' r B y z R r R' r'", which the USER physically executed and
// FALSIFIED; executing lead x instead of y' worked. The fix derives the line
// from the held facelets (physPerm of the scramble text). All three claims
// are pinned: the corrected line proves from the real hold, the USER's
// hand-verified variant proves from the real hold, and the old buggy line
// does NOT.
t("USER bug 2026-07-10: lead rotation derives from the held facelets, not the pinned state", () => {
  const { state, heldFl, res } = runFixture("B' R L U' L' B' R' U'");
  let mv = null;
  for (const items of Object.values(res.byLength)) for (const it of items) {
    if (it.row && it.pmoves.join(',') === '7,0,7,0,6' && it.row.ns === "R r R' r'") { mv = C.methodView(state, it, heldFl); break; }
  }
  if (!mv) throw new Error('solution not found');
  if (!mv.ok || !displayedSolves(heldFl, mv)) throw new Error('corrected line does not physically verify');
  if (mv.face !== 'D') throw new Error('layer not on the bottom');
  if (mv.text !== "y r' R r' B b y' z R r R' r'") throw new Error(`text "${mv.text}"`);
  // the USER's physically-executed variant (ground truth) from the same hold
  const userLine = { lead: 'x', first: "R' r b' r B", rot: 'y z', alg: "R r R' r'" };
  if (!displayedSolves(heldFl, userLine)) throw new Error("USER's hand-verified line does not prove");
  // the pre-fix output must NOT prove from the real hold (regression tripwire)
  const buggy = { lead: "y'", first: "R' r b' r B", rot: 'y z', alg: "R r R' r'" };
  if (displayedSolves(heldFl, buggy)) throw new Error('the old buggy line suddenly proves');
});

/* ---------- the Algorithms-page display (layer-down pictures + verbatim-or-rederived texts) ---------- */
// USER requirement 2026-07-10: every case image shows the built layer on the
// BOTTOM, and each alg text's starting rotation is exactly what a human turns
// from the pictured hold. layerDownFacelets picks the picture; sheetLineFor
// keeps the authored text verbatim whenever it already proves from the
// picture (all standard groups — the picture is the raw pinned frame) and
// re-derives the lead only for the odd-orientation groups. Every ok line is
// itself a valid sheet text, so each is independently re-proved here by one
// fresh parse + physPermNS from the pictured facelets.
t('algs display: 1420 groups, 9 pictured rotated; 3073 verbatim / 9 rederived / 34 unparseable; every line re-proves', () => {
  const subs = { ...(algData.subsets || {}), ...(algData.other_subsets || {}) };
  const strip = alg => {
    const tk = String(alg).trim().split(/\s+/).filter(Boolean);
    while (tk.length && /^[xyz](2'|2|')?$/.test(tk[tk.length - 1])) tk.pop();
    return tk.join(' ');
  };
  let groups = 0, rotated = 0, verbatim = 0, rederived = 0, warn = 0;
  for (const key of Object.keys(subs)) for (const c of subs[key].cases || []) {
    const byState = new Map();
    for (const a of c.algs || []) {
      const st = E.caseStateOf(strip(E.normAlg(a.alg)));
      if (!st) continue;
      const k = E.stateKey(st);
      if (!byState.has(k)) byState.set(k, { st, rows: [] });
      byState.get(k).rows.push(a);
    }
    for (const { st, rows } of byState.values()) {
      groups++;
      const pic = C.layerDownFacelets(st);
      if (pic.rotated) rotated++;
      for (const a of rows) {
        const line = C.sheetLineFor(pic.fl, a.ns || a.alg, a.ns ? 'ns' : 'wca');
        if (!line.ok) { warn++; continue; }
        if (line.rederived) rederived++; else verbatim++;
        // independent physical re-proof of the DISPLAYED text from the picture
        // (authored sheet texts only — admin-style WCA rows have no ns field)
        if (a.ns) {
          const toks = E.parseAlg(E.preprocessAlg(line.text), 'ns');
          if (!toks || !C.SOLVED24_KEYS.has(C.flKey(C.pApply(pic.fl, C.physPermNS(toks)))))
            throw new Error('displayed line does not re-prove: ' + line.text);
        }
      }
    }
  }
  const got = [groups, rotated, verbatim, rederived, warn].join('/');
  if (got !== '1420/9/3073/9/34') throw new Error(got + ' (want 1420/9/3073/9/34)');
});

/* ---------- search: completeness (constructed decompositions are found) ---------- */
t('constructed first-step + sheet-alg decompositions are found (50 randomized)', () => {
  const idx = C.algIndex();
  // per method: target states with at least one physical finish, + a matching row
  const perMethod = {};
  for (const id of IDS) {
    perMethod[id] = [];
    for (const ix of C.targets[id].keys()) {
      const jArr = E.toFacelets(E.unidx(ix));
      for (const r of C.ROT24) {
        const list = idx.get(C.flKey(C.pApply(jArr, r.perm)));
        if (list) { perMethod[id].push({ ix, row: list[0] }); break; }
      }
      if (perMethod[id].length >= 400) break;
    }
  }
  let done = 0, tries = 0;
  while (done < 50 && ++tries < 600) {
    const id = IDS[rndInt(3)];
    const pool = perMethod[id];
    const pick = pool[rndInt(pool.length)];
    const j = E.unidx(pick.ix);
    // P = a short reversed random walk (no same-axis neighbours) ending at j
    const n = 1 + rndInt(3);
    const P = [];
    let last = -1;
    for (let i = 0; i < n; i++) { let m; do { m = rndInt(8); } while ((m >> 1) === last); last = m >> 1; P.push(m); }
    const scr = E.copy(j);
    for (let i = P.length - 1; i >= 0; i--) E.applyMoveIdx(scr, P[i] ^ 1);
    if (dist[E.idx(scr)] === 0 || P.length > METHOD_DEFS[id].cap) continue;
    const total = P.length + pick.row.moves;
    const res = C.search(scr, { methods: { [id]: true }, caps: {} });
    const hit = (res.byLength[total] || []).some(it =>
      it.pmoves.join(',') === P.join(',') && it.row && it.row.uid === pick.row.uid);
    if (!hit) throw new Error(`${id}: missing P=${P.join(',')} + ${pick.row.ns}`);
    done++;
  }
  if (done < 50) throw new Error('only ' + done + ' constructions in ' + tries + ' tries');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
