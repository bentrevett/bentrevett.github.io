// Puzzle logic for the 1-2-3-3-3 sudoku variants. No DOM in here, so the same
// file runs in the page and under Node for testing.
//
// The object is a frequency square F(6; 1,2,3): every row and column holds
// exactly one 1, two 2s and three 3s. Ported from the verified Python in
// fixed.py, including its validator, which every grid is asserted against.

const SIZE = 6;
const LIMIT = [0, 1, 2, 3]; // how many of each value a unit may hold
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

// The six rulesets. Regions are what changes; the anti-king flag bans 1s from
// touching, diagonals included.
const VARIANTS = [
  { id: 1, name: "Plain", regions: "none", antiking: false },
  { id: 2, name: "Blocks", regions: "blocks", antiking: false },
  { id: 3, name: "Jigsaw", regions: "jigsaw", antiking: false },
  { id: 4, name: "Plain, lonely ones", regions: "none", antiking: true },
  { id: 5, name: "Blocks, lonely ones", regions: "blocks", antiking: true },
  { id: 6, name: "Jigsaw, lonely ones", regions: "jigsaw", antiking: true },
];

// Every distinct arrangement of one 1, two 2s and three 3s: 6!/(1!2!3!) = 60.
const ROWS = (function () {
  const out = [];
  const walk = (left, row) => {
    if (row.length === SIZE) { out.push(row.slice()); return; }
    for (const v of [1, 2, 3]) {
      if (left[v] === 0) continue;
      left[v] -= 1;
      row.push(v);
      walk(left, row);
      row.pop();
      left[v] += 1;
    }
  };
  walk([0, 1, 2, 3], []);
  return out;
})();

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

// --- regions --------------------------------------------------------------

// With no extra regions the rows stand in as regions. They are already
// satisfied by the row rule, so the same machinery covers every variant
// without a special case for "no blocks".
function rowRegions() {
  return Array.from({ length: SIZE }, (_, r) => Array(SIZE).fill(r));
}

// Two rows tall, three columns wide, so six of them tile the grid.
function blockRegions() {
  return Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => Math.floor(r / 2) * 2 + Math.floor(c / 3))
  );
}

// Six connected hexominoes, grown one cell at a time. Growing can strand a
// pocket smaller than six, so it restarts until a tiling comes out whole.
function jigsawRegions(random) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
    let ok = true;
    for (let id = 0; id < SIZE && ok; id++) {
      let start = null;
      for (let r = 0; r < SIZE && !start; r++) {
        for (let c = 0; c < SIZE && !start; c++) if (grid[r][c] === -1) start = [r, c];
      }
      if (!start) { ok = false; break; }
      const region = [start];
      grid[start[0]][start[1]] = id;
      while (region.length < SIZE) {
        const frontier = [];
        for (const [r, c] of region) {
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc] === -1) {
              frontier.push([nr, nc]);
            }
          }
        }
        if (frontier.length === 0) { ok = false; break; }
        const [r, c] = frontier[Math.floor(random() * frontier.length)];
        grid[r][c] = id;
        region.push([r, c]);
      }
    }
    if (ok) return grid;
  }
  return blockRegions();
}

function regionsFor(variant, random) {
  if (variant.regions === "blocks") return blockRegions();
  if (variant.regions === "jigsaw") return jigsawRegions(random);
  return rowRegions();
}

// --- filling --------------------------------------------------------------

// One full grid, built a row at a time.
//
// The region tallies accumulate per row rather than per cell: a row can cross
// the same jigsaw region more than once, and testing each cell against a +1
// budget silently let those through. That bug is what HANDOFF.md warns about.
function fillGrid(regions, antiking, random) {
  const colCount = Array.from({ length: SIZE }, () => [0, 0, 0, 0]);
  const regionCount = Array.from({ length: SIZE }, () => [0, 0, 0, 0]);
  const grid = [];

  const walk = (r, previousOne) => {
    if (r === SIZE) return true;
    for (const row of shuffle(ROWS, random)) {
      const one = row.indexOf(1);
      // Every row holds exactly one 1, so 1s can only clash between
      // neighbouring rows, and only when their columns are within one.
      if (antiking && previousOne !== null && Math.abs(one - previousOne) < 2) continue;
      if (row.some((v, c) => colCount[c][v] + 1 > LIMIT[v])) continue;

      const delta = new Map();
      row.forEach((v, c) => {
        const key = regions[r][c] * 4 + v;
        delta.set(key, (delta.get(key) || 0) + 1);
      });
      let fits = true;
      for (const [key, n] of delta) {
        if (regionCount[Math.floor(key / 4)][key % 4] + n > LIMIT[key % 4]) { fits = false; break; }
      }
      if (!fits) continue;

      row.forEach((v, c) => { colCount[c][v] += 1; });
      for (const [key, n] of delta) regionCount[Math.floor(key / 4)][key % 4] += n;
      grid.push(row.slice());

      if (walk(r + 1, one)) return true;

      grid.pop();
      row.forEach((v, c) => { colCount[c][v] -= 1; });
      for (const [key, n] of delta) regionCount[Math.floor(key / 4)][key % 4] -= n;
    }
    return false;
  };

  return walk(0, null) ? grid : null;
}

