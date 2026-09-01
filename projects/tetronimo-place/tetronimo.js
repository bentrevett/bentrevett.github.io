// Puzzle logic for Tetronimo Place. No DOM in here, so the same file runs in
// the page and under Node for testing.

const PIECE = 4; // cells in a tetronimo

// Three boards a day. Bigger ones are looser, so they need more clues to pin
// the answer down, which is most of what makes them harder.
const SIZES = [
  { name: "Small", side: 6, min: 7, max: 8 },
  { name: "Medium", side: 8, min: 11, max: 13 },
  { name: "Large", side: 10, min: 16, max: 19 },
];
const BIGGEST = 10; // cell ids are numbered against this, so they never move

// The five free tetronimoes. Rotations and mirrors are all allowed, so I and
// its mirror are the same piece, and there are five rather than seven.
const BASE = {
  I: [[0, 0], [0, 1], [0, 2], [0, 3]],
  O: [[0, 0], [0, 1], [1, 0], [1, 1]],
  L: [[0, 0], [1, 0], [2, 0], [2, 1]],
  S: [[0, 1], [0, 2], [1, 0], [1, 1]],
  T: [[0, 0], [0, 1], [0, 2], [1, 1]],
};

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function normalise(cells) {
  const top = Math.min(...cells.map(([r]) => r));
  const left = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - top, c - left])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// Every turn and flip, with duplicates dropped: I has 2, O has 1, L has 8,
// S and T have 4 each.
function orientations(cells) {
  const seen = new Map();
  for (let flip = 0; flip < 2; flip++) {
    let work = flip ? cells.map(([r, c]) => [r, -c]) : cells;
    for (let turn = 0; turn < 4; turn++) {
      work = work.map(([r, c]) => [c, -r]);
      const shape = normalise(work);
      seen.set(JSON.stringify(shape), shape);
    }
  }
  return [...seen.values()];
}

const SHAPES = {};
for (const [name, cells] of Object.entries(BASE)) SHAPES[name] = orientations(cells);
const SHAPE_NAMES = Object.keys(BASE);

// --- randomness -----------------------------------------------------------

