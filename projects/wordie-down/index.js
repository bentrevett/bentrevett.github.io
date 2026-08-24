// --- tunable values -------------------------------------------------------

const WORD_LENGTH = 5;
const ROW_COUNT = 5;

// How many down words a puzzle should hide. One is the usual outcome, so the
// puzzle is built again until it holds enough of them to be worth hunting.
const MIN_DOWN_WORDS = 3;
const MAX_DOWN_WORDS = 6;

// Builds to try before settling for the closest one managed. About one build
// in thirty lands in the band and the worst seed measured needed under three
// hundred, so the budget is there to bound the loop rather than to be spent.
const BUILD_ATTEMPTS = 2000;

// --- the word list --------------------------------------------------------

// ANSWER_WORDS comes from ../wordie-words/, loaded by a plain script tag.

const ALPHABET_START = "a".charCodeAt(0);

// Letters as 0 to 25, so a letter can index a table rather than a map.
const LETTER_CODES = ANSWER_WORDS.map((word) =>
  [...word].map((letter) => letter.charCodeAt(0) - ALPHABET_START)
);

// Words holding a given letter at a given position, which is exactly the
// question the puzzle asks: the column of a row is fixed, so only the letter
// sitting in that column can ever be used.
const AT_POSITION = [];
for (let position = 0; position < WORD_LENGTH; position++) {
  const byLetter = Array.from({ length: 26 }, () => []);
  ANSWER_WORDS.forEach((word, index) => {
    byLetter[LETTER_CODES[index][position]].push(index);
  });
  AT_POSITION.push(byLetter);
}

const COLUMNS = Array.from({ length: WORD_LENGTH }, (_, index) => index);

