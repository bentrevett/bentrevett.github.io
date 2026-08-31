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

// Adds clues until only one labelling survives, then drops the ones that were
// not pulling their weight. The same shape as carving clues out of a sudoku.
//
// Dots go on first and are pruned last, so the edge marks that remain are the
// ones the dots could not account for on their own.
function clueUp(built, names, random, dots, side) {
  const marks = [];
  const count = (m, d) => countLabellings(built.region, names, m, d, side, 2);

  if (count(marks, dots) !== 1) {
    for (const edge of shuffle(edgesOf(built.region, built.owner, built.labels, side), random)) {
      marks.push(edge);
      if (count(marks, dots) === 1) break;
    }
    if (count(marks, dots) !== 1) return null;
  }

  for (let i = marks.length - 1; i >= 0; i--) {
    const kept = marks[i];
    marks.splice(i, 1);
    if (count(marks, dots) !== 1) marks.splice(i, 0, kept);
  }
  for (const dot of [...dots]) {
    dots.delete(dot);
    if (count(marks, dots) !== 1) dots.add(dot);
  }
  return { marks, dots };
}

// --- a day's puzzle -------------------------------------------------------

const SHAPE_COUNT = 2;
// Nearly every piece starts dotted, and dots doing nothing are pruned away.
// Dots and marks compete for the same work, and starting generous is what
// leaves any dots standing at all once the marks have gone on.
const DOT_SHARE = 0.9;
const ATTEMPTS = 400;

// Every grid must show all three kinds of clue: a dot, an X and an =. Only
// about one candidate in fifty manages it on its own, so a good many are built
// and the busiest of the qualifying ones kept.
//
// Nothing is ever added just to satisfy this. A clue that could be removed
// without letting a second answer in would be a lie about the puzzle, so a
// grid that does not need one of each is thrown away rather than padded.
function hasEveryKind(clues) {
  return (
    clues.dots.size > 0 &&
    clues.marks.some(([, kind]) => kind === "X") &&
    clues.marks.some(([, kind]) => kind === "=")
  );
}

// Puzzles with more clues in them are the interesting ones, so the busiest of
// the qualifying candidates is kept.
const WANT_CLUES = 7;

function makePuzzle(seed, sizeIndex) {
  const board = SIZES[sizeIndex];
  let best = null;
  let fallback = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const random = makeRandom(hashString(`${seed}/${board.name}/${attempt}`));
    // Two shapes. Three would need a great many clues to pin the answer down,
    // and would mean a third click on every cell.
    const names = shuffle(SHAPE_NAMES, random).slice(0, SHAPE_COUNT).sort();
    const pieces = board.min + Math.floor(random() * (board.max - board.min + 1));

    const built = buildTiled(random, names, pieces, board.side);
    if (!built) continue;
    const clues = clueUp(built, names, random, dotUp(built, random, DOT_SHARE), board.side);
    if (!clues) continue;

    const made = {
      seed, names, pieces, side: board.side, size: board.name,
      total: clues.marks.length + clues.dots.size,
      region: [...built.region].sort((a, b) => a - b),
      labels: [...built.labels.entries()],
      marks: clues.marks,
      dots: [...clues.dots].sort((a, b) => a - b),
    };
    if (!fallback) fallback = made;
    if (!hasEveryKind(clues)) continue;

    if (!best || made.total > best.total) best = made;
    if (best.total >= WANT_CLUES) break;
  }

  // Only if four hundred candidates all came up short of one kind, which the
  // measured odds put out of reach. A playable puzzle beats none.
  const chosen = best || fallback;
  if (!chosen) throw new Error(`could not build a ${board.name} puzzle for ${seed}`);
  return chosen;
}

if (typeof module !== "undefined") {
  module.exports = {
    BIGGEST, SIZES, PIECE, BASE, SHAPES, SHAPE_NAMES, STEPS, hashString, makeRandom, shuffle,
    orientations, placementsFor, countLabellings, buildTiled, edgesOf, dotUp, clueUp, makePuzzle,
  };
}
