// The puzzle logic lives in tetronimo.js, pulled in by a script tag: SIZES,
// BIGGEST, BASE, SHAPES, makePuzzle and the rest all come from there.
//
// Cells are numbered against the biggest board rather than the one on screen,
// so an id means the same thing whichever size you are playing.
//
// Nothing is precomputed. A puzzle takes a few milliseconds to build, so it is
// built when you load it.

// Light enough to read a mark through, and distinct from each other. None of
// them is red, which is reserved for showing a mistake.
const SHAPE_COLOURS = ["#bcd9ff", "#c6ecc0", "#f3ebae", "#dcd2f2", "#b9e8e2", "#ffd9b0"];

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
    // One colour per shape, drawn from the same pool every day but paired at
    // random. Red is not among them: it is what a mistake looks like.
    const random = makeRandom(hashString(`${state.seed}/colours/${size}`));
    const palette = shuffle(SHAPE_COLOURS, random);

    state.day[size] = {
      names: puzzle.names,
      side: puzzle.side,
      region: new Set(puzzle.region),
      answer: new Map(puzzle.labels),
      pieces: puzzle.pieces,
      marks: puzzle.marks,
      dots: new Set(puzzle.dots),
      colours: new Map(puzzle.names.map((name, i) => [name, palette[i]])),
      // The cuts you have drawn, as "lower:higher" cell pairs.
      walls: new Set(),
      // The cuts you have touched, newest last. Toggling is its own reverse,
      // so a step back is just doing the same thing again.
      history: [],
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

// Draws one cut the puzzle's own tiling has and the drawing is missing. More
// than one cut can give the right answer, so this points at the one the board
// was built from rather than the only one that could work.
function hint() {
  const b = board();
  const inPiece = new Map();
  b.pieces.forEach((cells, index) => { for (const id of cells) inPiece.set(id, index); });

  for (const id of [...b.region].sort((x, y) => x - y)) {
    for (const step of [1, BIGGEST]) {
      const other = id + step;
      if (!b.region.has(other)) continue;
      if (step === 1 && (id % BIGGEST) + 1 >= b.side) continue;
      // A join between two pieces should be cut; anything else should not.
      const wanted = inPiece.get(id) !== inPiece.get(other);
      if (wanted && !hasWall(id, other)) { toggleWall(id, other); return; }
    }
  }
  // Nothing missing, so take out a cut that should not be there.
  for (const key of b.walls) {
    const [a, c] = key.split(":").map(Number);
    if (inPiece.get(a) === inPiece.get(c)) { toggleWall(a, c); return; }
  }
}

// --- drawing ---------------------------------------------------------------

// You draw the cuts, not the letters. A wall is stored against the lower of
// the two cells it separates, so each one is named once however it is reached.
function wallKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function hasWall(a, b) {
  return board().walls.has(wallKey(a, b));
}

function toggleWall(a, b, remember = true) {
  const key = wallKey(a, b);
  const walls = board().walls;
  if (walls.has(key)) walls.delete(key);
  else walls.add(key);
  if (remember) board().history.push(key);
  render();
}

// Steps back one cut, whether you drew it, took it out, or asked for a hint.
function undo() {
  const key = board().history.pop();
  if (key === undefined) return;
  const [a, b] = key.split(":").map(Number);
  toggleWall(a, b, false);
}

// The shapes you have cut out: runs of cells that walls do not separate. The
// region's own edge counts as a wall, so this is just a flood fill that
// refuses to cross one.
function drawnPieces() {
  const b = board();
  const seen = new Set();
  const pieces = [];
  for (const id of b.region) {
    if (seen.has(id)) continue;
    const piece = [id];
    seen.add(id);
    for (let at = 0; at < piece.length; at++) {
      const r = Math.floor(piece[at] / BIGGEST);
      const c = piece[at] % BIGGEST;
      for (const [dr, dc] of STEPS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= b.side || nc < 0 || nc >= b.side) continue;
        const next = nr * BIGGEST + nc;
        if (!b.region.has(next) || seen.has(next)) continue;
        if (hasWall(piece[at], next)) continue;
        seen.add(next);
        piece.push(next);
      }
    }
    pieces.push(piece);
  }
  return pieces;
}

