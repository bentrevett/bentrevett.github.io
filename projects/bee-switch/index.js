// --- the data -------------------------------------------------------------

// PUZZLE_DATA comes from ../bee-data/, pulled in by a script tag. Definition
// Bee reads the same file, so it is shared rather than copied into each game.
//
// Nothing about a puzzle is precomputed: picking the words is a filter and a
// random choice, well under a millisecond, so it happens when you load it.
const pangramsFor = (key) => [
  ...(PUZZLE_DATA[key].perfect_pangrams || []),
  ...(PUZZLE_DATA[key].other_pangrams || []),
];

// Which pangram the day is built around, and every pangram that would also
// win. They are the same length, so they fit the same rows.
function targetFor(key) {
  const pangrams = pangramsFor(key);
  const length = Math.min(...pangrams.map((pangram) => pangram.length));
  const winning = pangrams.filter((pangram) => pangram.length === length);
  return { winning: winning, target: winning[Math.floor(makeRandom(hashString(key))() * winning.length)] };
}

// A handful of days cannot make a puzzle: some letter of their pangram is
// carried only by pangrams, which are kept out of the stack. Repeating a word
// is allowed, so that is the only way a build can fail, which makes this a
// cheap exact test rather than a guess.
function isBuildable(key) {
  const banned = new Set(pangramsFor(key));
  let covered = 0;
  for (const word of PUZZLE_DATA[key].words) {
    if (banned.has(word)) continue;
    for (const letter of word) covered |= 1 << (letter.charCodeAt(0) - 97);
  }
  return [...targetFor(key).target].every(
    (letter) => covered & (1 << (letter.charCodeAt(0) - 97))
  );
}

// Only the days that work, so every date gets its own puzzle. Leaving the dead
// days in and stepping past them would serve their neighbour twice, which
// reads as yesterday's puzzle coming round again.
const PUZZLE_KEYS = Object.keys(PUZZLE_DATA).sort().filter(isBuildable);

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

// The newest puzzle belongs to the day the data was built, so counting days on
// from there and wrapping gives every future day a puzzle. Not every Spelling
// Bee makes a good switch puzzle, so these dates have gaps.
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

// --- building a puzzle ----------------------------------------------------

// The pangram sets the height of the board, so the shortest one the day has is
// the one to aim for. Any pangram of that same length also wins, since it
// would fit the same rows.
//
// Then one word per letter: filter the day's words down to those carrying that
// letter and take one at random. Two preferences shape that choice, each only
// a preference, so neither can make a day unbuildable:
//
//   - a word not already in the stack, since repeating one is dull, but a
//     repeat beats having no word at all;
//   - a length not already in the stack, so the stack comes out as one of each
//     length rather than seven five letter words.
//
// Rare letters are served first. Taken in the pangram's own order, a common
// letter can help itself to the only word a rare letter had.
function buildPuzzle(key) {
  const { winning, target } = targetFor(key);
  const length = target.length;

  // Consumed in the same order as targetFor, so the choice matches.
  const random = makeRandom(hashString(key));
  random();

  // No pangram belongs in the stack: a winning one would be the answer sitting
  // in plain sight, and a longer one is a giveaway of every letter at once.
  const banned = new Set(pangramsFor(key));
  const pool = PUZZLE_DATA[key].words.filter((word) => !banned.has(word));

  const carrying = (letter) => pool.filter((word) => word.includes(letter));
  const rows = [...target]
    .map((letter, row) => ({ letter, row }))
    .sort((a, b) => carrying(a.letter).length - carrying(b.letter).length);

  const words = new Array(length);
  const taken = [];
  const lengths = new Set();

  for (const { letter, row } of rows) {
    const options = carrying(letter);
    // Only if no word at all carries this letter, which the archive never
    // does outside its pangrams.
    if (options.length === 0) return null;

    // Narrow by each preference in turn, keeping the last non empty set.
    const unused = options.filter((word) => !taken.includes(word));
    const preferred = unused.length > 0 ? unused : options;
    const fresh = preferred.filter((word) => !lengths.has(word.length));
    const choices = fresh.length > 0 ? fresh : preferred;

    const word = choices[Math.floor(random() * choices.length)];
    words[row] = word;
    taken.push(word);
    lengths.add(word.length);
  }
  return { words: words, winning: winning };
}

// --- game state -----------------------------------------------------------

let state;

