// The puzzle logic lives in sudoku.js, pulled in by a script tag: SIZE,
// VARIANTS, makeDay, hashString and check all come from there.
//
// Nothing is precomputed. A whole day, all six rulesets, takes a few
// milliseconds, so it is built when you load it.

// --- game state -----------------------------------------------------------

let state;

// Local date as YYYY-MM-DD, this is the daily seed.
function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Worked out afresh each time rather than cached, so a page left open past
// midnight rolls over on its own.
function todaysSeed() {
  return getDateString(new Date());
}

function currentVariant() {
  return VARIANTS[state.variant - 1];
}

function currentPuzzle() {
  return puzzleFor(state.variant);
}

// Puzzles are built when they are first looked at, not all six up front.
// Picking a hard one means building dozens of candidates, so paying for all
// six on load would be most of a second for five you may never open.
function puzzleFor(variant) {
  if (!state.day[variant - 1]) {
    state.day[variant - 1] = makePuzzle(VARIANTS[variant - 1], state.seed);
    state.boards[variant - 1] = state.day[variant - 1].puzzle.map((row) => row.slice());
  }
  return state.day[variant - 1];
}

function newGame(seed, variant) {
  state = {
    seed: seed,
    variant: variant,
    // Filled in as each ruleset is opened.
    day: VARIANTS.map(() => null),
    // One board per ruleset, so switching between them does not throw away
    // what you have already filled in.
    boards: VARIANTS.map(() => null),
  };
  puzzleFor(variant);
}

// --- rules ----------------------------------------------------------------

// Every unit a cell belongs to: its row, its column, and its region. Regions
// are the rows themselves in the plain variants, where they add nothing.
function unitsFor(row, column) {
  const { regions } = currentPuzzle();
  const cells = { row: [], column: [], region: [] };
  for (let i = 0; i < SIZE; i++) {
    cells.row.push([row, i]);
    cells.column.push([i, column]);
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (regions[r][c] === regions[row][column]) cells.region.push([r, c]);
    }
  }
  return currentVariant().regions === "none"
    ? [cells.row, cells.column]
    : [cells.row, cells.column, cells.region];
}

// Cells that break a rule as the board stands: more of a value than a unit
// allows, or a 1 touching another 1 where that is banned. Only ever flags what
// is already impossible, so it never points at the answer.
function brokenCells() {
  const board = state.boards[state.variant - 1];
  const antiking = currentVariant().antiking;
  const broken = new Set();
  const allowed = [0, 1, 2, 3];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = board[r][c];
      if (!value) continue;

      for (const unit of unitsFor(r, c)) {
        const same = unit.filter(([ur, uc]) => board[ur][uc] === value);
        if (same.length > allowed[value]) {
          for (const [ur, uc] of same) broken.add(ur * SIZE + uc);
        }
      }

      if (antiking && value === 1) {
        for (const [dr, dc] of KING) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          if (board[nr][nc] === 1) {
            broken.add(r * SIZE + c);
            broken.add(nr * SIZE + nc);
          }
        }
      }
    }
  }
  return broken;
}

function filledCount() {
  const board = state.boards[state.variant - 1];
  let filled = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (board[r][c]) filled += 1;
  }
  return filled;
}

// Full, and matching the one answer the puzzle has.
function isSolved() {
  const board = state.boards[state.variant - 1];
  const { solution } = currentPuzzle();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (board[r][c] !== solution[r][c]) return false;
  }
  return true;
}

// Blank, 1, 2, 3, and back to blank.
function cycleCell(row, column) {
  if (currentPuzzle().puzzle[row][column]) return; // a clue, not yours to change
  const board = state.boards[state.variant - 1];
  board[row][column] = (board[row][column] + 1) % 4;
  render();
}

// --- rendering ------------------------------------------------------------

