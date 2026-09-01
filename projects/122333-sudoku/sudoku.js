// Puzzle logic for the 1-2-3-3-3 sudoku variants. No DOM in here, so the same
// file runs in the page and under Node for testing.
//
// The object is a frequency square F(6; 1,2,3): every row and column holds
// exactly one 1, two 2s and three 3s. Every grid built here is asserted
// against a validator that checks those counts from scratch.

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
// budget silently let those grids through.
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

// --- solving by hand ------------------------------------------------------

// Solves the way a person would, with no guessing, and reports which
// techniques it needed. That is what difficulty is measured against: a search
// solver only answers "is the answer unique", a far weaker bar than "does this
// take any thinking".
//
//   scanning  a cell with only one value left
//   counting  a unit needing n more of a value, with exactly n cells still
//             able to take it. Ordinary sudoku only ever has n = 1; here a row
//             wants two 2s and three 3s, so several cells can fall at once
//   locked    every place a region has left for a value sits in one line, and
//             that line needs exactly as many as the region does, so the rest
//             of the line cannot have it. Needs real regions
//   dual      the same in reverse: every place a line has left for a value
//             sits inside one region, so the rest of the region cannot have
//             it. Fires independently of locked, and in practice only on
//             jigsaws: regular blocks line up with rows and columns too neatly
//             for a line's homes to fall inside one block
//   pairs     a row holds exactly one 1, so if its 1 is cornered into a few
//             columns, the next row's 1 cannot sit beside all of them. Needs
//             the lonely ones rule
//
// Naked sets and fish patterns are deliberately absent. Fish ought to work on
// the 1s, which form a permutation matrix since there is exactly one per row
// and per column, but on a grid this small the pattern almost never forms
// before something simpler resolves it: seven firings in eighteen hundred
// puzzles. With only three values a naked set on
// two of them is the exact complement of a counting deduction on the third, so
// counting always fires first; across eighteen hundred puzzles it never once
// had anything to do.
//
// Unlike the placement techniques, locked and pairs work by *elimination*, so
// candidates are carried in a grid of sets rather than recomputed each time.
function logicSolve(puzzle, regions, antiking, tier) {
  const { units, membership } = buildUnits(regions);
  const grid = puzzle.map((row) => row.slice());
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    candidates.push([]);
    for (let c = 0; c < SIZE; c++) {
      candidates[r].push(grid[r][c] ? new Set() : new Set([1, 2, 3]));
    }
  }
  const used = { scanning: 0, counting: 0, locked: 0, dual: 0, pairs: 0 };

  const placed = (unit, value) => unit.filter(([r, c]) => grid[r][c] === value).length;
  const drop = (r, c, value) => candidates[r][c].delete(value);

  function assign(r, c, value) {
    grid[r][c] = value;
    candidates[r][c] = new Set();
    for (const i of membership[r][c]) {
      if (placed(units[i], value) >= LIMIT[value]) {
        for (const [ur, uc] of units[i]) drop(ur, uc, value);
      }
    }
    if (value === 1 && antiking) {
      for (const [dr, dc] of KING) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) drop(nr, nc, 1);
      }
    }
  }

  // The clues eliminate before anything else is tried.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (grid[r][c]) assign(r, c, grid[r][c]);
  }

  for (;;) {
    let moved = false;

    for (let r = 0; r < SIZE && !moved; r++) {
      for (let c = 0; c < SIZE && !moved; c++) {
        if (grid[r][c]) continue;
        // Nothing fits here, so the grid as given is already broken.
        if (candidates[r][c].size === 0) return { solved: false, used };
        if (candidates[r][c].size === 1) {
          assign(r, c, [...candidates[r][c]][0]);
          used.scanning += 1;
          moved = true;
        }
      }
    }
    if (moved) continue;

    if (tier >= 2) {
      for (let i = 0; i < units.length && !moved; i++) {
        for (const value of [1, 2, 3]) {
          const need = LIMIT[value] - placed(units[i], value);
          const homes = units[i].filter(([r, c]) => !grid[r][c] && candidates[r][c].has(value));
          if (need > 0 && homes.length === need) {
            for (const [r, c] of homes) assign(r, c, value);
            used.counting += 1;
            moved = true;
            break;
          }
        }
      }
      if (moved) continue;
    }

    if (tier >= 3) {
      // Regions are the last six units. On the plain rulesets they are the rows
      // themselves, so a region and its line coincide and nothing is ever cut.
      for (let i = 2 * SIZE; i < units.length && !moved; i++) {
        for (const value of [1, 2, 3]) {
          const need = LIMIT[value] - placed(units[i], value);
          if (need <= 0) continue;
          const homes = units[i].filter(([r, c]) => !grid[r][c] && candidates[r][c].has(value));
          if (homes.length === 0) continue;

          for (const axis of [0, 1]) {
            const line = homes[0][axis];
            if (!homes.every((home) => home[axis] === line)) continue;
            const lineUnit = units[axis === 0 ? line : SIZE + line];
            if (LIMIT[value] - placed(lineUnit, value) !== need) continue;
            let cut = false;
            for (const [r, c] of lineUnit) {
              if (grid[r][c]) continue;
              if (homes.some((home) => home[0] === r && home[1] === c)) continue;
              if (drop(r, c, value)) cut = true;
            }
            if (cut) { used.locked += 1; moved = true; break; }
          }
          if (moved) break;
        }
      }
      if (moved) continue;

      // The same argument from the line's side. Lines are the first twelve
      // units, regions the last six.
      for (let i = 0; i < 2 * SIZE && !moved; i++) {
        for (const value of [1, 2, 3]) {
          const need = LIMIT[value] - placed(units[i], value);
          if (need <= 0) continue;
          const homes = units[i].filter(([r, c]) => !grid[r][c] && candidates[r][c].has(value));
          if (homes.length === 0) continue;

          const region = regions[homes[0][0]][homes[0][1]];
          if (!homes.every(([r, c]) => regions[r][c] === region)) continue;
          const regionUnit = units[2 * SIZE + region];
          if (LIMIT[value] - placed(regionUnit, value) !== need) continue;

          let cut = false;
          for (const [r, c] of regionUnit) {
            if (grid[r][c]) continue;
            if (homes.some((home) => home[0] === r && home[1] === c)) continue;
            if (drop(r, c, value)) cut = true;
          }
          if (cut) { used.dual += 1; moved = true; break; }
        }
      }
      if (moved) continue;

      if (antiking) {
        for (let r = 0; r < SIZE - 1 && !moved; r++) {
          for (const [from, to] of [[r, r + 1], [r + 1, r]]) {
            if (grid[from].includes(1)) continue;
            const homes = [];
            for (let c = 0; c < SIZE; c++) if (!grid[from][c] && candidates[from][c].has(1)) homes.push(c);
            if (homes.length === 0) continue;
            let cut = false;
            for (let c = 0; c < SIZE; c++) {
              if (grid[to][c]) continue;
              // Beside every column the other row's 1 could be in, so wherever
              // that 1 lands this cell would be touching it.
              if (homes.every((home) => Math.abs(home - c) <= 1) && drop(to, c, 1)) cut = true;
            }
            if (cut) { used.pairs += 1; moved = true; break; }
          }
        }
        if (moved) continue;
      }
    }

    break;
  }

  let filled = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (grid[r][c]) filled += 1;
  return { solved: filled === SIZE * SIZE, used, grid };
}

