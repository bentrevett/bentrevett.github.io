// The puzzle logic lives in minesweeper.js, pulled in by a script tag: SIZES,
// REGIONS, shapeOf, rowOf, columnOf, windowOf and makePuzzle all come from
// there.
//
// Nothing is precomputed. A board takes a few milliseconds to build, so each
// of the six is built when you first open it and not before.

// A cell is one of three things, and clicking walks round them.
const UNKNOWN = 0;
const FILLED = 1;
const BLANK = 2;

let state;

// Which of the six boards a size and a set of regions make.
function boardIndex(sizeIndex, regionIndex) {
  return sizeIndex * REGIONS.length + regionIndex;
}

// --- game state -----------------------------------------------------------

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

function at() {
  return boardIndex(state.size, state.regions);
}

// Boards are built when they are first looked at, not all six up front.
function puzzleFor(index) {
  if (!state.days[index]) {
    const puzzle = makePuzzle(
      state.seed,
      Math.floor(index / REGIONS.length),
      REGIONS[index % REGIONS.length]
    );
    state.days[index] = puzzle;
    state.boards[index] = new Array(puzzle.shape.cells).fill(UNKNOWN);
    state.clueAt[index] = new Map(puzzle.clues.map(({ cell, value }) => [cell, value]));
  }
  return state.days[index];
}

function currentPuzzle() {
  return puzzleFor(at());
}

function board() {
  return state.boards[at()];
}

function newGame(seed, sizeIndex, regionIndex) {
  const boards = SIZES.length * REGIONS.length;
  state = {
    seed: seed,
    size: sizeIndex,
    regions: regionIndex,
    // Filled in as each board is opened.
    days: new Array(boards).fill(null),
    clueAt: new Array(boards).fill(null),
    // One grid per board, so switching between them does not throw away what
    // you have already filled in, and one undo trail and one clock each for
    // the same reason.
    boards: new Array(boards).fill(null),
    history: Array.from({ length: boards }, () => []),
    clocks: Array.from({ length: boards }, () => ({ started: false, elapsed: 0, since: null })),
  };
  puzzleFor(at());
}

// --- the clock ------------------------------------------------------------

