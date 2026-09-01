// Puzzle logic for Minesweeper Sudoku. No DOM in here, so the same file runs
// in the page and under Node for testing.
//
// Every row, column and region is half filled. Half is the only share that
// works: the rows fix how many filled cells the grid holds, and the regions
// have to add up to the same number. Regions hold as many cells as the grid is
// wide, so every group on the board — row, column or region — asks for exactly
// the same count, which is half the width.
//
// A clue says how many of the nine cells around it, itself included, are
// filled, clipped at the edges. A clue cell can be filled like any other:
// the number tells you nothing about the cell it sits in.
//
// Everything here is one kind of statement — "exactly N of these cells are
// filled". Rows, columns, regions and clues all say that, so a single solver
// serves them all, and what it settles without ever guessing is exactly what a
// player can settle by reasoning.

// Two boards wide, three sets of rules deep. A smaller grid is less to hold in
// your head; the regions are an extra thing to count with, so Plain is the
// bare puzzle and the other two hand you more to work from.
const SIZES = [
  { name: "Small", side: 6 },
  { name: "Medium", side: 8 },
];

const REGIONS = ["none", "blocks", "jigsaw"];

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

function shuffle(items, random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- the grid -------------------------------------------------------------

// Everything a size implies, worked out once.
function shapeOf(size) {
  return {
    name: size.name,
    side: size.side,
    cells: size.side * size.side,
    // Rows, columns and regions all want this many, which is what makes the
    // rules one sentence rather than three.
    half: size.side / 2,
    // Blocks are two rows deep, so a region holds as many cells as the grid is
    // wide: two by three, two by four, two by five.
    blockRows: 2,
    blockColumns: size.side / 2,
  };
}

const rowOf = (cell, shape) => Math.floor(cell / shape.side);
const columnOf = (cell, shape) => cell % shape.side;

// The cells a clue in this one looks at: itself and its eight neighbours,
// whatever survives the edge of the grid.
function windowOf(cell, shape) {
  const r = rowOf(cell, shape), c = columnOf(cell, shape);
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < shape.side && cc >= 0 && cc < shape.side) cells.push(rr * shape.side + cc);
    }
  }
  return cells;
}

// Rectangular regions, laid out left to right and top to bottom.
function blockRegions(shape) {
  const regions = new Int8Array(shape.cells);
  const across = shape.side / shape.blockColumns;
  for (let cell = 0; cell < shape.cells; cell++) {
    regions[cell] =
      Math.floor(rowOf(cell, shape) / shape.blockRows) * across +
      Math.floor(columnOf(cell, shape) / shape.blockColumns);
  }
  return regions;
}

// Regions grown a cell at a time from wherever the last one left off. A run
// can paint itself into a corner and leave a region short, so a failed attempt
// is simply thrown away and started again.
function jigsawRegions(shape, random) {
  const want = shape.side; // cells per region, which is also how many regions
  for (let attempt = 0; attempt < 500; attempt++) {
    const regions = new Int8Array(shape.cells).fill(-1);
    let ok = true;
    for (let id = 0; id < want && ok; id++) {
      let start = -1;
      for (let cell = 0; cell < shape.cells && start < 0; cell++) {
        if (regions[cell] === -1) start = cell;
      }
      if (start < 0) { ok = false; break; }
      regions[start] = id;
      let held = 1;
      while (held < want) {
        // Every free cell touching the region so far, one of which is taken.
        const frontier = [];
        for (let cell = 0; cell < shape.cells; cell++) {
          if (regions[cell] !== id) continue;
          const r = rowOf(cell, shape), c = columnOf(cell, shape);
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= shape.side || nc < 0 || nc >= shape.side) continue;
            const next = nr * shape.side + nc;
            if (regions[next] === -1) frontier.push(next);
          }
        }
        if (!frontier.length) { ok = false; break; }
        regions[frontier[Math.floor(random() * frontier.length)]] = id;
        held++;
      }
    }
    if (ok) return regions;
  }
  // Rectangles always work, and are a fair stand-in on the rare board where
  // the growing does not.
  return blockRegions(shape);
}

