// --- tunable values -------------------------------------------------------

// Three boards a day. Everything else scales off how many words there are:
// that is how many lines there are to fill, and twice that many tiles.
const SIZES = [
  { name: "Small", lines: 4 },
  { name: "Medium", lines: 6 },
  { name: "Large", lines: 8 },
];
// The tray is always four tiles across, so a bigger board grows downwards
// rather than changing the width of the page under you.
const TRAY_COLUMNS = 4;

const PAIR = 2; // letters in a tile, taken from each end of a word

// Which end of a word a tile was cut from.
const HEAD = 0;
const TAIL = 1;

// Stands in for a tile you have not placed yet.
const BLANK = "·";

// --- the word list --------------------------------------------------------

// ANSWER_WORDS and VALID_WORDS come from ../wordie-data/, pulled in by script
// tags. Puzzles are built from the answers, which are the common words, but
// any word from either list counts as valid, since the lists are disjoint.
const WORDS = new Set([...ANSWER_WORDS, ...VALID_WORDS]);

// --- seeded shuffling -----------------------------------------------------

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

// Local date as YYYY-MM-DD, this is the daily seed.
function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The daily puzzle's name. Worked out afresh each time rather than cached, so
// a page left open past midnight rolls over on its own.
function todaysSeed() {
  return getDateString(new Date());
}

// --- game state -----------------------------------------------------------

let state;

function newGame(seedString, label) {
  state = {
    seed: seedString,
    label: label,
    // Small to begin with, as the quickest way in; the size you were playing
    // then carries over to the next puzzle, since it is a taste rather than
    // something about this particular board.
    size: state ? state.size : 0,
    // Built when a size is first looked at, not all three up front.
    games: SIZES.map(() => null),
    // One clock each, so time spent on one board is not charged to another.
    clocks: SIZES.map(() => ({ started: false, elapsed: 0, since: null })),
  };
  gameFor(state.size);
}

function lines() {
  return SIZES[state.size].lines;
}

// The board for a size, built the first time it is asked for.
function gameFor(size) {
  if (state.games[size]) return state.games[size];

  // Large keeps the bare seed, so the board a given day has always shown stays
  // the board it shows; the smaller two take a suffix. Seeding them apart also
  // stops a small board giving away half of the large one.
  const name = SIZES[size].name;
  const random = makeRandom(hashString(size === SIZES.length - 1 ? state.seed : `${state.seed}/${name}`));

  // As many different words as the size asks for. Their middle letters are
  // handed over, and their ends are cut off to make the tiles, so a solution
  // always exists. It need not be these words, and usually there are others.
  const chosen = [];
  while (chosen.length < SIZES[size].lines) {
    const word = ANSWER_WORDS[Math.floor(random() * ANSWER_WORDS.length)];
    if (!chosen.includes(word)) chosen.push(word);
  }

  // Both ends of every word, in alphabetical order. Sorting is what hides the
  // words: left to their own order the tiles would run head, tail, head, tail
  // and give away every pair.
  const cut = chosen
    .flatMap((word) => [
      { text: word.slice(0, PAIR), side: HEAD },
      { text: word.slice(PAIR + 1), side: TAIL },
    ])
    .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));

  state.games[size] = {
    // One per line, alphabetical. Which line carries which letter says nothing,
    // since the lines are only told apart by their middle letter anyway.
    middles: chosen.map((word) => word[2]).sort(),
    // Which end a tile came from is part of the puzzle, but it is kept, since
    // easy mode hands it over.
    tiles: cut.map((tile) => tile.text),
    sides: cut.map((tile) => tile.side),
    // Which tile sits at each end of each line, by index into tiles.
    slots: chosen.map(() => [null, null]),
    selected: null,
  };
  return state.games[size];
}

function game() {
  return gameFor(state.size);
}

// The word a line currently spells, or null while an end is still empty.
function lineWord(line) {
  const board = game();
  const [head, tail] = board.slots[line];
  if (head === null || tail === null) return null;
  return board.tiles[head] + board.middles[line] + board.tiles[tail];
}

function isValid(line) {
  const word = lineWord(line);
  return word !== null && WORDS.has(word);
}

function solvedCount() {
  let count = 0;
  for (let line = 0; line < lines(); line++) if (isValid(line)) count++;
  return count;
}

function isSolved() {
  return solvedCount() === lines();
}

function isPlaced(tile) {
  return game().slots.some(([head, tail]) => head === tile || tail === tile);
}

function selectTile(tile) {
  if (isPlaced(tile)) return;
  startClock();
  // Clicking the marked tile again puts it down rather than trapping you.
  const board = game();
  board.selected = board.selected === tile ? null : tile;
  render();
}

function placeTile(line, end) {
  const board = game();
  const held = board.slots[line][end];
  // Clicking a tile already on a line sends it back to the grid.
  if (held !== null) {
    board.slots[line][end] = null;
    board.selected = null;
    render();
    return;
  }
  if (board.selected === null) return;
  board.slots[line][end] = board.selected;
  board.selected = null;
  startClock();
  render();
}

// --- the clock ------------------------------------------------------------

// One per size. It starts on the first move you make on that board, stops when
// that board comes out, and only ticks while it is the board on screen.
function clock() {
  return state.clocks[state.size];
}

