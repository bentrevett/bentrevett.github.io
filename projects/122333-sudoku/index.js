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
    // And one undo trail and one clock each, for the same reason.
    history: VARIANTS.map(() => []),
    clocks: VARIANTS.map(() => ({ started: false, elapsed: 0, since: null })),
  };
  puzzleFor(variant);
}

// --- the clock ------------------------------------------------------------

// A clock per ruleset. It starts on the first cell you touch, stops when the
// puzzle comes out, and only ticks while its own ruleset is the one on screen,
// so time spent on another board is not charged to this one.
function clock() {
  return state.clocks[state.variant - 1];
}

function elapsed() {
  const running = clock();
  return running.elapsed + (running.since === null ? 0 : Date.now() - running.since);
}

function startClock() {
  const running = clock();
  running.started = true;
  if (running.since === null && !isSolved()) running.since = Date.now();
}

function pauseClock() {
  const running = clock();
  if (running.since !== null) {
    running.elapsed += Date.now() - running.since;
    running.since = null;
  }
}

function formatTime(ms) {
  const whole = Math.floor(ms / 1000);
  const minutes = String(Math.floor(whole / 60)).padStart(2, "0");
  const seconds = String(whole % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// --- undo -----------------------------------------------------------------

function trail() {
  return state.history[state.variant - 1];
}

function undo() {
  const last = trail().pop();
  if (!last) return;
  state.boards[state.variant - 1][last.row][last.column] = last.was;
  render();
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

// Full, and matching the one answer the puzzle has.
function isSolved() {
  const board = state.boards[state.variant - 1];
  const { solution } = currentPuzzle();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (board[r][c] !== solution[r][c]) return false;
  }
  return true;
}

// Wipes a cell in one go, rather than clicking round the cycle to reach blank.
function clearCell(row, column) {
  if (currentPuzzle().puzzle[row][column]) return; // a clue, not yours to change
  const board = state.boards[state.variant - 1];
  if (board[row][column] === 0) return;
  trail().push({ row: row, column: column, was: board[row][column] });
  board[row][column] = 0;
  startClock();
  render();
}

// Blank, 1, 2, 3, and back to blank.
function cycleCell(row, column) {
  if (currentPuzzle().puzzle[row][column]) return; // a clue, not yours to change
  const board = state.boards[state.variant - 1];
  trail().push({ row: row, column: column, was: board[row][column] });
  board[row][column] = (board[row][column] + 1) % 4;
  startClock();
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
        cell.title = "click to cycle through blank, 1, 2 and 3, right click to wipe";
        cell.addEventListener("click", () => cycleCell(r, c));
        cell.addEventListener("contextmenu", (event) => {
          // The browser's own menu is not wanted here.
          event.preventDefault();
          clearCell(r, c);
        });
      }
    }
  }
}

function renderRules() {
  const variant = currentVariant();
  // One line per rule, so picking a ruleset visibly adds a rule to the list
  // or takes one away.
  const rules = ["Every row and every column holds one 1, two 2s and three 3s."];
  if (variant.regions === "blocks") {
    rules.push("Every two by three block holds the same.");
  } else if (variant.regions === "jigsaw") {
    rules.push("Every outlined shape holds the same.");
  }
  if (variant.antiking) rules.push("No two 1s may touch, not even diagonally.");

  const list = document.getElementById("rules");
  list.replaceChildren();
  for (const rule of rules) {
    const item = document.createElement("li");
    item.textContent = rule;
    list.append(item);
  }

  for (const [id, kind] of [["plain", "none"], ["blocks", "blocks"], ["jigsaw", "jigsaw"]]) {
    // Greyed out while it is the ruleset on screen, which is what says which
    // one you are playing.
    document.getElementById(id).disabled = variant.regions === kind;
  }
  document.getElementById("lonely").checked = variant.antiking;
}

// Only the clock, so it can tick without rebuilding the grid every second.
function renderClock() {
  document.getElementById("timer").textContent = formatTime(elapsed());
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.seed}`;
  document.getElementById("today").disabled = state.seed === todaysSeed();

  renderRules();
  renderGrid();

  const solved = isSolved();
  // The clock stops the moment the puzzle comes out.
  if (solved) pauseClock();
  renderClock();

  document.getElementById("message").textContent = solved ? "Solved." : "";

  const puzzle = currentPuzzle();
  document.getElementById("clear").disabled = state.boards[state.variant - 1].every(
    (row, r) => row.every((value, c) => value === puzzle.puzzle[r][c])
  );
  document.getElementById("undo").disabled = trail().length === 0;
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
    // Park the clock on the board you are leaving, so it is not charged for
    // time spent elsewhere.
    pauseClock();
    state.variant = found.id;
    puzzleFor(found.id);
    // And pick up where the new one left off, if it was ever started.
    const running = clock();
    if (running.started && !isSolved()) running.since = Date.now();
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
    // The undo trail goes with the grid it describes, so a clear cannot be
    // stepped back through. The clock is left alone: you are still on the same
    // puzzle, and wiping the grid is not a fresh start on it.
    state.history[state.variant - 1] = [];
    render();
  });

  document.getElementById("undo").addEventListener("click", undo);

  // Ticks the clock without touching the rest of the page.
  setInterval(() => {
    if (state && clock().since !== null) renderClock();
  }, 250);

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
  // Lonely ones by default: the plain grid is nearly always solvable by
  // scanning alone, which makes for a duller first impression.
  const LONELY_PLAIN = VARIANTS.find((v) => v.regions === "none" && v.antiking).id;
  load((urlSeed || "").trim() || todaysSeed(), LONELY_PLAIN);
}

main();