function regionsFor(shape, kind, random) {
  if (kind === "blocks") return blockRegions(shape);
  if (kind === "jigsaw") return jigsawRegions(shape, random);
  return null;
}

// One full grid, laid down a row at a time.
//
// Rows rather than single cells, and whole balanced rows at that: a row that
// is already half filled cannot break its own rule, so every step is a step
// the columns and regions can immediately judge. Filling cell by cell in a
// shuffled order looks more natural and is far worse — the counts only bite
// near the end, and an awkward jigsaw can send it into half a minute of
// backtracking.
//
// Returns null if it runs out of budget, which is the caller's cue to try a
// different layout rather than to keep digging.
const GRID_BUDGET = 20000;

function balancedRows(shape) {
  const rows = [];
  for (let mask = 0; mask < 1 << shape.side; mask++) {
    let bits = 0;
    for (let i = 0; i < shape.side; i++) if (mask & (1 << i)) bits++;
    if (bits === shape.half) rows.push(mask);
  }
  return rows;
}

function randomGrid(random, shape, regions) {
  const patterns = balancedRows(shape);
  const grid = new Int8Array(shape.cells);
  const columns = new Int8Array(shape.side);
  const inRegion = new Int8Array(regions ? shape.side : 0);
  // How many cells each region still has in the rows not yet laid down.
  const regionLeft = new Int8Array(regions ? shape.side : 0);
  if (regions) for (const id of regions) regionLeft[id]++;

  let budget = GRID_BUDGET;

  const walk = (r) => {
    if (r === shape.side) return true;
    const below = shape.side - r - 1;
    // Shuffled afresh for each row. One order shared by every row would have
    // the rows all reaching for the same patterns first, and the grids would
    // come out looking made rather than drawn.
    for (const pattern of shuffle(patterns, random)) {
      if (budget-- <= 0) return false;

      let fits = true;
      for (let c = 0; c < shape.side && fits; c++) {
        const bit = (pattern >> c) & 1;
        const now = columns[c] + bit;
        if (now > shape.half || now + below < shape.half) fits = false;
      }
      if (!fits) continue;

      if (regions) {
        for (let c = 0; c < shape.side; c++) {
          const id = regions[r * shape.side + c];
          inRegion[id] += (pattern >> c) & 1;
          regionLeft[id]--;
        }
        for (let id = 0; id < shape.side && fits; id++) {
          if (inRegion[id] > shape.half || inRegion[id] + regionLeft[id] < shape.half) fits = false;
        }
      }

      if (fits) {
        for (let c = 0; c < shape.side; c++) {
          grid[r * shape.side + c] = (pattern >> c) & 1;
          columns[c] += (pattern >> c) & 1;
        }
        if (walk(r + 1)) return true;
        for (let c = 0; c < shape.side; c++) columns[c] -= (pattern >> c) & 1;
      }

      if (regions) {
        for (let c = 0; c < shape.side; c++) {
          const id = regions[r * shape.side + c];
          inRegion[id] -= (pattern >> c) & 1;
          regionLeft[id]++;
        }
      }
    }
    return false;
  };

  return walk(0) ? grid : null;
}

// What a clue in this cell would read on this grid.
function clueValue(grid, cell, shape) {
  let count = 0;
  for (const other of windowOf(cell, shape)) if (grid[other] === 1) count++;
  return count;
}

// Every clue the grid could show, one per cell.
function cluesOf(grid, shape) {
  const out = [];
  for (let cell = 0; cell < shape.cells; cell++) {
    out.push({ cell, value: clueValue(grid, cell, shape) });
  }
  return out;
}

// A finished grid, checked against the rules from scratch rather than against
// the way it was built.
function isValid(grid, clues, shape, regions) {
  const filled = {
    row: new Int8Array(shape.side),
    column: new Int8Array(shape.side),
    region: new Int8Array(regions ? shape.side : 0),
  };
  for (let cell = 0; cell < shape.cells; cell++) {
    if (grid[cell] !== 1) continue;
    filled.row[rowOf(cell, shape)]++;
    filled.column[columnOf(cell, shape)]++;
    if (regions) filled.region[regions[cell]]++;
  }
  for (let i = 0; i < shape.side; i++) {
    if (filled.row[i] !== shape.half || filled.column[i] !== shape.half) return false;
    if (regions && filled.region[i] !== shape.half) return false;
  }
  for (const { cell, value } of clues || []) if (clueValue(grid, cell, shape) !== value) return false;
  return true;
}