function elapsedMs() {
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

// Only the clock, so it can tick without rebuilding the page every second.
function renderClock() {
  document.getElementById("timer").textContent = formatTime(elapsedMs());
}

// --- rendering ------------------------------------------------------------

// Every character sits in a fixed width box, so a tile appearing where a blank
// was cannot shift what is beside it.
function glyphElement(text, className) {
  const span = document.createElement("span");
  span.className = className ? `glyph ${className}` : "glyph";
  span.textContent = text;
  return span;
}

function renderLines() {
  const table = document.getElementById("lines");
  table.replaceChildren();

  const board = game();
  for (let line = 0; line < lines(); line++) {
    const row = table.insertRow();
    const word = lineWord(line);
    const good = isValid(line);

    for (const end of [0, 1]) {
      const cell = row.insertCell();
      const tile = board.slots[line][end];
      cell.textContent =
        tile === null ? BLANK.repeat(PAIR) : board.tiles[tile].toUpperCase();
      cell.className =
        "slot" + (tile === null ? " empty" : "") + (word ? (good ? " good" : " bad") : "");
      cell.title =
        tile === null
          ? "put the tile you are holding here"
          : "click to send this tile back";
      cell.addEventListener("click", () => placeTile(line, end));

      // The given middle letter goes between the two ends.
      if (end === 0) {
        const middle = row.insertCell();
        middle.textContent = board.middles[line].toUpperCase();
        middle.className = "middle" + (word ? (good ? " good" : " bad") : "");
        middle.title = "given, and cannot be moved";
      }
    }

    const status = row.insertCell();
    status.className = "status";
    status.textContent = word === null ? "❓" : good ? "✅" : "❌";
  }
}

// Reading the checkbox rather than holding it in state, so the setting
// survives loading a different puzzle.
function easyMode() {
  return document.getElementById("easy").checked;
}

function renderTiles() {
  const container = document.getElementById("tray");
  container.replaceChildren();
  const easy = easyMode();

  const table = document.createElement("table");
  table.id = "trayTable";
  const board = game();

  // Two tiles per word, laid out four to a row.
  for (let row = 0; row < (lines() * 2) / TRAY_COLUMNS; row++) {
    const line = table.insertRow();
    for (let column = 0; column < TRAY_COLUMNS; column++) {
      const tile = row * TRAY_COLUMNS + column;
      const cell = line.insertCell();

      // Outside the tile, to the left, so selecting cannot shift the grid.
      cell.append(glyphElement(board.selected === tile ? "▸" : " ", "marker"));

      const button = document.createElement("button");
      // Four fixed width boxes, a dash and the two letters, so switching easy
      // mode on and off cannot change the size of a single tile.
      const dash = easy ? "-" : " ";
      const head = board.sides[tile] === HEAD;
      button.append(
        glyphElement(head ? " " : dash),
        glyphElement(board.tiles[tile][0].toUpperCase()),
        glyphElement(board.tiles[tile][1].toUpperCase()),
        glyphElement(head ? dash : " ")
      );
      if (easy) {
        button.title = head
          ? "was cut from the start of a word"
          : "was cut from the end of a word";
      }
      if (isPlaced(tile)) {
        // Greyed in place rather than removed, so the grid keeps its shape.
        button.disabled = true;
        button.className = "used";
      } else {
        button.addEventListener("click", () => selectTile(tile));
      }
      cell.append(button);
    }
  }
  container.append(table);
}

// The size buttons, with the one in force greyed out to say which it is.
function renderSizes() {
  SIZES.forEach((size, index) => {
    document.getElementById(size.name.toLowerCase()).disabled = state.size === index;
  });
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.label}`;
  // Greyed out while today's puzzle is the one on screen, so a stray click
  // cannot throw away a board you are part way through.
  document.getElementById("today").disabled = state.label === todaysSeed();

  renderSizes();
  renderLines();
  renderTiles();
  if (isSolved()) pauseClock();
  renderClock();

  document.getElementById("message").textContent = isSolved()
    ? `All ${lines()} words made.`
    : "";
  document.getElementById("clear").disabled = game().slots.every(
    ([head, tail]) => head === null && tail === null
  );
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  // Loads a puzzle and keeps the name box in step with it, so the box never
  // shows a stale name for a puzzle that is no longer on screen.
  function load(seed) {
    newGame(seed, seed);
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

  // Only the board on screen, and the clock is left alone: you are still on
  // the same puzzle, and wiping it is not a fresh start on it.
  document.getElementById("clear").addEventListener("click", () => {
    const board = game();
    board.slots = board.slots.map(() => [null, null]);
    board.selected = null;
    render();
  });

  SIZES.forEach((size, index) => {
    document.getElementById(size.name.toLowerCase()).addEventListener("click", () => {
      // Park the clock on the board you are leaving, and pick the new one up
      // where it left off if it was ever started.
      pauseClock();
      state.size = index;
      gameFor(index);
      const running = clock();
      if (running.started && !isSolved()) running.since = Date.now();
      render();
    });
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

  document.getElementById("easy").addEventListener("change", render);

  // Ticks the clock without touching the rest of the page.
  setInterval(() => {
    if (state && clock().since !== null) renderClock();
  }, 250);

  seedInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") document.getElementById("load").click();
  });

  // ?seed=... in the URL wins, otherwise today's puzzle is the date itself.
  const urlSeed = new URLSearchParams(location.search).get("seed");
  load((urlSeed || "").trim() || todaysSeed());
}

main();
