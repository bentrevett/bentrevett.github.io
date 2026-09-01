// --- tunable values -------------------------------------------------------

const LOOP_SIZE = 5; // words in the loop, and rows in the grid
const WORD_LENGTH = 5; // letters per word
const GRID_CELLS = LOOP_SIZE * WORD_LENGTH;

// Wildcards stand in for any letter. Each one used costs a point, and no word
// may use more than one, so a row cannot be padded into a word.
const WILDCARD = "?";
const WILDCARD_COUNT = 5;
const MAX_WILDCARDS_PER_ROW = 1;

// A closed loop scores this, less one for every wildcard used.
const COMPLETE_SCORE = 6;

// The first and last letter of every word are dealt face up, since those are
// the joins that make the loop. Each join letter appears twice: at the end of
// one word and the start of the next.
const JOIN_CELLS = 2 * LOOP_SIZE;
const PLAYER_CELLS = GRID_CELLS - JOIN_CELLS;

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

// How many times to re-walk if the loop runs out of unused words. Only
// distinctness can stall a walk, and it almost never does.
const RING_ATTEMPTS = 20;

// --- helpers --------------------------------------------------------------

function lastLetter(word) {
  return word[word.length - 1];
}

function range(count) {
  return Array.from({ length: count }, (_, i) => i);
}

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

// The daily puzzle's name. Worked out afresh each time rather than cached,
// so a page left open past midnight stops calling yesterday's puzzle today's.
function todaysSeed() {
  return getDateString(new Date());
}

// --- word lists -----------------------------------------------------------

// ANSWER_WORDS and VALID_WORDS come from ../wordie-data/, pulled in by script tags
// so the page works straight from a file:// URL with no server.
//
// The two lists do not overlap, so a word is valid if it appears in either.
const WORDS = {
  answers: ANSWER_WORDS,
  valid: new Set([...ANSWER_WORDS, ...VALID_WORDS]),
};

// --- finding a loop -------------------------------------------------------
//
// Treat each word as an edge in a graph of letters, running from its first
// letter to its last. A loop is then a closed walk of LOOP_SIZE edges.
//
// Picking words at random and hoping they close would essentially never work,
// so instead work out in advance which letters can reach which in exactly k
// steps. The walk then only ever takes an edge whose far end can still get
// home in the steps that remain, and so can never strand itself.

function buildGraph(words) {
  const byFirst = new Map(LETTERS.map((letter) => [letter, []]));
  for (const word of words) byFirst.get(word[0]).push(word);
  return byFirst;
}

// reach[k].get(a) is the set of letters reachable from a in exactly k words.
function reachability(byFirst, steps) {
  const oneStep = new Map(
    LETTERS.map((letter) => [
      letter,
      new Set(byFirst.get(letter).map(lastLetter)),
    ])
  );

  const reach = [new Map(LETTERS.map((letter) => [letter, new Set([letter])]))];
  for (let k = 1; k <= steps; k++) {
    const previous = reach[k - 1];
    const next = new Map();
    for (const letter of LETTERS) {
      const reachable = new Set();
      for (const middle of previous.get(letter)) {
        for (const end of oneStep.get(middle)) reachable.add(end);
      }
      next.set(letter, reachable);
    }
    reach.push(next);
  }
  return reach;
}

function walkLoop(random, byFirst, reach, start, size) {
  const loop = [];
  const used = new Set();
  let letter = start;

  for (let step = 0; step < size; step++) {
    const left = size - step - 1;
    // Only words whose last letter can still reach the start in the steps
    // that remain. At the final step that means landing exactly on it.
    const options = byFirst
      .get(letter)
      .filter(
        (word) => !used.has(word) && reach[left].get(lastLetter(word)).has(start)
      );
    if (options.length === 0) return null;

    const word = options[Math.floor(random() * options.length)];
    used.add(word);
    loop.push(word);
    letter = lastLetter(word);
  }
  return loop;
}

const LOOP_GRAPH = buildGraph(WORDS.answers);
const LOOP_REACH = reachability(LOOP_GRAPH, LOOP_SIZE);
// Letters a loop can start from: those that reach themselves in LOOP_SIZE.
const RING_STARTS = LETTERS.filter((letter) =>
  LOOP_REACH[LOOP_SIZE].get(letter).has(letter)
);

function sampleLoop(random) {
  for (let attempt = 0; attempt < RING_ATTEMPTS; attempt++) {
    const start = RING_STARTS[Math.floor(random() * RING_STARTS.length)];
    const loop = walkLoop(random, LOOP_GRAPH, LOOP_REACH, start, LOOP_SIZE);
    if (loop) return loop;
  }
  throw new Error("could not find a loop");
}