// --- solving by reasoning -------------------------------------------------

// Every "exactly N of these" statement the board makes: one per row, column
// and region, and one per clue.
function groupsFor(clues, shape, regions) {
  const groups = [];
  for (let r = 0; r < shape.side; r++) {
    groups.push({
      cells: Array.from({ length: shape.side }, (_, c) => r * shape.side + c),
      want: shape.half,
    });
  }
  for (let c = 0; c < shape.side; c++) {
    groups.push({
      cells: Array.from({ length: shape.side }, (_, r) => r * shape.side + c),
      want: shape.half,
    });
  }
  if (regions) {
    for (let id = 0; id < shape.side; id++) {
      const cells = [];
      for (let cell = 0; cell < shape.cells; cell++) if (regions[cell] === id) cells.push(cell);
      groups.push({ cells, want: shape.half });
    }
  }
  for (const { cell, value } of clues) groups.push({ cells: windowOf(cell, shape), want: value });
  return groups;
}

// Reason as far as these clues allow, using two rules and nothing else:
//
//   full     a group whose count is already met has blanks for the rest, and
//            one that needs everything it has left fills all of it.
//   overlap  where one group's unsettled cells sit wholly inside another's,
//            the cells outside hold exactly the difference between the two
//            counts. This is what lets two clues a cell apart say something
//            neither says alone, and it is the move this puzzle is about.
//
// Neither rule ever guesses, so whatever comes out is forced, and a clue set
// they can finish has exactly one answer. `settled` is how many cells came
// out; `order` is the order they came out in, which is what a hint walks
// through. `broken` means the clues contradict each other, which cannot happen
// for clues read off a real grid.
//
// Cell sets are held as machine words rather than as lists, which keeps the
// subset test the overlap rule leans on down to a handful of operations. How
// many cells are in a set is tracked alongside it rather than counted out of
// it, so nothing here has to count bits.
function reason(clues, shape, regions, useOverlap = true) {
  const groups = groupsFor(clues, shape, regions);
  const count = groups.length;
  const words = Math.ceil(shape.cells / 32);
  const value = new Int8Array(shape.cells).fill(-1);
  const order = [];

  // Per group: the cells still unsettled, how many there are, and how many of
  // them are filled.
  const open = new Int32Array(count * words);
  const room = new Int16Array(count);
  const need = new Int16Array(count);
  const holding = [];
  for (let cell = 0; cell < shape.cells; cell++) holding.push([]);

  groups.forEach((group, i) => {
    for (const cell of group.cells) {
      open[i * words + (cell >> 5)] |= 1 << (cell & 31);
      holding[cell].push(i);
    }
    room[i] = group.cells.length;
    need[i] = group.want;
  });

  let broken = false;

  const settle = (cell, filled) => {
    if (value[cell] !== -1) {
      if (value[cell] !== filled) broken = true;
      return;
    }
    value[cell] = filled;
    order.push(cell);
    const word = cell >> 5, mask = ~(1 << (cell & 31));
    for (const i of holding[cell]) {
      open[i * words + word] &= mask;
      room[i]--;
      if (filled) need[i]--;
      if (need[i] < 0 || need[i] > room[i]) broken = true;
    }
  };

  // Fill a group's remaining cells, or the part of one group that lies outside
  // another, all the same way.
  const fillOpen = (i, filled, skip) => {
    let moved = false;
    for (const cell of groups[i].cells) {
      if (value[cell] !== -1) continue;
      if (skip >= 0 && (open[skip * words + (cell >> 5)] & (1 << (cell & 31)))) continue;
      settle(cell, filled);
      moved = true;
    }
    return moved;
  };

  // Is every unsettled cell of i also unsettled in j?
  const inside = (i, j) => {
    for (let w = 0; w < words; w++) {
      if ((open[i * words + w] & ~open[j * words + w]) !== 0) return false;
    }
    return true;
  };

  for (;;) {
    let moved = false;

    for (let i = 0; i < count && !broken; i++) {
      if (room[i] === 0) continue;
      if (need[i] === 0) moved = fillOpen(i, 0, -1) || moved;
      else if (need[i] === room[i]) moved = fillOpen(i, 1, -1) || moved;
    }
    if (broken) break;
    // The cheap rule first, and only when it stalls is it worth comparing
    // every pair of groups.
    if (moved) continue;
    if (!useOverlap) break;

    // The counts are compared before the sets are: arithmetic on two numbers
    // throws out almost every pair, and only what survives is worth the subset
    // test. A pass runs to the end rather than restarting at the first
    // deduction it finds, which on a large board is the difference between
    // milliseconds and half a minute.
    for (let i = 0; i < count && !broken; i++) {
      if (room[i] === 0) continue;
      for (let j = 0; j < count && !broken; j++) {
        if (j === i || room[j] <= room[i]) continue;
        const owed = need[j] - need[i];
        const outside = room[j] - room[i];
        // Nothing follows unless the difference fills the cells outside or
        // leaves them all blank. A negative difference is a contradiction, but
        // only once the sets really do nest.
        if (owed > 0 && owed !== outside) continue;
        if (!inside(i, j)) continue;
        if (owed < 0) { broken = true; break; }
        moved = fillOpen(j, owed === 0 ? 0 : 1, i) || moved;
      }
    }
    if (!moved || broken) break;
  }

  return { value, order, settled: order.length, broken };
}

