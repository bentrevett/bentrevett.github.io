// --- tunable values -------------------------------------------------------

// Scrabble letter values.
const LETTER_POINTS = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1,
  j: 8, k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1,
  s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
};

const GRID_SIZE = 5; // the grid is GRID_SIZE by GRID_SIZE
const GRID_CELLS = GRID_SIZE * GRID_SIZE;
const WORD_LENGTH = GRID_SIZE; // each row spells one word
const SOURCE_WORDS = GRID_SIZE; // words the letters are taken from
const BONUS_COUNT = GRID_SIZE; // how many cells score double
const BONUS_MULTIPLIER = 2;

// Wildcards stand in for any letter but are worth nothing. Raise the count to
// make the puzzle easier: each one is a letter you can conjure, at the cost of
// that cell scoring nothing. Tiles come to GRID_CELLS + WILDCARD_COUNT, so the
// count is also how many tiles you get to leave unused.
//
// At most one per word, which stops a row being padded out with wildcards into
// something that is only technically a word.
const WILDCARD = "?";
const WILDCARD_COUNT = 5;
const MAX_WILDCARDS_PER_ROW = 1;

function pointsFor(letter) {
  return letter === WILDCARD ? 0 : LETTER_POINTS[letter];
}

// Picks `count` distinct items using a partial Fisher-Yates: shuffle only as
// far as needed rather than the whole array.
function pickSome(items, count, random) {
  const pool = items.slice();
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function range(count) {
  return Array.from({ length: count }, (_, i) => i);
}

// --- bonus cells ----------------------------------------------------------
//
// Bonus cells are held as a set of cell indices rather than a rule, so any
// arrangement works: scattered, several in one row, or none at all. Swap
// which function `makeBonusCells` points at to change the layout.

// The diagonal: first letter of row 1, second of row 2, and so on.
function diagonalBonusCells() {
  return Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + i);
}

// BONUS_COUNT cells picked from anywhere in the grid.
function randomBonusCells(random) {
  return pickSome(range(GRID_CELLS), BONUS_COUNT, random);
}

// Change this to randomBonusCells to scatter them instead.
const makeBonusCells = diagonalBonusCells;

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
// Answer words must count as valid, or a puzzle's own source words would be
// rejected and it would look unsolvable.
const WORDS = {
  answers: ANSWER_WORDS,
  valid: new Set([...ANSWER_WORDS, ...VALID_WORDS]),
};

// --- target ---------------------------------------------------------------

// Every ordering of the day's words: GRID_SIZE factorial, so 120 for a 5x5.
function permutations(items) {
  if (items.length <= 1) return [items];
  const result = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([item, ...tail]);
  });
  return result;
}

// What one arrangement of the words scores, every letter at full value. The
// wildcards are ignored on purpose: the target is what the five words are
// worth, not what your particular tiles can reach.
function arrangementScore(words, bonus) {
  let score = 0;
  words.forEach((word, row) => {
    [...word].forEach((letter, column) => {
      const doubled = bonus.has(row * GRID_SIZE + column);
      score += LETTER_POINTS[letter] * (doubled ? BONUS_MULTIPLIER : 1);
    });
  });
  return score;
}

// The best the day's five words can do, over every ordering of them.
function targetScore(sourceWords, bonus) {
  let best = 0;
  for (const words of permutations(sourceWords)) {
    best = Math.max(best, arrangementScore(words, bonus));
  }
  return best;
}

// --- game state -----------------------------------------------------------

let state;

function pickWords(random, pool, count) {
  if (pool.length < count) throw new Error("word list too small");
  const chosen = [];
  const used = new Set();
  while (chosen.length < count) {
    const index = Math.floor(random() * pool.length);
    if (used.has(index)) continue;
    used.add(index);
    chosen.push(pool[index]);
  }
  return chosen;
}

