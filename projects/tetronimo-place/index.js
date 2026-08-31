// The puzzle logic lives in tetronimo.js, pulled in by a script tag: SIZES,
// BIGGEST, BASE, SHAPES, makePuzzle and the rest all come from there.
//
// Cells are numbered against the biggest board rather than the one on screen,
// so an id means the same thing whichever size you are playing.
//
// Nothing is precomputed. A puzzle takes a few milliseconds to build, so it is
// built when you load it.

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

// Boards are built when they are first looked at, not all three up front.
// Picking a puzzle that needs a dot, an X and an = means building hundreds of
// candidates, so paying for all three on load would be most of a second for
// two you may never open.
function boardFor(size) {
  if (!state.day[size]) {
    const puzzle = makePuzzle(state.seed, size);
    state.day[size] = {
      names: puzzle.names,
      side: puzzle.side,
      region: new Set(puzzle.region),
      answer: new Map(puzzle.labels),
      marks: puzzle.marks,
      dots: new Set(puzzle.dots),
      // What you have written in each cell, by cell id. Absent means blank.
      filled: new Map(),
    };
  }
  return state.day[size];
}

function board() {
  return boardFor(state.size);
}

function newGame(seed, size) {
  state = {
    seed: seed,
    size: size,
    // Filled in as each size is opened.
    day: SIZES.map(() => null),
  };
  boardFor(size);
}

// Wipes a cell in one go, rather than clicking round the cycle to reach blank.
function clearCell(id) {
  if (board().filled.delete(id)) render();
}

// Blank, then each of today's shapes in turn, then blank again.
function cycleCell(id) {
  const here = board().filled.get(id);
  const at = here === undefined ? -1 : board().names.indexOf(here);
  const next = at + 1;
  if (next >= board().names.length) board().filled.delete(id);
  else board().filled.set(id, board().names[next]);
  render();
}

// Marks whose two letters are both written in and break the rule. A mark
// waiting on a blank cell is not broken, just unanswered.
function brokenMarks() {
  const broken = new Set();
  board().marks.forEach(([pair, kind], index) => {
    const a = board().filled.get(pair[0]);
    const b = board().filled.get(pair[1]);
    if (a === undefined || b === undefined) return;
    const same = a === b;
    if (kind === "=" ? !same : same) broken.add(index);
  });
  return broken;
}

// A colour per piece, from the piece's first cell by the golden angle.
//
// Hashing looked fine but let two neighbouring pieces land on the same hue,
// and then they read as one blob, which is the very thing the colours are for.
// Stepping by 137 is one-to-one over any run shorter than 360 cells, since 137
// and 360 share no factor, so on a board of at most a hundred cells no two
// pieces can ever collide. Pale enough to read the letter through, and fixed
// by position, so a piece keeps its colour as the board fills in.
function colourFor(cells) {
  return `hsl(${(Math.min(...cells) * 137) % 360}, 70%, 85%)`;
}

// Groups of touching cells you have given the same letter.
function letterGroups() {
  const seen = new Set();
  const groups = [];
  for (const id of board().region) {
    const letter = board().filled.get(id);
    if (letter === undefined || seen.has(id)) continue;
    const group = [id];
    seen.add(id);
    for (let at = 0; at < group.length; at++) {
      const r = Math.floor(group[at] / BIGGEST);
      const c = group[at] % BIGGEST;
      for (const [dr, dc] of STEPS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= board().side || nc < 0 || nc >= board().side) continue;
        const next = nr * BIGGEST + nc;
        if (seen.has(next) || !board().region.has(next)) continue;
        if (board().filled.get(next) !== letter) continue;
        seen.add(next);
        group.push(next);
      }
    }
    groups.push({ letter, cells: group });
  }
  return groups;
}

// Cuts a run of same-lettered cells into pieces of that shape, with no piece
// covering two dots. Returns the pieces, or null if it cannot be done.
//
// Whole groups are cut rather than pieces recognised one at a time, because
// two pieces of the same shape sitting side by side read as one blob of
// letters and there is no telling from the letters alone where the join is.
// Where more than one cut works, the first found is used: any of them agrees
// with the letters, so any of them is a fair thing to draw.
function splitGroup(cells, letter, respectDots) {
  const left = new Set(cells);
  const pieces = [];

  const walk = () => {
    if (left.size === 0) return true;
    const first = Math.min(...left);
    const r = Math.floor(first / BIGGEST);
    const c = first % BIGGEST;
    for (const shape of SHAPES[letter]) {
      // Line the shape up so one of its cells sits on the first free cell.
      for (const [ar, ac] of shape) {
        const ids = shape.map(([sr, sc]) => (r + sr - ar) * BIGGEST + (c + sc - ac));
        if (ids.some((id) => !left.has(id))) continue;
        if (respectDots && ids.filter((id) => board().dots.has(id)).length > 1) continue;
        for (const id of ids) left.delete(id);
        pieces.push(ids);
        if (walk()) return true;
        pieces.pop();
        for (const id of ids) left.add(id);
      }
    }
    return false;
  };
  return walk() ? pieces : null;
}