// Building a puzzle needs, for each letter of the down word, some across word
// other than the down word itself and the four already taken. So every letter
// in use has to appear in more than ROW_COUNT words. The rarest here is J, in
// twenty seven of them, but a trimmed word list should fail loudly now rather
// than deal a broken puzzle later.
(function checkWordList() {
  // Across words are kept apart, and a down word is kept from being an across
  // word, by comparing positions in this list rather than the words
  // themselves. That is only the same thing while the list has no repeats.
  const distinct = new Set(ANSWER_WORDS);
  if (distinct.size !== ANSWER_WORDS.length) {
    throw new Error(
      `word list repeats itself: ${ANSWER_WORDS.length} words, ${distinct.size} distinct`
    );
  }

  const holders = new Int32Array(26);
  for (const word of ANSWER_WORDS) {
    for (const letter of new Set(word)) holders[letter.charCodeAt(0) - ALPHABET_START]++;
  }
  for (let letter = 0; letter < 26; letter++) {
    if (holders[letter] > 0 && holders[letter] <= ROW_COUNT) {
      throw new Error(
        `only ${holders[letter]} words contain ` +
          `"${String.fromCharCode(letter + ALPHABET_START)}", need more than ${ROW_COUNT}`
      );
    }
  }
})();

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

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function shuffle(list, random) {
  const shuffled = list.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Local date as YYYY-MM-DD, this is the daily seed.
function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// --- solving --------------------------------------------------------------

// Every answer word the five across words can spell downwards, given the
// column fixed against each row.
//
// A down word works if its five letters can be taken from five different
// across words, each read at its row's column. That is a matching problem, so
// the rows are walked in turn while tracking which sets of across words could
// have supplied the letters so far, as a bit per across word.
function downWordsFor(across, spots) {
  // For each row, which across words offer which letter in that row's column.
  const supply = spots.map((column) => {
    const byLetter = new Int32Array(26);
    across.forEach((word, slot) => {
      byLetter[LETTER_CODES[word][column]] |= 1 << slot;
    });
    return byLetter;
  });

  const found = [];
  for (let candidate = 0; candidate < ANSWER_WORDS.length; candidate++) {
    // A word cannot run down and across at the same time.
    if (across.includes(candidate)) continue;

    const letters = LETTER_CODES[candidate];
    const suppliers = [];
    let possible = true;
    for (let row = 0; row < ROW_COUNT; row++) {
      const offered = supply[row][letters[row]];
      if (offered === 0) {
        possible = false;
        break;
      }
      suppliers.push(offered);
    }
    if (!possible) continue;

    // Bit `used` set means that set of across words can cover the rows so far.
    let reachable = 1;
    for (let row = 0; row < ROW_COUNT && reachable; row++) {
      let next = 0;
      for (let used = 0; used < 1 << ROW_COUNT; used++) {
        if (!((reachable >> used) & 1)) continue;
        let free = suppliers[row] & ~used;
        while (free) {
          const supplier = free & -free;
          next |= 1 << (used | supplier);
          free ^= supplier;
        }
      }
      reachable = next;
    }
    if (reachable) found.push(candidate);
  }
  return found;
}

// --- building a puzzle ----------------------------------------------------

// One down word, one fixed column per row, and an across word supplying each
// of the down word's letters in its row's column. Built around a real word so
// the puzzle always has at least one answer.
function buildPuzzle(random) {
  const hidden = Math.floor(random() * ANSWER_WORDS.length);
  const spots = [];
  const across = [];

  for (let row = 0; row < ROW_COUNT; row++) {
    // No word has a J in the middle, and there are four more gaps like it, so
    // the columns are tried in a random order and the first one some word can
    // supply is taken. Picking a column blind and abandoning the whole build
    // when it happens to be a gap threw away one build in forty for nothing.
    const letter = LETTER_CODES[hidden][row];
    const column = shuffle(COLUMNS, random).find(
      (candidate) =>
        AT_POSITION[candidate][letter].some(
          (word) => word !== hidden && !across.includes(word)
        )
    );
    // Unreachable while the word list passes its check above.
    if (column === undefined) return null;

    const pool = AT_POSITION[column][letter].filter(
      (word) => word !== hidden && !across.includes(word)
    );
    spots.push(column);
    across.push(pick(random, pool));
  }
  return { across: across, spots: spots };
}

function findPuzzle(random) {
  let best = null;
  let bestDistance = Infinity;

  for (let attempt = 0; attempt < BUILD_ATTEMPTS; attempt++) {
    const puzzle = buildPuzzle(random);
    if (!puzzle) continue;

    const down = downWordsFor(puzzle.across, puzzle.spots);
    const distance =
      down.length < MIN_DOWN_WORDS
        ? MIN_DOWN_WORDS - down.length
        : Math.max(0, down.length - MAX_DOWN_WORDS);

    if (distance === 0) return { ...puzzle, down: down };

    // Every build is playable on its own, being built around a real down
    // word, so the nearest miss is a fine thing to fall back on. It would
    // just hide slightly too few or too many words.
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { ...puzzle, down: down };
    }
  }

  // Only reachable if every build failed outright, which the word list check
  // rules out. Loud rather than a puzzle with nothing in it.
  if (!best) throw new Error("could not build a puzzle");
  return best;
}

// --- game state -----------------------------------------------------------

let state;

function newGame(seedString, label) {
  const random = makeRandom(hashString(seedString));
  const puzzle = findPuzzle(random);

  // The words are dealt in the order that built the puzzle, which is an
  // answer, so they are shuffled before the player ever sees them.
  const words = shuffle(
    puzzle.across.map((index) => ANSWER_WORDS[index]),
    random
  );

  state = {
    label: label,
    words: words,
    spots: puzzle.spots,
    // Alphabetical, so revealing one never moves the others along the line.
    targets: puzzle.down.map((index) => ANSWER_WORDS[index]).sort(),
    found: new Set(),
    order: words.map((_, index) => index),
    selected: null,
    history: [],
    moves: 0,
  };

  collect();
}

// The letters sitting in the fixed columns, read top to bottom.
function downWord() {
  let word = "";
  for (let row = 0; row < ROW_COUNT; row++) {
    word += state.words[state.order[row]][state.spots[row]];
  }
  return word;
}

// Anything spelled out is kept, so a word found in passing still counts.
function collect() {
  const word = downWord();
  if (state.targets.includes(word)) state.found.add(word);
}

function isSolved() {
  return state.found.size === state.targets.length;
}