function newGame(seedString, label) {
  const random = makeRandom(hashString(seedString));
  const sourceWords = pickWords(random, WORDS.answers, SOURCE_WORDS);

  // Every letter of the five words, plus the wildcards on top. That leaves
  // WILDCARD_COUNT tiles spare for a grid of GRID_CELLS, so you choose what
  // to leave out, and the words themselves stay fully playable at face value.
  //
  // Letters alphabetically then the wildcards, so the tray groups each letter
  // together and gives nothing away about the source words' order.
  const letters = [
    ...sourceWords.join("").split("").sort(),
    ...new Array(WILDCARD_COUNT).fill(WILDCARD),
  ];

  const bonus = new Set(makeBonusCells(random));

  state = {
    label: label,
    sourceWords: sourceWords,
    letters: letters,
    // Each cell holds a letter's index in the tray, or null when empty.
    grid: new Array(GRID_CELLS).fill(null),
    bonus: bonus,
    selected: null,
    message: "",
    // Fixed for the puzzle, so worked out once rather than every render.
    target: targetScore(sourceWords, bonus),
  };
}

function isPlaced(trayIndex) {
  return state.grid.includes(trayIndex);
}

function wildcardsInRow(rowIndex, grid) {
  const cells = grid || state.grid;
  let count = 0;
  for (let column = 0; column < GRID_SIZE; column++) {
    const tile = cells[rowIndex * GRID_SIZE + column];
    if (tile !== null && state.letters[tile] === WILDCARD) count += 1;
  }
  return count;
}

function placedCount() {
  return state.grid.filter((cell) => cell !== null).length;
}

function selectLetter(trayIndex) {
  if (isPlaced(trayIndex)) return;
  // Clicking the selected letter again clears the selection.
  state.selected = state.selected === trayIndex ? null : trayIndex;
  render();
}

function placeSelected(cellIndex) {
  if (state.selected === null || state.grid[cellIndex] !== null) return;

  const row = Math.floor(cellIndex / GRID_SIZE);
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
  if (state.grid[cellIndex] === null) return;
  state.grid[cellIndex] = null;
  state.message = "";
  render();
}

function clearGrid() {
  state.grid.fill(null);
  state.selected = null;
  state.message = "";
  render();
}

// --- scoring --------------------------------------------------------------

function letterAt(cellIndex) {
  const trayIndex = state.grid[cellIndex];
  return trayIndex === null ? null : state.letters[trayIndex];
}

// A row as a pattern: the letter in each cell, null where a wildcard sits.
// Returns null while the row is still incomplete.
function rowPattern(rowIndex) {
  const pattern = [];
  for (let column = 0; column < GRID_SIZE; column++) {
    const letter = letterAt(rowIndex * GRID_SIZE + column);
    if (letter === null) return null;
    pattern.push(letter === WILDCARD ? null : letter);
  }
  return pattern;
}