// Groups you have finished correctly get coloured in, a colour per piece, so
// they stop being a row of letters and start looking like pieces.
function finishedPieces() {
  const painted = new Map();
  const broken = new Set();

  for (const group of letterGroups()) {
    if (group.cells.length % PIECE !== 0) continue;

    const pieces = splitGroup(group.cells, group.letter, true);
    if (pieces) {
      for (const piece of pieces) {
        const colour = colourFor(piece);
        for (const id of piece) painted.set(id, colour);
      }
      continue;
    }
    // Cuttable, but only by putting two dots in one piece.
    if (splitGroup(group.cells, group.letter, false)) {
      for (const id of group.cells) broken.add(id);
    }
  }
  return { painted, broken };
}

// There is exactly one labelling that works, so matching it is the whole test.
function isSolved() {
  if (board().filled.size !== board().region.size) return false;
  for (const [id, letter] of board().answer) {
    if (board().filled.get(id) !== letter) return false;
  }
  return true;
}

// --- rendering ------------------------------------------------------------

// A little picture of a piece, so the letters mean something.
function renderShapes() {
  const box = document.getElementById("shapes");
  box.replaceChildren();

  for (const name of board().names) {
    const cells = BASE[name];
    const rows = Math.max(...cells.map(([r]) => r)) + 1;
    const columns = Math.max(...cells.map(([, c]) => c)) + 1;

    const holder = document.createElement("div");
    holder.className = "shape";
    holder.append(name);

    const table = document.createElement("table");
    for (let r = 0; r < rows; r++) {
      const line = table.insertRow();
      for (let c = 0; c < columns; c++) {
        const cell = line.insertCell();
        if (cells.some(([cr, cc]) => cr === r && cc === c)) cell.className = "on";
      }
    }
    holder.append(table);
    box.append(holder);
  }
}

function renderGrid() {
  const table = document.getElementById("grid");
  table.replaceChildren();

  const broken = brokenMarks();
  const { painted, broken: overDotted } = finishedPieces();
  const solved = isSolved();
  table.className = solved ? "solved" : "";

  // Marks filed by the cell they hang off, and which side they hang on.
  const marksAt = new Map();
  board().marks.forEach(([pair, kind], index) => {
    const [a, b] = pair;
    const side = b === a + 1 ? "right" : "down";
    if (!marksAt.has(a)) marksAt.set(a, []);
    marksAt.get(a).push({ kind, side, index });
  });

  for (let r = 0; r < board().side; r++) {
    const line = table.insertRow();
    for (let c = 0; c < board().side; c++) {
      const id = r * BIGGEST + c;
      const cell = line.insertCell();

      if (!board().region.has(id)) {
        cell.className = "blocked";
        continue;
      }

      const letter = board().filled.get(id);
      // Empty cells are left truly empty. A placeholder in the middle reads as
      // a dot, which is the one thing in the middle that means something.
      cell.textContent = letter === undefined ? "" : letter;
      cell.className = "open"
        + (board().dots.has(id) ? " marked" : "")
        + (overDotted.has(id) ? " overDotted" : "");
      if (painted.has(id)) cell.style.backgroundColor = painted.get(id);

      // Hatching rather than anything drawn in the middle, so the mark reads
      // the same empty or lettered and never crowds the letter. It is a
      // background image, so a finished piece's colour still shows through it.
      if (board().dots.has(id)) {
        cell.title = "no piece may cover more than one hatched cell";
      }

      for (const mark of marksAt.get(id) || []) {
        const span = document.createElement("span");
        span.className = `mark ${mark.side}` + (broken.has(mark.index) ? " broken" : "");
        span.textContent = mark.kind === "X" ? "×" : "=";
        span.title = mark.kind === "X"
          ? "these two cells are covered by different shapes"
          : "these two cells are covered by the same shape";
        cell.append(span);
      }

      if (!solved) {
        if (!board().dots.has(id)) {
          cell.title = `click to cycle through ${board().names.join(", ")}, right click to wipe`;
        }
        cell.addEventListener("click", () => cycleCell(id));
        cell.addEventListener("contextmenu", (event) => {
          // The browser's own menu is not wanted here.
          event.preventDefault();
          clearCell(id);
        });
      }
    }
  }
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.seed}`;
  document.getElementById("today").disabled = state.seed === todaysSeed();
  SIZES.forEach((size, index) => {
    // Greyed out while it is the board on screen, which is what says which
    // one you are playing.
    document.getElementById(size.name.toLowerCase()).disabled = index === state.size;
  });

  renderShapes();
  renderGrid();

  document.getElementById("message").textContent = isSolved() ? "Solved." : "";
  document.getElementById("clear").disabled = board().filled.size === 0;
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  function load(seed, size) {
    newGame(seed, size === undefined ? (state ? state.size : 0) : size);
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

  SIZES.forEach((size, index) => {
    document.getElementById(size.name.toLowerCase()).addEventListener("click", () => {
      state.size = index;
      boardFor(index);
      render();
    });
  });

  document.getElementById("clear").addEventListener("click", () => {
    board().filled.clear();
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
  load((urlSeed || "").trim() || todaysSeed(), 0);
}

main();