// --- carving --------------------------------------------------------------

// Strip clues one at a time, in a random order, keeping only the removals that
// leave the puzzle solvable by hand. Carving against the logic solver rather
// than the search solver is what makes every puzzle fair: it can always be
// finished by forced deductions, never by guessing. Forced all the way also
// means the answer stays unique.
function carve(solution, regions, antiking, random) {
  const puzzle = solution.map((row) => row.slice());
  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cells.push([r, c]);

  for (const [r, c] of shuffle(cells, random)) {
    const kept = puzzle[r][c];
    puzzle[r][c] = 0;
    if (!logicSolve(puzzle, regions, antiking, 3).solved) puzzle[r][c] = kept;
  }
  return puzzle;
}

function clueCount(puzzle) {
  let clues = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (puzzle[r][c]) clues += 1;
  return clues;
}

// Which techniques a puzzle must actually demand before it is worth serving.
//
// Locked candidates need real regions: on the plain rulesets the regions are
// the rows themselves, so a region and its line coincide and the technique can
// never fire. Insisting on it there would loop forever.
//
// Pair inference is not demanded anywhere. The solver still uses it, so it can
// carve further on the lonely ones rulesets, but requiring it as well made
// those puzzles scarcer without making them harder.
function techniquesFor(variant) {
  const wanted = ["scanning", "counting"];
  if (variant.regions !== "none") wanted.push("locked");
  // Measured, not assumed: blocks managed the dual direction once in four
  // hundred carves, and never alongside locked, so asking for it there would
  // search forever.
  if (variant.regions === "jigsaw") wanted.push("dual");
  if (variant.antiking) wanted.push("pairs");
  return wanted;
}