function swapRows(a, b) {
  const order = state.order;
  [order[a], order[b]] = [order[b], order[a]];
}

function selectRow(row) {
  if (state.selected === null) {
    state.selected = row;
  } else if (state.selected === row) {
    // Clicking the marked row again puts it down rather than trapping you.
    state.selected = null;
  } else {
    swapRows(state.selected, row);
    state.history.push([state.selected, row]);
    state.moves += 1;
    state.selected = null;
    collect();
  }
  render();
}

function undo() {
  const last = state.history.pop();
  if (!last) return;
  swapRows(last[0], last[1]);
  state.moves -= 1;
  state.selected = null;
  render();
}

// Back to the deal, keeping whatever has already been found.
function reset() {
  state.order = state.words.map((_, index) => index);
  state.selected = null;
  state.history = [];
  state.moves = 0;
  collect();
  render();
}

// --- rendering ------------------------------------------------------------

// Every character sits in a fixed width box, so a mark appearing can never
// shift what is beside it.
function glyphElement(text, className) {
  const span = document.createElement("span");
  span.className = className ? `glyph ${className}` : "glyph";
  span.textContent = text;
  return span;
}

function renderBoard() {
  const table = document.getElementById("board");
  table.replaceChildren();

  const word = downWord();
  const isWord = state.targets.includes(word);

  for (let row = 0; row < ROW_COUNT; row++) {
    const line = table.insertRow();
    line.className = "row";

    // Outside the tiles, to the left, so selecting cannot shift the grid.
    const marker = line.insertCell();
    marker.className = "marker";
    marker.append(glyphElement(state.selected === row ? "▸" : " "));

    for (let column = 0; column < WORD_LENGTH; column++) {
      const cell = line.insertCell();
      cell.textContent = state.words[state.order[row]][column].toUpperCase();
      if (column === state.spots[row]) {
        // The fixed column for this row, which is what spells the down word.
        cell.className = isWord ? "spot good" : "spot";
      }
    }

    line.title = "click to pick this word up, then click another to swap them";
    line.addEventListener("click", () => selectRow(row));
  }
}

function renderDown() {
  const line = document.getElementById("down");
  const word = downWord();
  const known = state.targets.includes(word);

  line.replaceChildren("Down: ");
  for (const letter of word) {
    line.append(glyphElement(letter.toUpperCase(), known ? "good" : "bad"));
  }
  // Held at a constant width, so the mark never nudges the line about.
  line.append(" ", glyphElement(known ? "✅" : "❌"));
}

function renderTargets() {
  const line = document.getElementById("targets");
  line.replaceChildren();

  state.targets.forEach((target, index) => {
    if (index > 0) line.append("  ");
    const found = state.found.has(target);
    for (const letter of target) {
      // Unfound words keep their slots, so finding one shifts nothing.
      line.append(
        glyphElement(found ? letter.toUpperCase() : "·", found ? "good" : "slot")
      );
    }
  });
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.label}`;

  const status = document.getElementById("status");
  status.replaceChildren(
    "Found ",
    glyphElement(String(state.found.size)),
    " of ",
    glyphElement(String(state.targets.length)),
    ". Swaps: ",
    glyphElement(String(state.moves))
  );

  renderBoard();
  renderDown();
  renderTargets();

  const message = document.getElementById("message");
  message.textContent = isSolved()
    ? `All ${state.targets.length} down words found.`
    : "";

  document.getElementById("undo").disabled = state.history.length === 0;
  document.getElementById("reset").disabled = state.history.length === 0;
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  // Loads a puzzle and keeps the seed box in step with it, so the box never
  // shows a stale seed for a puzzle that is no longer on screen.
  function load(seed) {
    newGame(seed, seed);
    seedInput.value = seed;
    render();
  }

  // Puts an explicitly chosen seed in the address bar so the puzzle can be
  // linked to. Deliberately not called for the daily puzzle, so the bare URL
  // keeps meaning "today" rather than being pinned to one date.
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

  document.getElementById("undo").addEventListener("click", undo);
  document.getElementById("reset").addEventListener("click", reset);

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
  load((urlSeed || "").trim() || getDateString(new Date()));
}

main();
