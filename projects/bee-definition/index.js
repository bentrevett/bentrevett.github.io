// --- tunable values -------------------------------------------------------

// Stands in for a letter you have not uncovered yet.
const BLANK = "·";

// Shortest fragment treated as giving the answer's root away. Below this,
// short prefixes like "val" turn up by coincidence too often to mean much.
const ROOT_LENGTH = 4;

// --- the data -------------------------------------------------------------

// PUZZLE_DATA and WORD_DEFINITIONS come from ../bee-data/, pulled in by
// script tags. Bee Switch reads the same files, so they are shared rather
// than copied into each game.

// Oldest first. The last puzzle is the day the data was built, so tomorrow
// wraps round to the very first one and the whole run cycles from there.
const PUZZLE_KEYS = Object.keys(PUZZLE_DATA).sort();

// --- dates ----------------------------------------------------------------

// Whole days since the epoch for a calendar date. Going through UTC means two
// dates can be subtracted without daylight saving shifting the answer.
function dayNumber(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function keyToDayNumber(key) {
  return dayNumber(
    Number(key.slice(0, 4)),
    Number(key.slice(4, 6)),
    Number(key.slice(6, 8))
  );
}

// The newest puzzle in the data belongs to the day the data was built, so
// counting days on from there and wrapping gives every future day a puzzle.
const ANCHOR_DAY = keyToDayNumber(PUZZLE_KEYS[PUZZLE_KEYS.length - 1]);

// Local date as YYYY-MM-DD, which is what the daily seed looks like.
function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Today's seed. Worked out afresh each time rather than cached, so a page left
// open past midnight rolls over on its own.
function todaysSeed() {
  return getDateString(new Date());
}

// Which archive puzzle a seed lands on.
//
// A date counts days on from the newest puzzle in the archive, so consecutive
// days give consecutive puzzles and today lands on the last one. Anything else
// is just a number to index by, the same as the other games.
function indexForSeed(seed) {
  const count = PUZZLE_KEYS.length;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(seed);
  let index;
  if (date) {
    const offset =
      dayNumber(Number(date[1]), Number(date[2]), Number(date[3])) - ANCHOR_DAY;
    index = count - 1 + offset;
  } else if (/^\d+$/.test(seed) && Number.isSafeInteger(Number(seed))) {
    index = Number(seed);
  } else {
    index = hashString(seed);
  }
  // Written the long way round because JavaScript's % keeps the sign of the
  // left hand side, and a date before the archive begins goes negative.
  return ((index % count) + count) % count;
}

function keyForSeed(seed) {
  return PUZZLE_KEYS[indexForSeed(seed)];
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

function shuffle(list, random) {
  const shuffled = list.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// --- clues ----------------------------------------------------------------

// A definition that says its own answer out loud is no clue at all. Whole
// words only, so hiding "ally" cannot mangle "finally".
function saysTheAnswer(word, sense) {
  return new RegExp(`\\b${word}\\b`, "i").test(sense);
}

// Nor is one that cites the answer's root: "in a vivid manner" hands you
// VIVIDLY. Only a real prefix counts, so "valid" flags VALIDITY but "vivid"
// says nothing about LIVID.
function citesTheRoot(word, sense) {
  const parts = sense.toLowerCase().match(/[a-z]+/g) || [];
  return parts.some(
    (part) => part.length >= ROOT_LENGTH && part !== word && word.startsWith(part)
  );
}

// Best available clue: one that keeps both the answer and its root to itself,
// then one that at least avoids the answer, and otherwise the definition as
// written. Some words are only ever defined by themselves or their own root,
// and there an honest giveaway is better than a mangled definition.
function clueFor(word) {
  const senses = WORD_DEFINITIONS[word] || [];
  if (senses.length === 0) return "(no definition for this word)";
  return (
    senses.find((sense) => !saysTheAnswer(word, sense) && !citesTheRoot(word, sense)) ||
    senses.find((sense) => !saysTheAnswer(word, sense)) ||
    senses[0]
  );
}

// --- game state -----------------------------------------------------------

let state;

function newGame(seed) {
  const key = keyForSeed(seed);
  // Shortest answers first, since they are the way into a puzzle and the long
  // ones are usually built off them.
  //
  // Shuffled before sorting rather than after: the source lists the words
  // alphabetically, so sorting alone would file every four letter A word at
  // the top and hand over the first letters. Sort is stable, so the shuffle
  // survives within each length. Seeded on the puzzle's own name, so everyone
  // playing it sees the same order.
  const words = shuffle(PUZZLE_DATA[key].words, makeRandom(hashString(key))).sort(
    (a, b) => a.length - b.length
  );
  const day = PUZZLE_DATA[key];
  state = {
    seed: seed,
    key: key,
    // The seven letters the Spelling Bee was built from, alphabetical. Every
    // answer is spelled from these, and every one of them contains the middle
    // letter, so it is worth marking out.
    letters: [day.middle_letter, ...day.other_letters]
      .map((letter) => letter.toUpperCase())
      .sort(),
    middle: day.middle_letter.toUpperCase(),
    clues: words.map((word) => ({
      word: word,
      text: clueFor(word),
      revealed: 0, // letters uncovered by the hint button
      solved: false,
      wrong: false,
      elements: null,
    })),
  };
}

function solvedCount() {
  return state.clues.filter((clue) => clue.solved).length;
}

function guess(clue) {
  if (clue.solved) return;
  const attempt = clue.elements.input.value.trim().toLowerCase();
  if (!attempt) return;
  if (attempt === clue.word) {
    clue.solved = true;
    clue.wrong = false;
  } else {
    clue.wrong = true;
  }
  paintClue(clue);
  renderStatus();
}

function reveal(clue) {
  if (clue.solved || clue.revealed >= clue.word.length) return;
  clue.revealed += 1;
  // A letter appearing is news, not a rejected answer.
  clue.wrong = false;
  paintClue(clue);
}

// --- rendering ------------------------------------------------------------

// Every character sits in a fixed width box, so a letter appearing where a
// blank was cannot shift what is beside it.
function glyphElement(text, className) {
  const span = document.createElement("span");
  span.className = className ? `glyph ${className}` : "glyph";
  span.textContent = text;
  return span;
}

function countElement(value) {
  const span = document.createElement("span");
  span.className = "count";
  span.textContent = String(value);
  return span;
}

// Repaints one clue and nothing else, so typing in one box cannot disturb the
// dozens of others or throw away the focus.
function paintClue(clue) {
  const { blanks, input, hint } = clue.elements;
  const uncovered = clue.solved ? clue.word.length : clue.revealed;

  const letters = document.createDocumentFragment();
  for (let i = 0; i < clue.word.length; i++) {
    letters.append(
      glyphElement(i < uncovered ? clue.word[i].toUpperCase() : BLANK)
    );
  }
  blanks.replaceChildren(letters);
  blanks.className =
    "blanks" + (clue.solved ? " solved" : clue.wrong ? " wrong" : "");

  // Greyed in place rather than removed, so a solved clue keeps its shape.
  input.disabled = clue.solved;
  hint.disabled = clue.solved || clue.revealed >= clue.word.length;
}

function buildClues() {
  const list = document.getElementById("clues");
  list.replaceChildren();

  for (const clue of state.clues) {
    const item = document.createElement("li");

    const definition = document.createElement("div");
    definition.className = "definition";
    // The length in words as well as in dots, since counting a row of dots is
    // harder than it sounds once they get past four or five.
    const length = document.createElement("b");
    length.className = "length";
    length.textContent = `(${clue.word.length})`;
    definition.append(clue.text, " ", length);

    const answer = document.createElement("div");
    answer.className = "answer";

    const blanks = document.createElement("span");

    const input = document.createElement("input");
    input.type = "text";
    // Sized and capped to the answer, which the blanks already give away.
    input.size = clue.word.length + 1;
    input.maxLength = clue.word.length;
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("aria-label", "your answer");

    const hint = document.createElement("button");
    hint.className = "hint";
    hint.textContent = "Hint";
    hint.title = "uncover the next letter";

    answer.append(blanks, " ", input, " ", hint);
    item.append(definition, answer);
    list.append(item);

    clue.elements = { blanks: blanks, input: input, hint: hint };

    input.addEventListener("keyup", (event) => {
      if (event.key === "Enter") guess(clue);
    });
    // Editing a rejected answer clears the red rather than leaving it staring
    // at you while you type the next attempt.
    input.addEventListener("input", () => {
      if (clue.wrong) {
        clue.wrong = false;
        paintClue(clue);
      }
    });
    hint.addEventListener("click", () => reveal(clue));

    paintClue(clue);
  }
}

function renderStatus() {
  const status = document.getElementById("status");
  status.replaceChildren(
    "Solved ",
    countElement(solvedCount()),
    " of ",
    countElement(state.clues.length),
    "."
  );
}

function renderLetters() {
  const line = document.getElementById("letters");
  line.replaceChildren("Letters: ");
  for (const letter of state.letters) {
    line.append(glyphElement(letter, letter === state.middle ? "middle" : ""));
  }
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.seed}`;
  // Greyed out while today's puzzle is the one on screen, so a stray click
  // cannot throw away everything you have solved.
  document.getElementById("today").disabled = state.seed === todaysSeed();
  renderStatus();
  renderLetters();
  buildClues();
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  // Loads a puzzle and keeps the name box in step with it, so the box never
  // shows a stale name for a puzzle that is no longer on screen.
  function load(seed) {
    newGame(seed);
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
  load((urlSeed || "").trim() || todaysSeed());
}

main();