// --- validating -----------------------------------------------------------

// Independent of the filler on purpose: a previous bug produced silently
// invalid grids, so every grid is asserted against this before it ships.
function check(grid, regions, antiking) {
  const wanted = [1, 2, 2, 3, 3, 3].join();
  for (let r = 0; r < SIZE; r++) {
    if ([...grid[r]].sort().join() !== wanted) return false;
  }
  for (let c = 0; c < SIZE; c++) {
    if (grid.map((row) => row[c]).sort().join() !== wanted) return false;
  }
  for (let b = 0; b < SIZE; b++) {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if (regions[r][c] === b) cells.push(grid[r][c]);
    }
    if (cells.sort().join() !== wanted) return false;
  }
  if (antiking) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== 1) continue;
        for (const [dr, dc] of KING) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc] === 1) return false;
        }
      }
    }
  }
  return true;
}

// --- solving --------------------------------------------------------------

// Rows, columns and regions as one list of units, with the units each cell
// belongs to, so a placement updates every tally it touches at once.
function buildUnits(regions) {
  const units = [];
  for (let r = 0; r < SIZE; r++) units.push(Array.from({ length: SIZE }, (_, c) => [r, c]));
  for (let c = 0; c < SIZE; c++) units.push(Array.from({ length: SIZE }, (_, r) => [r, c]));
  for (let b = 0; b < SIZE; b++) {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if (regions[r][c] === b) cells.push([r, c]);
    }
    units.push(cells);
  }
  const membership = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => []));
  units.forEach((unit, i) => { for (const [r, c] of unit) membership[r][c].push(i); });
  return { units, membership };
}

// Counts solutions, stopping at `cap`. Two is all carving ever needs to know.
function countSolutions(puzzle, regions, antiking, cap) {
  const { units, membership } = buildUnits(regions);
  const count = units.map(() => [0, 0, 0, 0]);
  const grid = puzzle.map((row) => row.slice());

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c];
      if (!v) continue;
      for (const i of membership[r][c]) {
        count[i][v] += 1;
        if (count[i][v] > LIMIT[v]) return 0;
      }
    }
  }

  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empty.push([r, c]);
  }

  let found = 0;
  const rec = (k) => {
    if (found >= cap) return;
    if (k === empty.length) { found += 1; return; }
    const [r, c] = empty[k];
    for (const v of [1, 2, 3]) {
      if (!membership[r][c].every((i) => count[i][v] < LIMIT[v])) continue;
      if (v === 1 && antiking) {
        let clash = false;
        for (const [dr, dc] of KING) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc] === 1) { clash = true; break; }
        }
        if (clash) continue;
      }
      grid[r][c] = v;
      for (const i of membership[r][c]) count[i][v] += 1;
      rec(k + 1);
      for (const i of membership[r][c]) count[i][v] -= 1;
      grid[r][c] = 0;
      if (found >= cap) return;
    }
  };
  rec(0);
  return found;
}

// --- carving --------------------------------------------------------------

// Strip clues one at a time, in a random order, keeping only the removals that
// leave the answer unique. Greedy, so the result is a local minimum: few
// clues, not provably the fewest.
function carve(solution, regions, antiking, random) {
  const puzzle = solution.map((row) => row.slice());
  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cells.push([r, c]);

  for (const [r, c] of shuffle(cells, random)) {
    const kept = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle, regions, antiking, 2) !== 1) puzzle[r][c] = kept;
  }
  return puzzle;
}

// One puzzle for one ruleset. Throws rather than shipping a grid that fails
// the independent validator.
function makePuzzle(variant, random) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const regions = regionsFor(variant, random);
    const solution = fillGrid(regions, variant.antiking, random);
    if (!solution) continue;
    if (!check(solution, regions, variant.antiking)) {
      throw new Error(`variant ${variant.id}: filler produced an invalid grid`);
    }
    const puzzle = carve(solution, regions, variant.antiking, random);
    let clues = 0;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (puzzle[r][c]) clues += 1;
    return { variant: variant.id, regions, solution, puzzle, clues };
  }
  throw new Error(`variant ${variant.id}: could not build a grid`);
}

// All six rulesets for one seed. Each gets its own stream, so changing one
// variant's luck cannot shift the others.
function makeDay(seed) {
  return VARIANTS.map((variant) =>
    makePuzzle(variant, makeRandom(hashString(`${seed}/${variant.id}`)))
  );
}

if (typeof module !== "undefined") {
  module.exports = {
    SIZE, VARIANTS, ROWS, hashString, makeRandom, shuffle,
    rowRegions, blockRegions, jigsawRegions, regionsFor,
    fillGrid, check, buildUnits, countSolutions, carve, makePuzzle, makeDay,
  };
}