// --- game state -----------------------------------------------------------

let state;

function newGame(seedString, label) {
  const random = makeRandom(hashString(seedString));
  const sourceLoop = sampleLoop(random);

  // Every letter of the loop, plus the wildcards. More tiles than cells, so
  // some are left over and the loop itself is always playable at full score.
  const letters = [
    ...sourceLoop.join("").split("").sort(),
    ...new Array(WILDCARD_COUNT).fill(WILDCARD),
  ];

  // Deal the joins face up. They are the skeleton of the loop, so they are
  // fixed: clicking will not lift them and Clear leaves them alone.
  const grid = new Array(GRID_CELLS).fill(null);
  const locked = new Set();
  const taken = new Set();

  function takeTile(letter) {
    const index = letters.findIndex((l, i) => !taken.has(i) && l === letter);
    if (index < 0) throw new Error(`no ${letter} tile for a join`);
    taken.add(index);
    return index;
  }

  sourceLoop.forEach((word, row) => {
    const first = row * WORD_LENGTH;
    const last = first + WORD_LENGTH - 1;
    grid[first] = takeTile(word[0]);
    grid[last] = takeTile(lastLetter(word));
    locked.add(first);
    locked.add(last);
  });

  state = {
    label: label,
    sourceLoop: sourceLoop,
    letters: letters,
    // Each cell holds a letter's index in the tray, or null when empty.
    grid: grid,
    // Cells dealt at the start, which cannot be picked up.
    locked: locked,
    // Tray tiles those joins used up. They never come back, so the tray does
    // not show them at all.
    reserved: taken,
    selected: null,
    message: "",
  };
}

function isPlaced(trayIndex) {
  return state.grid.includes(trayIndex);
}


function letterAt(cellIndex) {
  const trayIndex = state.grid[cellIndex];
  return trayIndex === null ? null : state.letters[trayIndex];
}

function wildcardsInRow(rowIndex) {
  let count = 0;
  for (let column = 0; column < WORD_LENGTH; column++) {
    if (letterAt(rowIndex * WORD_LENGTH + column) === WILDCARD) count += 1;
  }
  return count;
}

function wildcardsUsed() {
  return range(LOOP_SIZE).reduce((n, row) => n + wildcardsInRow(row), 0);
}

function selectLetter(trayIndex) {
  if (isPlaced(trayIndex)) return;
  // Clicking the selected letter again clears the selection.
  state.selected = state.selected === trayIndex ? null : trayIndex;
  render();
}

function placeSelected(cellIndex) {
  startClock();
  if (state.selected === null || state.grid[cellIndex] !== null) return;

  const row = Math.floor(cellIndex / WORD_LENGTH);
  if (
    state.letters[state.selected] === WILDCARD &&
    wildcardsInRow(row) >= MAX_WILDCARDS_PER_ROW
  ) {
    state.message = `Only ${MAX_WILDCARDS_PER_ROW} wildcard per word!`;
    render();
    return;
  }

  state.grid[cellIndex] = state.selected;
  state.selected = null;
  state.message = "";
  render();
}

// Clicking a filled cell sends that letter back to the tray.
function clearCell(cellIndex) {
  startClock();
  if (state.grid[cellIndex] === null || state.locked.has(cellIndex)) return;
  state.grid[cellIndex] = null;
  state.message = "";
  render();
}

function clearGrid() {
  // Leave the dealt joins in place; only your own letters come off.
  for (let cell = 0; cell < GRID_CELLS; cell++) {
    if (!state.locked.has(cell)) state.grid[cell] = null;
  }
  state.selected = null;
  state.message = "";
  render();
}

// How many of the cells you are responsible for are filled.
function playerPlaced() {
  return state.grid.filter(
    (tile, cell) => tile !== null && !state.locked.has(cell)
  ).length;
}

// --- working out where you are --------------------------------------------

// A row as a pattern: the letter in each cell, null where a wildcard sits.
// Returns null while the row is still incomplete.
function rowPattern(rowIndex) {
  const pattern = [];
  for (let column = 0; column < WORD_LENGTH; column++) {
    const letter = letterAt(rowIndex * WORD_LENGTH + column);
    if (letter === null) return null;
    pattern.push(letter === WILDCARD ? null : letter);
  }
  return pattern;
}

// Every valid word a pattern could spell.
function matchingWords(pattern) {
  if (!pattern.includes(null)) {
    const word = pattern.join("");
    return WORDS.valid.has(word) ? [word] : [];
  }
  const matches = [];
  for (const word of WORDS.valid) {
    let fits = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== null && pattern[i] !== word[i]) {
        fits = false;
        break;
      }
    }
    if (fits) matches.push(word);
  }
  return matches;
}