// --- a day's puzzle -------------------------------------------------------

// Grids where reasoning alone cannot finish even with every cell clued, and
// clue sets that come out needing no overlap reasoning at all, are both thrown
// back.
const ATTEMPTS = 60;

// Drop clues one at a time, in a shuffled order, keeping only those the solver
// still cannot manage without. What is left is a board with nothing spare on
// it, which is where the reasoning gets interesting.
function pruneClues(clues, shape, regions, random) {
  let kept = clues;
  for (const clue of shuffle(clues, random)) {
    const without = kept.filter((other) => other !== clue);
    if (reason(without, shape, regions).settled === shape.cells) kept = without;
  }
  return kept;
}

function makePuzzle(seed, sizeIndex, regionKind) {
  const shape = shapeOf(SIZES[sizeIndex]);
  const kind = regionKind || "none";

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const random = makeRandom(hashString(`${seed}/${shape.name}/${kind}/${attempt}`));
    const regions = regionsFor(shape, kind, random);
    const answer = randomGrid(random, shape, regions);
    // An awkward set of regions can have no balanced grid within reach; the
    // next attempt draws different ones.
    if (!answer) continue;
    const every = cluesOf(answer, shape);
    // A grid nobody could reason out even seeing every clue is no use.
    if (reason(every, shape, regions).settled !== shape.cells) continue;

    const clues = pruneClues(every, shape, regions, random);
    // It has to need the overlap rule, not merely survive it: a board the
    // plain full-and-empty rule can polish off on its own is a counting
    // exercise rather than a puzzle.
    if (reason(clues, shape, regions, false).settled === shape.cells) continue;

    return {
      seed,
      size: shape.name,
      kind,
      shape,
      regions: regions ? Array.from(regions) : null,
      answer: Array.from(answer),
      clues: clues.map(({ cell, value }) => ({ cell, value })),
      // The order the solver settled the cells in, which is the order a hint
      // hands them out: always a cell you could have worked out by now.
      order: reason(clues, shape, regions).order,
    };
  }
  throw new Error(`could not build a ${shape.name} ${kind} puzzle for ${seed}`);
}

if (typeof module !== "undefined") {
  module.exports = {
    SIZES, REGIONS, shapeOf,
    hashString, makeRandom, shuffle,
    rowOf, columnOf, windowOf,
    blockRegions, jigsawRegions, regionsFor,
    balancedRows, randomGrid, clueValue, cluesOf, isValid,
    groupsFor, reason, pruneClues, makePuzzle,
  };
}