function newGame(seed) {
  const key = keyForSeed(seed);
  const puzzle = buildPuzzle(key);
  const random = makeRandom(hashString(key) ^ 0x5bf03635);
  // Dealt in a shuffled order, since the order they were built in is an answer.
  const dealt = shuffle(puzzle.words, random);
  const longest = Math.max(...dealt.map((word) => word.length));

  state = {
    seed: seed,
    key: key,
    winning: puzzle.winning,
    words: dealt,
    order: dealt.map((_, index) => index),
    // Which letter of each word currently sits in the middle column. Scrambled
    // to start, so the opening board is never halfway to an answer.
    centres: dealt.map((word) => Math.floor(random() * word.length)),
    // Any letter of any word can be pulled into the middle, so both sides of
    // the board have to be wide enough for the longest word.
    width: 2 * longest - 1,
    middle: longest - 1,
  };

  // The seven letters the whole Spelling Bee was built from. Every letter of
  // the pangram is carried by some word, so the words between them spell out
  // exactly that set.
  state.letters = [...new Set(dealt.join(""))].sort();
}

// The middle column, read top to bottom. Every row always contributes one
// letter, so this is always as long as the pangram being hunted.
function middleColumn() {
  let word = "";
  for (const index of state.order) {
    word += state.words[index][state.centres[index]];
  }
  return word;
}

function isSolved() {
  return state.winning.includes(middleColumn());
}

function moveRow(row, delta) {
  const target = row + delta;
  if (target < 0 || target >= state.order.length) return;
  const order = state.order;
  [order[row], order[target]] = [order[target], order[row]];
  startClock();
  render();
}

// Pulls the clicked letter into the middle column, which is what "shifting"
// the word left and right amounts to.
function centreLetter(row, at) {
  state.centres[state.order[row]] = at;
  startClock();
  render();
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

function glyphElement(text, className) {
  const span = document.createElement("span");
  span.className = className ? `glyph ${className}` : "glyph";
  span.textContent = text;
  return span;
}

function renderBoard() {
  const table = document.getElementById("board");
  table.replaceChildren();
  const solved = isSolved();

  state.order.forEach((index, row) => {
    const word = state.words[index];
    const centre = state.centres[index];
    // The word sits so its chosen letter lands in the middle column.
    const start = state.middle - centre;

    const line = table.insertRow();

    const controls = line.insertCell();
    controls.className = "controls";
    for (const [label, delta, edge] of [["▲", -1, 0], ["▼", 1, state.order.length - 1]]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.title = delta < 0 ? "move this word up" : "move this word down";
      button.disabled = row === edge;
      button.addEventListener("click", () => moveRow(row, delta));
      controls.append(button);
    }

    for (let column = 0; column < state.width; column++) {
      const cell = line.insertCell();
      const at = column - start;
      const inWord = at >= 0 && at < word.length;
      cell.textContent = inWord ? word[at].toUpperCase() : " ";
      const classes = [];
      if (column === state.middle) classes.push(solved ? "middle solved" : "middle");
      if (inWord) {
        classes.push("letter");
        cell.title = `put ${word[at].toUpperCase()} in the middle column`;
        cell.addEventListener("click", () => centreLetter(row, at));
      }
      cell.className = classes.join(" ");
    }
  });
}

function renderStatus() {
  const column = middleColumn();
  const solved = isSolved();

  const line = document.getElementById("column");
  line.replaceChildren("Middle column: ");
  for (const letter of column) {
    line.append(glyphElement(letter.toUpperCase(), solved ? "good" : "bad"));
  }
  // Held at a constant width, so the mark never nudges the line about.
  line.append(" ", glyphElement(solved ? "✅" : "❌"));

  const letters = document.getElementById("letters");
  letters.replaceChildren("Letters: ");
  for (const letter of state.letters) {
    letters.append(glyphElement(letter.toUpperCase()));
  }

  document.getElementById("message").textContent = solved
    ? `${column.toUpperCase()} is a pangram. Solved.`
    : "";
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.seed}`;
  // Greyed out while today's puzzle is the one on screen, so a stray click
  // cannot throw away a board you are part way through.
  document.getElementById("today").disabled = state.seed === todaysSeed();
  renderBoard();
  renderStatus();
  if (isSolved()) pauseClock();
  renderClock();
}

// --- setup ----------------------------------------------------------------

function main() {
  const seedInput = document.getElementById("seed");

  // Loads a puzzle and keeps the name box in step with it, so the box never
  // shows a stale name for a puzzle that is no longer on screen.
  function load(seed) {
    newGame(seed);
    resetClock();
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