// The valid word a pattern spells, with wildcards resolved to whatever fits,
// or null if nothing fits. Where several words match, any will do: wildcards
// score nothing, so every match gives the row an identical score.
function resolveWord(pattern) {
  if (!pattern.includes(null)) {
    const word = pattern.join("");
    return WORDS.valid.has(word) ? word : null;
  }
  for (const word of WORDS.valid) {
    let matches = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== null && pattern[i] !== word[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return word;
  }
  return null;
}

function scoreRow(rowIndex) {
  const pattern = rowPattern(rowIndex);
  if (pattern === null) return null;

  let points = 0;
  for (let column = 0; column < GRID_SIZE; column++) {
    const cell = rowIndex * GRID_SIZE + column;
    const multiplier = state.bonus.has(cell) ? BONUS_MULTIPLIER : 1;
    points += pointsFor(letterAt(cell)) * multiplier;
  }

  const word = resolveWord(pattern);
  return { word: word, valid: word !== null, points: word === null ? 0 : points };
}

function totalScore() {
  let total = 0;
  for (let row = 0; row < GRID_SIZE; row++) {
    const result = scoreRow(row);
    if (result) total += result.points;
  }
  return total;
}

// --- rendering ------------------------------------------------------------

const MAX_LETTER_POINTS = Math.max(...Object.values(LETTER_POINTS));
// Worst case for any bonus layout, including every bonus cell in one row.
const MAX_ROW_SCORE = GRID_SIZE * MAX_LETTER_POINTS * BONUS_MULTIPLIER;
const MAX_TOTAL_SCORE = GRID_CELLS * MAX_LETTER_POINTS * BONUS_MULTIPLIER;

// A letter beside its value, both fixed width so nothing reflows when a 10
// point letter sits next to a 1 point one. Pass "" as points to leave the
// value blank while keeping the space.
function tileElement(face, points) {
  const span = document.createElement("span");
  const faceSpan = document.createElement("span");
  faceSpan.className = "face";
  faceSpan.textContent = face;
  const valueSpan = document.createElement("span");
  valueSpan.className = "value";
  valueSpan.textContent = points;
  span.append(faceSpan, valueSpan);
  return span;
}

// What each cell of a row shows: the letter, its contribution to the row's
// score, and whether it came from a wildcard. `result` is scoreRow's output.
//
// The value shown is what the cell actually contributes, so it already
// includes the doubling on a bonus cell and the cells visibly add up to the
// row score. Drop the `multiplier` below to show the plain letter value.
function rowDisplay(rowIndex, result) {
  const cells = [];
  for (let column = 0; column < GRID_SIZE; column++) {
    const cellIndex = rowIndex * GRID_SIZE + column;
    const letter = letterAt(cellIndex);
    const multiplier = state.bonus.has(cellIndex) ? BONUS_MULTIPLIER : 1;

    if (letter === null) {
      cells.push({ text: "·", points: "", empty: true, wild: false });
    } else if (letter === WILDCARD) {
      // Show what the wildcard turned into, or ? while nothing fits. Worth
      // nothing either way, so the doubling cannot help it.
      const resolved = result && result.word ? result.word[column] : WILDCARD;
      cells.push({ text: resolved.toUpperCase(), points: 0, empty: false, wild: true });
    } else {
      cells.push({
        text: letter.toUpperCase(),
        points: LETTER_POINTS[letter] * multiplier,
        empty: false,
        wild: false,
      });
    }
  }
  return cells;
}

// Green for a valid word, red when it is not a word at all, and nothing
// while the row is still incomplete.
function rowClass(result) {
  if (result === null) return "";
  return result.valid ? "good" : "bad";
}

function renderValues() {
  const table = document.getElementById("values");
  table.replaceChildren();

  // Grouped by value, which is far more compact than 26 rows.
  const byValue = new Map();
  for (const [letter, points] of Object.entries(LETTER_POINTS)) {
    if (!byValue.has(points)) byValue.set(points, []);
    byValue.get(points).push(letter.toUpperCase());
  }
  // Wildcards are not in LETTER_POINTS, but belong in the table.
  byValue.set(0, [WILDCARD]);

  const header = table.insertRow();
  for (const text of ["Points", "Letters"]) {
    const cell = document.createElement("th");
    cell.textContent = text;
    header.append(cell);
  }

  for (const points of [...byValue.keys()].sort((a, b) => a - b)) {
    const row = table.insertRow();
    row.insertCell().textContent = points;
    row.insertCell().textContent = byValue.get(points).sort().join(" ");
  }
}

function renderGrid() {
  const table = document.getElementById("grid");
  table.replaceChildren();

  for (let row = 0; row < GRID_SIZE; row++) {
    const line = table.insertRow();
    const result = scoreRow(row);
    const display = rowDisplay(row, result);
    const state_ = rowClass(result);

    for (let column = 0; column < GRID_SIZE; column++) {
      const cellIndex = row * GRID_SIZE + column;
      const shown = display[column];
      const cell = line.insertCell();
      cell.append(tileElement(shown.text, shown.points));

      const classes = [];
      if (state.bonus.has(cellIndex)) classes.push("bonus");
      // A wildcard stays italic, so a resolved letter is not mistaken for one
      // you actually placed.
      if (shown.wild) classes.push("wild");
      if (state_) classes.push(state_);
      if (shown.empty) {
        classes.push("empty");
        if (state.selected !== null) {
          classes.push("open");
          cell.addEventListener("click", () => placeSelected(cellIndex));
        }
      } else {
        classes.push("filled");
        cell.addEventListener("click", () => clearCell(cellIndex));
      }
      cell.className = classes.join(" ");

      const notes = [];
      if (state.bonus.has(cellIndex)) notes.push("double letter score");
      if (shown.wild) notes.push("wildcard, worth nothing");
      if (notes.length) cell.title = notes.join(", ");
    }

    // The row's score, to the right of the grid.
    const scoreCell = line.insertCell();
    scoreCell.textContent = result === null ? "—" : result.points;
    scoreCell.className = `rowscore ${state_}`.trim();
    scoreCell.style.width = `${String(MAX_ROW_SCORE).length}ch`;
    if (result && !result.valid) scoreCell.title = "not a word, so no score";
  }

  // The total, in the same column as the row scores so they line up.
  const totalRow = table.insertRow();
  const totalLabel = document.createElement("th");
  totalLabel.colSpan = GRID_SIZE;
  totalLabel.textContent = "Total";
  totalLabel.className = "totallabel";
  const totalValue = document.createElement("th");
  totalValue.textContent = totalScore();
  totalValue.className = "rowscore";
  totalRow.append(totalLabel, totalValue);

  // The mark to beat: the best the day's own five words can manage.
  const targetRow = table.insertRow();
  const targetLabel = document.createElement("th");
  targetLabel.colSpan = GRID_SIZE;
  targetLabel.textContent = "Target";
  targetLabel.className = "totallabel";
  const targetValue = document.createElement("th");
  targetValue.textContent = state.target;
  targetValue.className = "rowscore target";
  targetValue.title = "the best the day's five words can score at full value";
  targetRow.append(targetLabel, targetValue);
}

function renderTray() {
  const container = document.getElementById("tray");
  container.replaceChildren();

  const table = document.createElement("table");
  table.id = "trayTable";

  // One row per distinct letter, holding every copy of it. state.letters is
  // sorted, so a letter's copies are already adjacent.
  let trayIndex = 0;
  while (trayIndex < state.letters.length) {
    const letter = state.letters[trayIndex];
    const line = table.insertRow();

    while (trayIndex < state.letters.length && state.letters[trayIndex] === letter) {
      const index = trayIndex;
      const button = document.createElement("button");
      button.append(tileElement(letter.toUpperCase(), pointsFor(letter)));

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
      trayIndex += 1;
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

  // Padded so the count changing cannot alter the line's length.
  const placed = String(placedCount()).padStart(2, " ");
  const status = state.selected === null
    ? `Placed ${placed} of ${GRID_CELLS}. Select a letter below.`
    : `Placed ${placed} of ${GRID_CELLS}. Now click an empty cell.`;
  document.getElementById("status").textContent = status;

  renderGrid();
  renderTray();

  // A non-breaking space holds the line's height when there is nothing to
  // say, so messages do not shove the page around.
  document.getElementById("message").textContent = state.message || "\u00a0";

  const spare = state.letters.length - GRID_CELLS;
  document.getElementById("counts").textContent =
    `${state.letters.length} tiles for ${GRID_CELLS} cells: ` +
    `${GRID_CELLS} letters and ${WILDCARD_COUNT} wildcards, ` +
    `so ${spare} are left over.`;


  document.getElementById("clear").disabled = placedCount() === 0;
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  renderValues();

  // Loads a puzzle and keeps the seed box in step with it, so the box never
  // shows a stale seed for a puzzle that is no longer on screen.
  function load(seed) {
    newGame(seed, seed);
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

  seedInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") document.getElementById("load").click();
  });

  // ?seed=... in the URL wins, otherwise today's puzzle is the date itself.
  const urlSeed = new URLSearchParams(location.search).get("seed");
  load((urlSeed || "").trim() || todaysSeed());
}

main();