// Picks one word per row so that every link closes. A row with a wildcard may
// have several candidates, and which one is taken changes the letters at the
// joins, so the rows cannot be settled one at a time.
function chooseLoop(candidates) {
  const chosen = new Array(LOOP_SIZE);

  function place(row) {
    for (const word of candidates[row]) {
      if (row > 0 && word[0] !== lastLetter(chosen[row - 1])) continue;
      chosen[row] = word;
      if (row === LOOP_SIZE - 1) {
        // The last link has to wrap round to the first word.
        if (lastLetter(word) === chosen[0][0]) return true;
      } else if (place(row + 1)) {
        return true;
      }
    }
    return false;
  }

  return place(0) ? chosen : null;
}

function analyse() {
  const patterns = range(LOOP_SIZE).map(rowPattern);
  const candidates = patterns.map((p) => (p === null ? [] : matchingWords(p)));

  const rows = patterns.map((pattern, row) => ({
    complete: pattern !== null,
    valid: candidates[row].length > 0,
    // Best guess for display until the whole loop settles.
    word: candidates[row].length > 0 ? candidates[row][0] : null,
  }));

  const everyRowIsAWord = rows.every((r) => r.complete && r.valid);
  const loop = everyRowIsAWord ? chooseLoop(candidates) : null;
  // Once the loop closes, show that consistent set rather than each row's own
  // first match, which may disagree about the joining letters.
  if (loop) loop.forEach((word, row) => (rows[row].word = word));

  const wildcards = wildcardsUsed();
  return {
    rows: rows,
    loop: loop,
    wildcards: wildcards,
    solved: loop !== null,
    score: loop === null ? 0 : Math.max(0, COMPLETE_SCORE - wildcards),
  };
}

// Solved when every row is a word and the loop closes.
function isSolved() {
  return analyse().solved;
}

// --- the clock ------------------------------------------------------------

// Starts on the first move you make and stops when the puzzle comes out.
let clock = { elapsed: 0, since: null };

function elapsedMs() {
  return clock.elapsed + (clock.since === null ? 0 : Date.now() - clock.since);
}

function startClock() {
  if (clock.since === null && !isSolved()) clock.since = Date.now();
}

function pauseClock() {
  if (clock.since !== null) {
    clock.elapsed += Date.now() - clock.since;
    clock.since = null;
  }
}