// A clock per board. It starts on the first cell you touch, stops when the
// puzzle comes out, and only ticks while its own board is the one on screen,
// so time spent elsewhere is not charged to it.
function clock() {
  return state.clocks[at()];
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

// --- playing --------------------------------------------------------------

function trail() {
  return state.history[at()];
}

function setCell(cell, mark) {
  if (board()[cell] === mark) return;
  trail().push({ cell: cell, was: board()[cell] });
  board()[cell] = mark;
  startClock();
  render();
}

// Unknown, filled, blank, and back to unknown. Clue cells cycle too: the
// number says nothing about the cell it sits in, so it is yours to fill like
// any other.
function cycleCell(cell) {
  setCell(cell, (board()[cell] + 1) % 3);
}

function undo() {
  const last = trail().pop();
  if (!last) return;
  board()[last.cell] = last.was;
  render();
}

// One cell you could already have worked out. The generator recorded the
// order its solver settled them in, so this hands them back in that order and
// never gets ahead of the reasoning.
function hint() {
  const { answer, order } = currentPuzzle();
  const next = order.find((cell) => {
    const want = answer[cell] === 1 ? FILLED : BLANK;
    return board()[cell] !== want;
  });
  if (next === undefined) return;
  setCell(next, answer[next] === 1 ? FILLED : BLANK);
}

// --- what the board says --------------------------------------------------

// Every "exactly N of these" the board makes, as a player sees it.
function groups() {
  const { shape, clues, regions } = currentPuzzle();
  const out = [];
  for (let r = 0; r < shape.side; r++) {
    out.push({
      cells: Array.from({ length: shape.side }, (_, c) => r * shape.side + c),
      want: shape.half,
    });
  }
  for (let c = 0; c < shape.side; c++) {
    out.push({
      cells: Array.from({ length: shape.side }, (_, r) => r * shape.side + c),
      want: shape.half,
    });
  }
  if (regions) {
    for (let id = 0; id < shape.side; id++) {
      const cells = [];
      for (let cell = 0; cell < shape.cells; cell++) if (regions[cell] === id) cells.push(cell);
      out.push({ cells, want: shape.half });
    }
  }
  for (const { cell, value } of clues) out.push({ cells: windowOf(cell, shape), want: value });
  return out;
}

// Cells that break a rule as the board stands: a group with more filled than
// it allows, or one blanked off so hard it can no longer reach its count. Only
// ever flags what is already impossible, so it never points at the answer.
function brokenCells() {
  const marks = board();
  const broken = new Set();
  for (const { cells, want } of groups()) {
    const filled = cells.filter((cell) => marks[cell] === FILLED);
    const blank = cells.filter((cell) => marks[cell] === BLANK);
    if (filled.length > want) for (const cell of filled) broken.add(cell);
    if (cells.length - blank.length < want) for (const cell of blank) broken.add(cell);
  }
  return broken;
}

// The numbers already matched by what you have filled around them. Only the
// count is checked, not whether they are the right cells: it is a tally of
// your own working, not a verdict on it.
function metClues() {
  const { shape, clues } = currentPuzzle();
  const marks = board();
  const met = new Set();
  for (const { cell, value } of clues) {
    let filled = 0;
    for (const other of windowOf(cell, shape)) if (marks[other] === FILLED) filled++;
    if (filled === value) met.add(cell);
  }
  return met;
}

// Solved when the filled cells are exactly the ones in the answer. Marking
// the blanks is a working aid, so it is not asked for.
function isSolved() {
  const { answer, shape } = currentPuzzle();
  const marks = board();
  for (let cell = 0; cell < shape.cells; cell++) {
    if ((marks[cell] === FILLED) !== (answer[cell] === 1)) return false;
  }
  return true;
}

// --- rendering ------------------------------------------------------------

function renderGrid() {
  const table = document.getElementById("grid");
  table.replaceChildren();

  const { shape, regions } = currentPuzzle();
  const clueAt = state.clueAt[at()];
  const marks = board();
  const broken = brokenCells();
  const met = metClues();
  // Once it is solved the grid is only there to be looked at.
  const solved = isSolved();
  table.className = solved ? "solved" : "";

  // A region ends here, or the grid does. With no regions only the outside is
  // ruled off, which is the honest picture: there is nothing else to draw.
  const ends = (cell, nr, nc) => {
    if (nr < 0 || nr >= shape.side || nc < 0 || nc >= shape.side) return true;
    if (!regions) return false;
    return regions[nr * shape.side + nc] !== regions[cell];
  };

  for (let r = 0; r < shape.side; r++) {
    const line = table.insertRow();
    for (let c = 0; c < shape.side; c++) {
      const cell = r * shape.side + c;
      const box = line.insertCell();
      const mark = marks[cell];
      const clue = clueAt.get(cell);

      const classes = ["open"];
      if (mark === FILLED) classes.push("filled");
      else if (mark === BLANK) classes.push("blank");
      if (clue !== undefined) classes.push("clue");
      if (met.has(cell)) classes.push("met");
      if (broken.has(cell)) classes.push("wrong");
      if (ends(cell, r - 1, c)) classes.push("edgeTop");
      if (ends(cell, r + 1, c)) classes.push("edgeBottom");
      if (ends(cell, r, c - 1)) classes.push("edgeLeft");
      if (ends(cell, r, c + 1)) classes.push("edgeRight");
      box.className = classes.join(" ");

      // A fixed-width span either way, so a cell holding nothing is the same
      // size as one holding a number and the grid cannot shift. A cell you
      // have called blank is crossed off unless it has a number to show.
      const face = document.createElement("span");
      const crossed = clue === undefined && mark === BLANK;
      face.className = crossed ? "face cross" : "face";
      face.textContent = clue !== undefined ? String(clue) : (crossed ? "\u00d7" : "");
      box.append(face);

      if (!solved) {
        box.title = "click to cycle through unknown, filled and blank, right click to wipe";
        box.addEventListener("click", () => cycleCell(cell));
        box.addEventListener("contextmenu", (event) => {
          // The browser's own menu is not wanted here.
          event.preventDefault();
          setCell(cell, UNKNOWN);
        });
      }
    }
  }
}

// One line per rule, so picking a set of regions visibly adds a rule to the
// list or takes one away.
function renderRules() {
  const { shape, regions } = currentPuzzle();
  const rules = [
    `Every row holds ${shape.half} filled cells and ${shape.half} blank, and so does every column.`,
  ];
  if (state.regions === 1) {
    rules.push(`Every ${shape.blockRows} by ${shape.blockColumns} block holds the same.`);
  } else if (state.regions === 2) {
    rules.push("Every outlined shape holds the same.");
  }
  rules.push(
    "A number says how many of the nine cells around it are filled — the " +
    "eight touching it and the cell it sits in, minus any that fall off the " +
    "edge of the grid."
  );

  const list = document.getElementById("rules");
  list.replaceChildren();
  for (const rule of rules) {
    const item = document.createElement("li");
    item.textContent = rule;
    list.append(item);
  }
  // Nothing is drawn between the cells when there are no regions, so say so
  // rather than leaving the grid looking unfinished.
  document.getElementById("regionNote").textContent = regions
    ? ""
    : "No regions: only the rows and columns, and the numbers.";
}

// Only the clock, so it can tick without rebuilding the grid every second.
function renderClock() {
  document.getElementById("timer").textContent = formatTime(elapsed());
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.seed}`;
  document.getElementById("today").disabled = state.seed === todaysSeed();
  // Greyed out while it is the board on screen, which is what says which one
  // you are playing.
  SIZES.forEach((size, index) => {
    document.getElementById(size.name.toLowerCase()).disabled = index === state.size;
  });
  ["plain", "blocks", "jigsaw"].forEach((name, index) => {
    document.getElementById(name).disabled = index === state.regions;
  });

  renderRules();
  renderGrid();

  const solved = isSolved();
  // The clock stops the moment the puzzle comes out.
  if (solved) pauseClock();
  renderClock();

  document.getElementById("message").textContent = solved ? "Solved." : "";
  document.getElementById("hint").disabled = solved;
  document.getElementById("undo").disabled = trail().length === 0;
  document.getElementById("clear").disabled = board().every((mark) => mark === UNKNOWN);
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  function load(seed) {
    newGame(seed, state ? state.size : 0, state ? state.regions : 0);
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

  // Switching board parks the clock on the one you are leaving, so it is not
  // charged for time spent elsewhere, and restarts the one you arrive at if it
  // was ever started.
  function choose(sizeIndex, regionIndex) {
    pauseClock();
    state.size = sizeIndex;
    state.regions = regionIndex;
    puzzleFor(at());
    const running = clock();
    if (running.started && !isSolved()) running.since = Date.now();
    render();
  }

  SIZES.forEach((size, index) => {
    document.getElementById(size.name.toLowerCase()).addEventListener("click", () => {
      choose(index, state.regions);
    });
  });

  ["plain", "blocks", "jigsaw"].forEach((name, index) => {
    document.getElementById(name).addEventListener("click", () => {
      choose(state.size, index);
    });
  });

  document.getElementById("hint").addEventListener("click", hint);
  document.getElementById("undo").addEventListener("click", undo);

  document.getElementById("clear").addEventListener("click", () => {
    state.boards[at()] = new Array(currentPuzzle().shape.cells).fill(UNKNOWN);
    // The undo trail goes with the grid it describes, so a clear cannot be
    // stepped back through. The clock is left alone: you are still on the same
    // puzzle, and wiping the grid is not a fresh start on it.
    state.history[at()] = [];
    render();
  });

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
  // The small plain board: the smallest grid and the bare rules, with the
  // regions there to add to it rather than to start with.
  load((urlSeed || "").trim() || todaysSeed());
}

main();