// Which of today's two shapes a run of four cells is, or null if it is not one.
function shapeOf(cells) {
  if (cells.length !== PIECE) return null;
  const rows = cells.map((id) => Math.floor(id / BIGGEST));
  const cols = cells.map((id) => id % BIGGEST);
  const top = Math.min(...rows), left = Math.min(...cols);
  const norm = JSON.stringify(cells
    .map((id) => [Math.floor(id / BIGGEST) - top, (id % BIGGEST) - left])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  for (const name of board().names) {
    if (SHAPES[name].some((option) => JSON.stringify(option) === norm)) return name;
  }
  return null;
}

// The shape a finished run makes, or null if it is not a piece yet.
//
// A cut running through the run disqualifies it, even though the cells can
// still walk around it: a cut says its two cells are in different pieces, so a
// run with one inside it is a contradiction rather than a finished piece. Only
// the square loops back on itself, so it is the only shape this can happen to.
function pieceShape(cells) {
  const inside = new Set(cells);
  const cut = cells.some((id) =>
    [1, BIGGEST].some((step) => inside.has(id + step) && hasWall(id, id + step)));
  return cut ? null : shapeOf(cells);
}

// How the drawing stands: what it gets wrong, and what it has already got
// right.
//
// Mistakes are called out in place: the hatched cells a single piece has
// swallowed, and marks you have broken. A run that is not a piece needs
// nothing — it stays white while every real piece takes a colour, which says
// it plainly enough.
function survey() {
  const b = board();
  const pieces = drawnPieces();
  const shapeAt = new Map();   // cell -> the shape it belongs to
  const pieceAt = new Map();   // cell -> which run it is part of
  const badDots = new Set();
  const markState = new Map(); // mark -> "kept" or "broken", once it can be told

  pieces.forEach((piece, index) => {
    for (const id of piece) pieceAt.set(id, index);
  });

  for (const piece of pieces) {
    const shape = pieceShape(piece);
    if (!shape) continue; // not a piece yet, and staying white already says so
    for (const id of piece) shapeAt.set(id, shape);
    // No piece may cover more than one hatched cell. Only the hatched cells
    // go red, not the whole piece: they are what the rule is about.
    const dots = piece.filter((id) => b.dots.has(id));
    if (dots.length > 1) for (const id of dots) badDots.add(id);
  }

  b.marks.forEach(([[a, c], kind], index) => {
    const one = shapeAt.get(a), other = shapeAt.get(c);
    // Nothing to say while either side is still an unfinished run: more cuts
    // could send it either way.
    if (one === undefined || other === undefined) return;
    // Every mark sits on a join between two pieces, so both its cells landing
    // in one piece breaks it whatever shape that piece is.
    //
    // Testing for a cut on that edge is not enough: a cut the cells can walk
    // around separates nothing, and a single piece could then satisfy an "="
    // on its own, which is exactly what an "=" says cannot happen.
    const apart = pieceAt.get(a) !== pieceAt.get(c);
    const same = one === other;
    const kept = apart && (kind === "=" ? same : !same);
    markState.set(index, kept ? "kept" : "broken");
  });

  const broken = [...markState.values()].filter((how) => how === "broken").length;
  const done = pieces.length > 0 && pieces.every((piece) => pieceShape(piece) !== null);
  return { pieces, shapeAt, badDots, markState, solved: done && badDots.size === 0 && broken === 0 };
}

// Solved when every cell sits in a proper piece and nothing is broken. The
// answer's letters are unique, so any drawing that gets this far is right,
// even if it cuts the board differently from the way it was built.
function isSolved() {
  return survey().solved;
}

// --- rendering ------------------------------------------------------------

// A little picture of a piece, in the colour it will take on the board, so
// the letters mean something.
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
        if (cells.some(([cr, cc]) => cr === r && cc === c)) {
          cell.className = "on";
          cell.style.backgroundColor = board().colours.get(name);
        }
      }
    }
    holder.append(table);
    box.append(holder);
  }
}

function renderGrid() {
  const table = document.getElementById("grid");
  table.replaceChildren();

  const b = board();
  const { shapeAt, badDots, markState } = survey();
  const solved = isSolved();
  table.className = solved ? "solved" : "";

  // Marks filed by the cell they hang off, and which side they hang on.
  const marksAt = new Map();
  b.marks.forEach(([pair, kind], index) => {
    const [a, c] = pair;
    const side = c === a + 1 ? "right" : "down";
    if (!marksAt.has(a)) marksAt.set(a, []);
    marksAt.get(a).push({ kind, side, index, other: c });
  });

  for (let r = 0; r < b.side; r++) {
    const line = table.insertRow();
    for (let c = 0; c < b.side; c++) {
      const id = r * BIGGEST + c;
      const cell = line.insertCell();

      if (!b.region.has(id)) {
        cell.className = "blocked";
        continue;
      }

      const shape = shapeAt.get(id);
      cell.className = "open"
        + (b.dots.has(id) ? " marked" : "")
        + (badDots.has(id) ? " wrong" : "");
      if (shape) cell.style.backgroundColor = b.colours.get(shape);
      if (b.dots.has(id)) cell.title = "no piece may cover more than one hatched cell";

      // A cut is drawn on the near cell of the pair, so each is drawn once.
      // The region's own edge is always a cut and needs no drawing.
      for (const [step, side] of [[1, "right"], [BIGGEST, "down"]]) {
        const other = id + step;
        const along = step === 1 ? c + 1 < b.side : r + 1 < b.side;
        if (!along || !b.region.has(other)) continue;

        if (hasWall(id, other)) {
          const wall = document.createElement("span");
          wall.className = `wall ${side}`;
          cell.append(wall);
        }
        if (!solved) {
          // A strip along the edge, wide enough to hit but narrow enough not
          // to swallow clicks meant for the cell.
          const grab = document.createElement("span");
          grab.className = `grab ${side}`;
          grab.title = "click to cut, or to join back up";
          grab.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleWall(id, other);
          });
          cell.append(grab);
        }
      }

      for (const mark of marksAt.get(id) || []) {
        const span = document.createElement("span");
        // Grey while it cannot be told either way, then red or green.
        const how = markState.get(mark.index);
        span.className = `mark ${mark.side}` + (how ? ` ${how}` : "");
        span.textContent = mark.kind === "X" ? "\u00d7" : "=";
        span.title = mark.kind === "X"
          ? "a cut, with different shapes either side"
          : "a cut, with the same shape either side";
        cell.append(span);
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
  document.getElementById("clear").disabled = board().walls.size === 0;
  document.getElementById("undo").disabled = board().history.length === 0;
  document.getElementById("hint").disabled = isSolved();
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

  document.getElementById("hint").addEventListener("click", hint);

  document.getElementById("undo").addEventListener("click", undo);

  document.getElementById("clear").addEventListener("click", () => {
    board().walls.clear();
    // The trail describes cuts that are no longer there, so it goes with them.
    board().history = [];
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