// Searching stops as soon as a puzzle demands everything asked of its ruleset,
// and a little more looking has failed to turn up a harder one. The odds vary
// wildly — a jigsaw obliges about one carve in three, blocks about one in a
// hundred and twenty, since locked candidates so rarely decide anything on a
// regular two by three grid. A fixed budget would either give up on blocks or
// waste most of its work on jigsaws.
const KEEP_LOOKING = 15; // extra candidates once one qualifies, hunting a harder one
const GOOD_ENOUGH = 5; // counting steps worth stopping on at once
const MAX_CANDIDATES = 4000; // a stop, not a target

// One puzzle for one ruleset.
//
// Carving is done against the logic solver rather than the search solver, so
// whatever comes out can always be finished by forced deductions and never
// needs a guess. Forced all the way also means the answer stays unique.
//
// Carving alone gives puzzles scanning polishes off on its own, which take no
// thought at all, so candidates are built until one needs every technique the
// ruleset can demand.
function makePuzzle(variant, seed) {
  const wanted = techniquesFor(variant);
  let best = null;
  let foundAt = -1;

  for (let attempt = 0; attempt < MAX_CANDIDATES; attempt++) {
    if (best && attempt - foundAt >= KEEP_LOOKING) break;
    if (best && best.used.counting >= GOOD_ENOUGH) break;

    const random = makeRandom(hashString(`${seed}/${variant.id}/${attempt}`));
    const regions = regionsFor(variant, random);
    const solution = fillGrid(regions, variant.antiking, random);
    if (!solution) continue;
    if (!check(solution, regions, variant.antiking)) {
      throw new Error(`variant ${variant.id}: filler produced an invalid grid`);
    }

    const puzzle = carve(solution, regions, variant.antiking, random);
    const byHand = logicSolve(puzzle, regions, variant.antiking, 3);
    if (!byHand.solved) continue; // carving guarantees this, but assert it
    if (!wanted.every((technique) => byHand.used[technique] > 0)) continue;

    const clues = clueCount(puzzle);
    const score = byHand.used.counting * 100 - clues;
    if (!best || score > best.score) {
      best = {
        variant: variant.id, regions, solution, puzzle, clues, score,
        used: byHand.used, wanted, attempts: attempt + 1,
      };
    }
    if (foundAt < 0) foundAt = attempt;
  }

  // Unreachable in practice: even blocks, the stingiest ruleset, obliges about
  // once in a hundred and twenty carves, so four thousand misses is beyond
  // remote. Loud rather than silently easy if it ever happens.
  if (!best) throw new Error(`variant ${variant.id}: no puzzle needing ${wanted.join(", ")}`);
  return best;
}

// All six rulesets for one seed. Each gets its own stream, so changing one
// variant's luck cannot shift the others.
function makeDay(seed) {
  return VARIANTS.map((variant) => makePuzzle(variant, seed));
}

if (typeof module !== "undefined") {
  module.exports = {
    SIZE, VARIANTS, ROWS, hashString, makeRandom, shuffle,
    rowRegions, blockRegions, jigsawRegions, regionsFor,
    fillGrid, check, buildUnits, countSolutions, logicSolve, techniquesFor,
    carve, clueCount, makePuzzle, makeDay,
  };
}