// xmur3, turns a string into a 32 bit seed.
function hashString(string) {
  let h = 1779033703 ^ string.length;
  for (let i = 0; i < string.length; i++) {
    h = Math.imul(h ^ string.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// mulberry32, a small seeded PRNG returning floats in [0, 1).
function makeRandom(seed) {
  let a = seed;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- placements -----------------------------------------------------------

const inside = (r, c, side) => r >= 0 && r < side && c >= 0 && c < side;

// Every way an allowed piece can sit inside the region, filed under the first
// cell it covers in reading order. Filling that cell is always the next
// decision, which is what stops the search finding the same tiling twice.
function placementsFor(region, names, side) {
  const byFirst = new Map();
  for (const name of names) {
    for (const shape of SHAPES[name]) {
      for (let r = 0; r < side; r++) {
        for (let c = 0; c < side; c++) {
          const cells = shape.map(([dr, dc]) => [r + dr, c + dc]);
          if (cells.some(([cr, cc]) => !inside(cr, cc, side) || !region.has(cr * BIGGEST + cc))) continue;
          const ids = cells.map(([cr, cc]) => cr * BIGGEST + cc).sort((a, b) => a - b);
          if (!byFirst.has(ids[0])) byFirst.set(ids[0], []);
          byFirst.get(ids[0]).push({ ids, name });
        }
      }
    }
  }
  return byFirst;
}

// --- counting answers -----------------------------------------------------

// Counts the distinct *labellings* — which shape covers each cell — rather
// than the distinct tilings. Two tilings that write the same letter in every
// cell are the same answer to a player who only writes letters, and there is
// no point calling a puzzle ambiguous over a difference nobody can see.
//
// Two kinds of clue are honoured as the search goes.
//
// Edge marks, between two neighbouring cells. Both always fall on a join
// between two pieces, never inside one:
//   "X"  two different pieces, of different shapes
//   "="  two different pieces, of the same shape
// An "=" inside a single piece would be true by definition and say nothing, so
// it is never placed there and never accepted there.
//
// Dotted cells: no single piece may cover more than one of them. That one is
// checked as a piece is laid down rather than afterwards, so a placement
// swallowing two dots is thrown out immediately.
function countLabellings(region, names, marks, dots, side, cap) {
  const cells = [...region].sort((a, b) => a - b);
  if (cells.length % PIECE !== 0) return 0;

  const byFirst = placementsFor(region, names, side);
  const owner = new Int32Array(BIGGEST * BIGGEST).fill(-1);
  const type = [];

  const edgesAt = new Map();
  for (const [pair, kind] of marks) {
    for (const cell of pair) {
      if (!edgesAt.has(cell)) edgesAt.set(cell, []);
      edgesAt.get(cell).push([pair, kind]);
    }
  }

  const found = new Set();
  const walk = (from, depth) => {
    if (found.size >= cap) return;
    let at = from;
    while (at < cells.length && owner[cells[at]] >= 0) at += 1;
    if (at === cells.length) {
      found.add(cells.map((id) => type[owner[id]]).join(""));
      return;
    }

    for (const option of byFirst.get(cells[at]) || []) {
      if (option.ids.some((id) => owner[id] >= 0)) continue;
      if (option.ids.filter((id) => dots.has(id)).length > 1) continue;
      for (const id of option.ids) owner[id] = depth;
      type[depth] = option.name;

      let allowed = true;
      for (const id of option.ids) {
        for (const [pair, kind] of edgesAt.get(id) || []) {
          if (owner[pair[0]] < 0 || owner[pair[1]] < 0) continue;
          const sameShape = type[owner[pair[0]]] === type[owner[pair[1]]];
          const samePiece = owner[pair[0]] === owner[pair[1]];
          // "X" needs different shapes, which rules out one piece anyway.
          const ok = kind === "=" ? sameShape && !samePiece : !sameShape;
          if (!ok) { allowed = false; break; }
        }
        if (!allowed) break;
      }
      if (allowed) walk(at + 1, depth + 1);

      for (const id of option.ids) owner[id] = -1;
      if (found.size >= cap) return;
    }
  };
  walk(0, 0);
  return found.size;
}

// --- solving by logic -----------------------------------------------------

// A rule engine over *placements*: every way an allowed shape could sit in the
// region. Rules only ever kill placements or assign one, and nothing guesses.
//
// This is what decides when a puzzle is finished being built. Asking "is the
// answer unique" was the wrong question: a unique answer can still be one that
// nobody could reason their way to, and stripping clues down to the minimum
// that preserves uniqueness actively optimises a board into being unsolvable.
// Asking instead "does a no-guessing solver finish, using only the rules I am
// willing to ask a player for" is strictly stronger, since propagation pinning
// every letter is itself the proof that no second labelling exists.

const rowOf = (id) => Math.floor(id / BIGGEST);
const colOf = (id) => id % BIGGEST;
const neighbours = (id) => {
  const r = rowOf(id), c = colOf(id), out = [];
  if (r > 0) out.push(id - BIGGEST);
  out.push(id + BIGGEST);
  if (c > 0) out.push(id - 1);
  if (c < BIGGEST - 1) out.push(id + 1);
  return out;
};

// --- state ----------------------------------------------------------------

// Every legal placement, with the two-dots rule applied up front since it can
// never stop being true.
function buildPlacements(region, names, dots, side) {
  const out = [];
  for (const name of names) {
    for (const shape of SHAPES[name]) {
      for (let r = 0; r < side; r++) {
        for (let c = 0; c < side; c++) {
          const ids = [];
          let fits = true;
          for (const [dr, dc] of shape) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= side || cc < 0 || cc >= side) { fits = false; break; }
            const id = rr * BIGGEST + cc;
            if (!region.has(id)) { fits = false; break; }
            ids.push(id);
          }
          if (!fits) continue;
          if (ids.filter((id) => dots.has(id)).length > 1) continue;
          out.push({ ids: ids.sort((a, b) => a - b), name });
        }
      }
    }
  }
  return out;
}

function makeState(region, names, marks, dots, side) {
  const cells = [...region].sort((a, b) => a - b);
  const placements = buildPlacements(region, names, dots, side);
  const live = placements.map(() => true);
  const byCell = new Map(cells.map((id) => [id, []]));
  placements.forEach((p, i) => p.ids.forEach((id) => byCell.get(id).push(i)));
  return {
    cells, placements, live, byCell, marks, dots, side,
    assigned: new Map(), // cell -> placement index
    dead: false,
    used: new Set(),     // rule ids that actually changed something
    covering(id) { return this.byCell.get(id).filter((i) => this.live[i]); },
    kill(i, ruleId) {
      if (!this.live[i]) return false;
      this.live[i] = false;
      this.used.add(ruleId);
      return true;
    },
    assign(i, ruleId) {
      const p = this.placements[i];
      for (const id of p.ids) this.assigned.set(id, i);
      let changed = false;
      for (const j of this.placements.keys()) {
        if (j === i || !this.live[j]) continue;
        if (this.placements[j].ids.some((id) => p.ids.includes(id))) {
          this.live[j] = false;
          changed = true;
        }
      }
      this.used.add(ruleId);
      return changed;
    },
    freeCells() { return this.cells.filter((id) => !this.assigned.has(id)); },
    snapshot() { return this.live.slice(); },
    restore(snap) { this.live = snap; },
  };
}

// --- rules ----------------------------------------------------------------
// Each returns true if it changed anything. Ordered cheapest first.

const forcedCell = {
  id: "forced-cell", tier: "basic",
  run(s) {
    let changed = false;
    for (const id of s.cells) {
      if (s.assigned.has(id)) continue;
      const cand = s.covering(id);
      if (cand.length === 0) { s.dead = true; return true; }
      if (cand.length === 1) changed = s.assign(cand[0], this.id) || true;
    }
    return changed;
  },
};

// A mark always sits on a join, so nothing may span it.
const markSpan = {
  id: "mark-span", tier: "basic",
  run(s) {
    let changed = false;
    for (const [[a, b]] of s.marks) {
      for (const i of s.byCell.get(a)) {
        if (!s.live[i]) continue;
        if (s.placements[i].ids.includes(b)) changed = s.kill(i, this.id) || changed;
      }
    }
    return changed;
  },
};

// A placement only survives if the cell across the mark can still be covered by
// something with the right shape relation. This does most of the work.
const markPartner = {
  id: "mark-partner", tier: "basic",
  run(s) {
    let changed = false;
    for (const [[a, b], kind] of s.marks) {
      for (const [self, other] of [[a, b], [b, a]]) {
        for (const i of s.byCell.get(self)) {
          if (!s.live[i]) continue;
          const name = s.placements[i].name;
          const ok = s.covering(other).some((j) => {
            if (j === i) return false;
            const q = s.placements[j].name;
            return kind === "=" ? q === name : q !== name;
          });
          if (!ok) changed = s.kill(i, this.id) || changed;
        }
      }
    }
    return changed;
  },
};

// Split what is left into connected pieces of open cells.
function components(free) {
  const rest = new Set(free), seen = new Set(), out = [];
  for (const start of rest) {
    if (seen.has(start)) continue;
    const stack = [start], comp = [];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop();
      comp.push(id);
      for (const n of neighbours(id)) {
        if (rest.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    out.push(comp);
  }
  return out;
}

// Laying this piece would cut off a pocket that no whole number of pieces fits.
const strandedRegion = {
  id: "stranded-region", tier: "intermediate",
  run(s) {
    let changed = false;
    const free = s.freeCells();
    const freeSet = new Set(free);
    for (let i = 0; i < s.placements.length; i++) {
      if (!s.live[i]) continue;
      const p = s.placements[i];
      if (p.ids.some((id) => !freeSet.has(id))) continue;
      const rest = free.filter((id) => !p.ids.includes(id));
      if (components(rest).some((c) => c.length % 4 !== 0)) changed = s.kill(i, this.id) || changed;
    }
    return changed;
  },
};

// Stronger than the size check: after laying this piece, some open cell has no
// surviving placement that fits inside its own pocket. Subsumes the 1-wide
// corridor case, so there is no separate corridor rule.
const unreachableCell = {
  id: "unreachable-cell", tier: "intermediate",
  run(s) {
    let changed = false;
    const free = s.freeCells();
    const freeSet = new Set(free);
    for (let i = 0; i < s.placements.length; i++) {
      if (!s.live[i]) continue;
      const p = s.placements[i];
      if (p.ids.some((id) => !freeSet.has(id))) continue;
      const rest = new Set(free.filter((id) => !p.ids.includes(id)));
      let bad = false;
      for (const id of rest) {
        const any = s.byCell.get(id).some((j) =>
          s.live[j] && j !== i && s.placements[j].ids.every((c) => rest.has(c)));
        if (!any) { bad = true; break; }
      }
      if (bad) changed = s.kill(i, this.id) || changed;
    }
    return changed;
  },
};

// Assume a placement, run the cheap rules, and drop it if they contradict.
// This is the "if this, then that breaks" step. Expensive — run it last.
const depthOne = {
  id: "depth-one", tier: "advanced",
  run(s) {
    let changed = false;
    for (let i = 0; i < s.placements.length; i++) {
      if (!s.live[i]) continue;
      const p = s.placements[i];
      if (p.ids.some((id) => s.assigned.has(id))) continue;
      const snap = s.snapshot();
      const assignedSnap = new Map(s.assigned);
      const usedSnap = new Set(s.used);
      s.assign(i, this.id);
      runToFixpoint(s, [forcedCell, markSpan, markPartner]);
      const broke = s.dead;
      s.restore(snap);
      s.assigned = assignedSnap;
      s.used = usedSnap;
      s.dead = false;
      if (broke) changed = s.kill(i, this.id) || changed;
    }
    return changed;
  },
};

const RULES = [forcedCell, markSpan, markPartner, strandedRegion, unreachableCell, depthOne];
const TIERS = {
  easy: ["forced-cell", "mark-span", "mark-partner"],
  medium: ["forced-cell", "mark-span", "mark-partner", "stranded-region", "unreachable-cell"],
  hard: RULES.map((r) => r.id),
};

function runToFixpoint(s, rules) {
  let rounds = 0;
  for (;;) {
    let changed = false;
    for (const rule of rules) {
      changed = rule.run(s) || changed;
      if (s.dead) return rounds;
      if (changed) break; // restart from the cheapest rule
    }
    if (!changed) return rounds;
    rounds++;
    if (rounds > 5000) return rounds; // paranoia
  }
}

// --- entry point ----------------------------------------------------------

// Returns { solved, dead, forced, total, rounds, used, letters }.
// solved means every cell's letter is pinned, which is also the uniqueness proof.
function solve(region, names, marks, dots, side, ruleIds = TIERS.medium) {
  const rules = RULES.filter((r) => ruleIds.includes(r.id));
  const s = makeState(region, names, marks, dots, side);
  const rounds = runToFixpoint(s, rules);
  if (s.dead) return { solved: false, dead: true, forced: 0, total: s.cells.length, rounds, used: s.used };

  const letters = new Map();
  let forced = 0;
  for (const id of s.cells) {
    const cand = s.covering(id);
    if (!cand.length) return { solved: false, dead: true, forced, total: s.cells.length, rounds, used: s.used };
    const first = s.placements[cand[0]].name;
    if (cand.every((i) => s.placements[i].name === first)) { letters.set(id, first); forced++; }
  }
  return {
    solved: forced === s.cells.length,
    dead: false, forced, total: s.cells.length, rounds, used: s.used, letters,
  };
}

// The next thing a player could work out from where they are. Powers a hint
// button: run the solver on the givens and report a cell they have not filled.
function nextStep(region, names, marks, dots, side, filled, ruleIds = TIERS.medium) {
  const out = solve(region, names, marks, dots, side, ruleIds);
  if (!out.letters) return null;
  for (const [id, name] of out.letters) {
    if (filled.get(id) !== name) return { id, name, rules: [...out.used] };
  }
  return null;
}

// --- building -------------------------------------------------------------

// Grows a region and a tiling of it together, dropping pieces one at a time so
// each touches what is already there. Building the answer first is what makes
// sure there is one.
function buildTiled(random, names, pieces, side) {
  const region = new Set();
  const owner = new Map();
  const type = [];

  for (let piece = 0; piece < pieces; piece++) {
    const options = [];
    for (const name of names) {
      for (const shape of SHAPES[name]) {
        for (let r = 0; r < side; r++) {
          for (let c = 0; c < side; c++) {
            const cells = shape.map(([dr, dc]) => [r + dr, c + dc]);
            if (cells.some(([cr, cc]) => !inside(cr, cc, side) || region.has(cr * BIGGEST + cc))) continue;
            if (piece > 0) {
              const touches = cells.some(([cr, cc]) =>
                STEPS.some(([dr, dc]) =>
                  inside(cr + dr, cc + dc, side) && region.has((cr + dr) * BIGGEST + (cc + dc))));
              if (!touches) continue;
            }
            options.push([cells, name]);
          }
        }
      }
    }
    if (options.length === 0) return null;
    const [cells, name] = options[Math.floor(random() * options.length)];
    for (const [r, c] of cells) {
      region.add(r * BIGGEST + c);
      owner.set(r * BIGGEST + c, piece);
    }
    type[piece] = name;
  }

  const labels = new Map();
  for (const id of region) labels.set(id, type[owner.get(id)]);
  return { region, owner, type, labels };
}

// Every edge the intended answer could carry a mark on, with the mark it
// implies. Edges inside a piece are skipped: neither mark can go there, since
// "X" would be false and "=" would be vacuous.
function edgesOf(region, owner, labels, side) {
  const out = [];
  for (const id of region) {
    for (const step of [1, BIGGEST]) {
      if (step === 1 && id % BIGGEST === side - 1) continue;
      const other = id + step;
      if (!region.has(other)) continue;
      if (owner.get(id) === owner.get(other)) continue;
      out.push([[id, other], labels.get(id) === labels.get(other) ? "=" : "X"]);
    }
  }
  return out;
}

// Dots one cell in some of the pieces. Never two in a piece, since the rule is
// that a piece may cover at most one, and the answer has to obey it.
function dotUp(built, random, share) {
  const dots = new Set();
  const byPiece = new Map();
  for (const [id, piece] of built.owner) {
    if (!byPiece.has(piece)) byPiece.set(piece, []);
    byPiece.get(piece).push(id);
  }
  for (const cells of byPiece.values()) {
    if (random() > share) continue;
    dots.add(cells[Math.floor(random() * cells.length)]);
  }
  return dots;
}

// Clues, chosen for what they let a solver work out rather than for what they
// disambiguate.
//
// Every board must show all three kinds. Extra true clues can only ever help a
// solver and never hinder it, so one of each is seeded up front and held back
// from pruning: under the old minimise-for-uniqueness rule that felt like
// padding, and now it costs nothing at all.
//
// This always terminates on a tileable region. Marking every join kills any
// placement that crosses one, leaving each cell a single survivor, so
// forced-cell alone would finish. The search below is only ever finding a
// smaller set on the way to that floor.
// How many candidate joins are weighed each round. All of them was correct but
// slow; this trades a rare extra mark for a far shorter tail.
const SCAN_WIDTH = 16;

function cluesFor(built, names, random, side, ruleIds) {
  const region = built.region;
  const joins = edgesOf(region, built.owner, built.labels, side);
  const crosses = joins.filter(([, kind]) => kind === "X");
  const sames = joins.filter(([, kind]) => kind === "=");

  // A tiling with no same-shape join, or no different-shape join, cannot show
  // all three kinds. Rebuild rather than ship it short.
  if (!crosses.length || !sames.length) return null;
  const dots = dotUp(built, random, DOT_SHARE);
  if (!dots.size) return null;

  const required = [
    crosses[Math.floor(random() * crosses.length)],
    sames[Math.floor(random() * sames.length)],
  ];
  const requiredDot = [...dots][Math.floor(random() * dots.size)];

  const marks = [...required];
  const pool = shuffle(joins, random).filter((edge) => !marks.includes(edge));
  const run = (m, d) => solve(region, names, m, d, side, ruleIds);

  // Grow: add the mark that carries the solver furthest.
  //
  // Weighing every join each round is what made the big boards slow: a large
  // region offers around forty of them and a solve costs a good few
  // milliseconds, so a round ran into the hundreds. Only a window of them is
  // weighed, rotated each round so nothing is permanently ignored, and the
  // scan stops the moment a candidate finishes the puzzle outright, since
  // nothing can beat that.
  let guard = 0;
  while (!run(marks, dots).solved && guard++ < 500) {
    const available = pool.filter((edge) => !marks.includes(edge));
    if (!available.length) return null;
    const from = (guard - 1) * SCAN_WIDTH % available.length;
    const window = available
      .slice(from, from + SCAN_WIDTH)
      .concat(available.slice(0, Math.max(0, from + SCAN_WIDTH - available.length)));

    let best = null;
    let bestScore = run(marks, dots).forced;
    for (const edge of window) {
      const got = run([...marks, edge], dots);
      if (got.solved) { best = edge; break; }
      if (got.forced > bestScore) {
        bestScore = got.forced;
        best = edge;
      }
    }
    // On a plateau no single mark helps, so take any and let the next round
    // find one that now does.
    if (!best) best = available[0];
    marks.push(best);
  }
  if (!run(marks, dots).solved) return null;

  // Prune against the solver rather than against uniqueness, and never touch
  // the three seeded clues.
  for (let i = marks.length - 1; i >= 0; i--) {
    if (required.includes(marks[i])) continue;
    const kept = marks[i];
    marks.splice(i, 1);
    if (!run(marks, dots).solved) marks.splice(i, 0, kept);
  }
  for (const dot of [...dots]) {
    if (dot === requiredDot) continue;
    dots.delete(dot);
    if (!run(marks, dots).solved) dots.add(dot);
  }

  const final = run(marks, dots);
  return { marks, dots, used: [...final.used] };
}

// The cells of each piece in the tiling, as it was built.
function piecesOf(built) {
  const byPiece = new Map();
  for (const [id, piece] of built.owner) {
    if (!byPiece.has(piece)) byPiece.set(piece, []);
    byPiece.get(piece).push(id);
  }
  return [...byPiece.values()].map((cells) => cells.sort((a, b) => a - b));
}

// How hard the answer actually is: the cheapest set of rules that still
// finishes it. Board size is a separate axis entirely — a big board with
// generous clues can be easier than a small mean one.
function gradeOf(region, names, marks, dots, side) {
  for (const tier of ["easy", "medium", "hard"]) {
    if (solve(region, names, marks, dots, side, TIERS[tier]).solved) return tier;
  }
  return null;
}

// --- a day's puzzle -------------------------------------------------------

const SHAPE_COUNT = 2;
// Nearly every piece starts dotted; the ones doing nothing are pruned away.
const DOT_SHARE = 0.9;
// Rebuilds allowed when a tiling cannot supply all three kinds of clue.
const ATTEMPTS = 60;
// The rules a player is expected to bring. Everything is built to be solvable
// with exactly these and no guessing.
const TIER = "medium";

function makePuzzle(seed, sizeIndex) {
  const board = SIZES[sizeIndex];
  const ruleIds = TIERS[TIER];

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const random = makeRandom(hashString(`${seed}/${board.name}/${attempt}`));
    // Two shapes. Three would need a great many clues to pin the answer down,
    // and would mean a third click on every cell.
    const names = shuffle(SHAPE_NAMES, random).slice(0, SHAPE_COUNT).sort();
    const pieces = board.min + Math.floor(random() * (board.max - board.min + 1));

    const built = buildTiled(random, names, pieces, board.side);
    if (!built) continue;
    const clues = cluesFor(built, names, random, board.side, ruleIds);
    if (!clues) continue;

    // It has to *need* the rules it is built for, not merely survive them.
    // Pruning already drops every clue it can while the target rules still
    // finish, so a board the easier rules can also polish off is simply an
    // easier board: there is nothing to take away to toughen it, only another
    // tiling to try. About one in five comes out this way.
    const grade = gradeOf(built.region, names, clues.marks, clues.dots, board.side);
    if (grade !== TIER) continue;

    return {
      seed, names, pieces, side: board.side, size: board.name,
      region: [...built.region].sort((a, b) => a - b),
      labels: [...built.labels.entries()],
      // The pieces as they were cut. The answer's letters are unique, but more
      // than one cut can produce them, so this is *a* correct tiling rather
      // than the only one.
      pieces: piecesOf(built),
      marks: clues.marks,
      dots: [...clues.dots].sort((a, b) => a - b),
      // Which rules the answer really needed, which is the honest difficulty.
      grade: grade,
      rulesUsed: clues.used,
    };
  }
  throw new Error(`could not build a ${TIER} ${board.name} puzzle for ${seed}`);
}

if (typeof module !== "undefined") {
  module.exports = {
    BIGGEST, SIZES, PIECE, BASE, SHAPES, SHAPE_NAMES, STEPS, hashString, makeRandom, shuffle,
    orientations, placementsFor, buildTiled, edgesOf, dotUp,
    // Kept for tests: an independent count of the answers, which the solver
    // path no longer needs but which can still check its work.
    countLabellings,
    solve, nextStep, RULES, TIERS, cluesFor, gradeOf, piecesOf, makePuzzle,
  };
}