function renderGrid() {
  const table = document.getElementById("grid");
  table.replaceChildren();

  const puzzle = currentPuzzle();
  const board = state.boards[state.variant - 1];
  const broken = brokenCells();
  // Once it is solved the grid is only there to be looked at.
  const solved = isSolved();
  table.className = solved ? "solved" : "";
  // The plain variants have no regions to draw; the rows stand in for them
  // internally, and ruling every row off would be a lie.
  const showRegions = currentVariant().regions !== "none";

  for (let r = 0; r < SIZE; r++) {
    const line = table.insertRow();
    for (let c = 0; c < SIZE; c++) {
      const cell = line.insertCell();
      const value = board[r][c];
      const given = puzzle.puzzle[r][c] !== 0;

      cell.textContent = value ? String(value) : "·";

      const classes = [];
      if (given) classes.push("given");
      else if (!value) classes.push("empty");
      if (broken.has(r * SIZE + c)) classes.push("wrong");

      // Thicken the border wherever a region ends, and around the outside.
      const differs = (nr, nc) =>
        nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE ||
        (showRegions && puzzle.regions[nr][nc] !== puzzle.regions[r][c]);
      if (differs(r - 1, c)) classes.push("edgeTop");
      if (differs(r + 1, c)) classes.push("edgeBottom");
      if (differs(r, c - 1)) classes.push("edgeLeft");
      if (differs(r, c + 1)) classes.push("edgeRight");
      cell.className = classes.join(" ");

      if (!given && !solved) {
        cell.title = "click to cycle through blank, 1, 2 and 3";
        cell.addEventListener("click", () => cycleCell(r, c));
      }
    }
  }
}

function renderRules() {
  const variant = currentVariant();
  const parts = ["Every row and column: one 1, two 2s, three 3s."];
  if (variant.regions === "blocks") {
    parts.push("Every two by three block the same.");
  } else if (variant.regions === "jigsaw") {
    parts.push("Every outlined shape the same.");
  }
  if (variant.antiking) parts.push("No two 1s may touch, diagonals included.");
  document.getElementById("rules").textContent = parts.join(" ");

  for (const [id, kind] of [["plain", "none"], ["blocks", "blocks"], ["jigsaw", "jigsaw"]]) {
    // Greyed out while it is the ruleset on screen, which is what says which
    // one you are playing.
    document.getElementById(id).disabled = variant.regions === kind;
  }
  document.getElementById("lonely").checked = variant.antiking;
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.seed}`;
  document.getElementById("today").disabled = state.seed === todaysSeed();

  renderRules();
  renderGrid();

  const filled = filledCount();
  const total = SIZE * SIZE;
  document.getElementById("status").textContent =
    `Filled ${String(filled).padStart(2, " ")} of ${total}. ` +
    `Clues: ${currentPuzzle().clues}.`;

  document.getElementById("message").textContent = isSolved() ? "Solved." : "";

  const puzzle = currentPuzzle();
  document.getElementById("clear").disabled = state.boards[state.variant - 1].every(
    (row, r) => row.every((value, c) => value === puzzle.puzzle[r][c])
  );
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  function load(seed, variant) {
    newGame(seed, variant || state.variant);
    seedInput.value = seed;
    render();
  }

  // Puts a chosen seed in the address bar so the puzzle can be linked to. Not
  // called for the puzzle the page opens on, so a bare URL keeps meaning
  // "today" until you actually pick something.
  function setUrlSeed(seed) {
    try {
      history.replaceState(null, "", `?seed=${encodeURIComponent(seed)}`);
    } catch (error) {
      // Blocked on some local file URLs, and only a convenience anyway.
    }
  }

  function loadAndLink(seed) {
    load(seed);
    setUrlSeed(seed);
  }

  // The six rulesets are three region choices crossed with the lonely ones
  // rule, so the controls say that rather than listing six names.
  function chooseVariant(regions, antiking) {
    const found = VARIANTS.find((v) => v.regions === regions && v.antiking === antiking);
    state.variant = found.id;
    puzzleFor(found.id);
    render();
  }

  for (const [id, kind] of [["plain", "none"], ["blocks", "blocks"], ["jigsaw", "jigsaw"]]) {
    document.getElementById(id).addEventListener("click", () => {
      chooseVariant(kind, currentVariant().antiking);
    });
  }

  document.getElementById("lonely").addEventListener("change", (event) => {
    chooseVariant(currentVariant().regions, event.target.checked);
  });

  document.getElementById("clear").addEventListener("click", () => {
    const puzzle = currentPuzzle();
    state.boards[state.variant - 1] = puzzle.puzzle.map((row) => row.slice());
    render();
  });

  document.getElementById("today").addEventListener("click", () => {
    loadAndLink(todaysSeed());
  });

  document.getElementById("practice").addEventListener("click", () => {
    loadAndLink(String(Math.floor(Math.random() * 1e9)));
  });

  document.getElementById("load").addEventListener("click", () => {
    const seed = seedInput.value.trim();
    if (seed) loadAndLink(seed);
  });

  seedInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") document.getElementById("load").click();
  });

  // ?seed=... in the URL wins, otherwise today's puzzle is the date itself.
  const urlSeed = new URLSearchParams(location.search).get("seed");
  load((urlSeed || "").trim() || todaysSeed(), 1);
}

main();