function resetClock() {
  clock = { elapsed: 0, since: null };
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

// A single character in a fixed width box, so nothing shifts as letters and
// marks come and go.
function glyph(text, className) {
  const span = document.createElement("span");
  span.className = className ? `glyph ${className}` : "glyph";
  span.textContent = text;
  return span;
}

// What each cell of a row shows: the letter, or a wildcard's resolved letter.
function rowDisplay(rowIndex, row) {
  return range(WORD_LENGTH).map((column) => {
    const letter = letterAt(rowIndex * WORD_LENGTH + column);
    if (letter === null) return { text: "·", empty: true, wild: false };
    if (letter === WILDCARD) {
      const resolved = row.word ? row.word[column] : WILDCARD;
      return { text: resolved.toUpperCase(), empty: false, wild: true };
    }
    return { text: letter.toUpperCase(), empty: false, wild: false };
  });
}

function renderGrid(report) {
  const table = document.getElementById("grid");
  table.replaceChildren();

  for (let row = 0; row < LOOP_SIZE; row++) {
    const line = table.insertRow();
    const info = report.rows[row];
    const display = rowDisplay(row, info);
    const rowState = !info.complete ? "" : info.valid ? "good" : "bad";

    for (let column = 0; column < WORD_LENGTH; column++) {
      const cellIndex = row * WORD_LENGTH + column;
      const shown = display[column];
      const cell = line.insertCell();
      cell.append(glyph(shown.text));

      const classes = [];
      if (shown.wild) classes.push("wild");
      if (rowState) classes.push(rowState);
      if (shown.empty) {
        classes.push("empty");
        if (state.selected !== null) {
          classes.push("open");
          cell.addEventListener("click", () => placeSelected(cellIndex));
        }
      } else if (state.locked.has(cellIndex)) {
        // Dealt at the start, so there is nothing to pick up here.
        classes.push("given");
      } else {
        classes.push("filled");
        cell.addEventListener("click", () => clearCell(cellIndex));
      }
      cell.className = classes.join(" ");
      if (state.locked.has(cellIndex)) {
        cell.title = "dealt at the start, a join in the loop";
      } else if (shown.wild) {
        cell.title = "wildcard, costs a point";
      }
    }

    // Whether this row is a word yet.
    const status = line.insertCell();
    status.className = "status";
    status.textContent = !info.complete ? "❓" : info.valid ? "✅" : "❌";
    status.title = !info.complete
      ? "not finished"
      : info.valid
      ? "a valid word"
      : "not a word";
  }

  // The score sits under the grid, inside the table so it lines up with it.
  const scoreRow = table.insertRow();
  const label = document.createElement("th");
  label.colSpan = WORD_LENGTH;
  // The wording never changes, so finishing does not reword the row. Closing
  // the loop just turns it green.
  label.textContent = "Score";
  label.className = `scorelabel${report.solved ? " good" : ""}`;

  const value = document.createElement("th");
  value.textContent = `${report.score} of ${COMPLETE_SCORE}`;
  value.className = `scorevalue${report.solved ? " good" : ""}`;
  value.title = report.solved
    ? "the loop is closed"
    : "nothing scores until every row is a word and the loop closes";
  scoreRow.append(label, value);
}

function renderTray() {
  const container = document.getElementById("tray");
  container.replaceChildren();

  const table = document.createElement("table");
  table.id = "trayTable";

  // Only the tiles you can still use: the ones the joins took are gone for
  // good, so listing them would suggest you hold letters you do not.
  const tiles = state.letters
    .map((letter, index) => ({ letter: letter, index: index }))
    .filter((tile) => !state.reserved.has(tile.index));

  // One row per distinct letter, holding every copy of it. The tray is
  // sorted, so a letter's copies are already adjacent.
  let position = 0;
  while (position < tiles.length) {
    const letter = tiles[position].letter;
    const line = table.insertRow();

    while (position < tiles.length && tiles[position].letter === letter) {
      const index = tiles[position].index;
      const button = document.createElement("button");
      button.append(glyph(letter.toUpperCase()));

      if (isPlaced(index)) {
        // Placed letters grey out in place rather than disappearing.
        button.disabled = true;
        button.className = "used";
      } else {
        button.addEventListener("click", () => selectLetter(index));
      }

      // Sits outside the tile, to its left, in a fixed width slot so the
      // arrow appearing cannot shift the tray.
      const marker = document.createElement("span");
      marker.className = "marker";
      marker.textContent = state.selected === index ? "▸" : " ";
      line.insertCell().append(marker, button);
      position += 1;
    }
  }

  container.append(table);
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.label}`;
  // Greyed out while today's puzzle is the one on screen. That is what says
  // you are on it, now the heading no longer singles it out, and it stops a
  // stray click wiping a board you are part way through.
  document.getElementById("today").disabled = state.label === todaysSeed();

  const report = analyse();

  renderGrid(report);
  renderTray();

  // A non-breaking space holds the line's height when there is nothing to
  // say, so messages do not shove the page around.
  document.getElementById("message").textContent = state.message || " ";

  const free = state.letters.length - JOIN_CELLS;
  const spare = free - PLAYER_CELLS;
  document.getElementById("counts").textContent =
    `The ${JOIN_CELLS} joins are dealt for you. That leaves ${free} tiles for ` +
    `${PLAYER_CELLS} cells: ${PLAYER_CELLS} letters and ${WILDCARD_COUNT} ` +
    `wildcards, so ${spare} are left over.`;

  document.getElementById("clear").disabled = playerPlaced() === 0;
  if (isSolved()) pauseClock();
  renderClock();
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  // Loads a puzzle and keeps the seed box in step with it, so the box never
  // shows a stale seed for a puzzle that is no longer on screen.
  function load(seed) {
    newGame(seed, seed);
    resetClock();
    seedInput.value = seed;
    render();
  }

  // Puts a chosen seed in the address bar so the puzzle can be linked to.
  // Not called for the puzzle the page opens on, so a bare URL keeps meaning
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

  document.getElementById("clear").addEventListener("click", clearGrid);

  document.getElementById("today").addEventListener("click", () => {
    // Pinned in the URL just like any other puzzle you pick, so today's can
    // be linked to and shared as well.
    loadAndLink(todaysSeed());
  });

  document.getElementById("practice").addEventListener("click", () => {
    loadAndLink(String(Math.floor(Math.random() * 1e9)));
  });

  document.getElementById("load").addEventListener("click", () => {
    const seed = seedInput.value.trim();
    if (seed) loadAndLink(seed);
  });

  // Ticks the clock without touching the rest of the page.
  setInterval(() => {
    if (state && clock.since !== null) renderClock();
  }, 250);

  seedInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") document.getElementById("load").click();
  });

  // ?seed=... in the URL wins, otherwise today's puzzle is the date itself.
  const urlSeed = new URLSearchParams(location.search).get("seed");
  load((urlSeed || "").trim() || todaysSeed());
}

main();
