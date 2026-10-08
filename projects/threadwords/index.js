// The puzzles live in puzzles.js, written by hand and pulled in by a script
// tag: PUZZLES comes from there.

// Stands in for a column you have not picked a letter from yet.
const BLANK = "·";

// --- the grid --------------------------------------------------------------

function answersOf(puzzle) {
  return puzzle.clues.map((clue) => clue.answer.toUpperCase());
}

// Where each answer sits. The grid is as wide as the longest answer, and the
// answers go in longest first. Each goes wherever it leaves the thinnest
// column as full as possible: try every start, look at how many letters each
// column would hold afterwards, and pick the start whose thinnest column is
// highest, then whose next thinnest is, and so on; on a tie, the leftmost.
//
// Judged after the word goes in rather than before, which is the point: a
// word only helps a column if it brings a letter that column did not have.
// Asking "which columns are emptiest now?" would send a word to fill a gap
// with a letter already sitting there.
//
// The middle columns always end up the fullest, whatever the method: every
// long word crosses them wherever it starts, while an edge column only gets
// letters from words that start or finish right there. This keeps the edges
// as full as they can be.
//
// Worked out from the puzzle alone, with nothing random, so a puzzle lays out
// the same way every time it is opened.
const layouts = new Map();

// How a puzzle asks to be laid out, in puzzles.js's `layout` field, which
// every puzzle must have.
//   balanced  as described above
//   left      every answer starts in the first column
//   right     every answer finishes in the last column
const LAYOUTS = ["balanced", "left", "right"];

// True if column counts a are better than b: the thinnest column higher, then
// the next thinnest, and so on.
function fuller(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function layoutOf(puzzle) {
  if (layouts.has(puzzle)) return layouts.get(puzzle);
  const answers = answersOf(puzzle);
  const width = Math.max(...answers.map((answer) => answer.length));
  const held = Array.from({ length: width }, () => new Set());
  const starts = answers.map(() => 0);

  // Left and right skip the search: every answer starts in the first column,
  // or finishes in the last.
  const fixed = puzzle.layout === "left" || puzzle.layout === "right";
  if (fixed) {
    answers.forEach((answer, index) => {
      const start = puzzle.layout === "left" ? 0 : width - answer.length;
      starts[index] = start;
      for (let at = 0; at < answer.length; at++) held[start + at].add(answer[at]);
    });
  }

  // Balanced: longest first; answers of the same length keep the order
  // puzzles.js gives.
  const order = fixed
    ? []
    : answers.map((_, index) => index).sort((a, b) => answers[b].length - answers[a].length);
  for (const index of order) {
    const answer = answers[index];
    let best = 0;
    let bestCounts = null;
    for (let start = 0; start + answer.length <= width; start++) {
      const counts = held.map((letters, column) => {
        const at = column - start;
        const adds = at >= 0 && at < answer.length && !letters.has(answer[at]);
        return letters.size + (adds ? 1 : 0);
      });
      counts.sort((a, b) => a - b);
      if (bestCounts === null || fuller(counts, bestCounts)) {
        bestCounts = counts;
        best = start;
      }
    }
    starts[index] = best;
    for (let at = 0; at < answer.length; at++) held[best + at].add(answer[at]);
  }

  // Each column shows every different letter that landed in it, sorted.
  // Different rather than every one, so how many answers share a letter is not
  // on show; sorted, since nothing about the order would help.
  const layout = { width, starts, columns: held.map((letters) => [...letters].sort()) };
  layouts.set(puzzle, layout);
  return layout;
}

function columnsOf(puzzle) {
  return layoutOf(puzzle).columns;
}

// --- checking the puzzles ---------------------------------------------------

// Everything about one puzzle that would stop it playing as written. The
// puzzles are hand-made, so this is the proof-reader: it runs when the page
// loads, and anything it finds goes to the console and onto the page.
function checkPuzzle(puzzle) {
  const problems = [];
  const label = `"${puzzle.index}"`;
  if (puzzle.layout === undefined) {
    problems.push(`${label} has no layout: it needs ${LAYOUTS.map((a) => `"${a}"`).join(" or ")}`);
  } else if (!LAYOUTS.includes(puzzle.layout)) {
    problems.push(`${label}: layout is "${puzzle.layout}", but it can only be ${LAYOUTS.map((a) => `"${a}"`).join(" or ")}`);
  }
  if (typeof puzzle.sort_clues !== "boolean") {
    problems.push(`${label}: sort_clues needs to be true or false`);
  }
  if (!Array.isArray(puzzle.clues) || puzzle.clues.length < 2) {
    problems.push(`${label} needs at least two clues`);
    return problems;
  }

  const seenAnswers = new Set();
  const seenClues = new Set();
  puzzle.clues.forEach((entry, index) => {
    const which = `${label} clue ${index + 1}`;
    if (!entry.clue) problems.push(`${which} has no clue`);
    if (!entry.answer) {
      problems.push(`${which} has no answer`);
      return;
    }
    const answer = entry.answer.toUpperCase();
    if (!/^[A-Z]+$/.test(answer)) problems.push(`${which}: ${entry.answer} is not letters only`);
    if (seenAnswers.has(answer)) problems.push(`${which}: ${answer} is the answer to two clues`);
    seenAnswers.add(answer);
    if (entry.clue && seenClues.has(entry.clue)) problems.push(`${which}: the clue "${entry.clue}" is used twice`);
    seenClues.add(entry.clue);
  });
  if (problems.length) return problems;

  return problems;
}

// Things worth knowing about a puzzle that do not stop it being played. A
// column holding a single letter is one: it gives no choice, but costs only an
// obvious click, and some themes make it unavoidable — if every answer starts
// with B, so does the first column.
function notesOn(puzzle) {
  const notes = [];
  columnsOf(puzzle).forEach((column, at) => {
    if (column.length === 1) {
      notes.push(`"${puzzle.index}": column ${at + 1} holds only ${column[0]}, so it gives no choice`);
    }
  });
  return notes;
}

function checkAll() {
  const problems = [];
  const notes = [];
  const seen = new Set();
  for (const puzzle of PUZZLES) {
    if (!puzzle.index) problems.push("a puzzle has no index");
    else if (seen.has(puzzle.index)) problems.push(`"${puzzle.index}" is the index of two puzzles`);
    seen.add(puzzle.index);
    if (!puzzle.name) problems.push(`"${puzzle.index}" has no name`);
    const broken = checkPuzzle(puzzle);
    problems.push(...broken);
    if (broken.length === 0) notes.push(...notesOn(puzzle));
  }
  return { problems, notes };
}

// --- game state -------------------------------------------------------------

// One record per puzzle, made the first time it is opened, so moving between
// puzzles in the dropdown keeps what you had done on each.
const progress = new Map();

let current;

function fresh(puzzle) {
  return {
    // The letter picked in each column, or null.
    picks: columnsOf(puzzle).map(() => null),
    solved: new Set(),
    message: "",
    // How the message should read: "good", "bad", or plain.
    tone: "",
  };
}

function record() {
  if (!progress.has(current.index)) progress.set(current.index, fresh(current));
  return progress.get(current.index);
}

function won() {
  return record().solved.size === current.clues.length;
}

// The word the picks spell, if they make one: letters in a run of neighbouring
// columns with no gap. Null while nothing is picked, or while there is a gap.
// A word can start in any column, so the run can be anywhere.
function pickedWord() {
  const picks = record().picks;
  const first = picks.findIndex((letter) => letter !== null);
  if (first === -1) return null;
  let last = first;
  while (last + 1 < picks.length && picks[last + 1] !== null) last++;
  if (picks.slice(last + 1).some((letter) => letter !== null)) return null;
  return picks.slice(first, last + 1).join("");
}

// --- playing ----------------------------------------------------------------

// Clicking a letter picks it for its column; clicking the picked one again
// takes it back.
function pickLetter(column, letter) {
  if (won()) return;
  const state = record();
  state.picks[column] = state.picks[column] === letter ? null : letter;
  state.message = "";
  state.tone = "";
  render();
}

// Puts every picked letter back, and nothing else: answers already found stay
// found.
function resetPicks() {
  const state = record();
  state.picks = state.picks.map(() => null);
  state.message = "";
  state.tone = "";
  render();
}

// Clicking a clue is the guess: the picked word, for that clue. Only the clues
// whose answers are as long as the picked word can be clicked.
//
// Right means the right letters, wherever they were found: if the grid happens
// to spell the answer in a different stretch of columns from the one it was
// laid out in, that is still the answer, read fairly off the grid.
function guess(clue) {
  const state = record();
  const word = pickedWord();
  if (won() || word === null || state.solved.has(clue)) return;
  if (word.length !== answersOf(current)[clue].length) return;

  if (word === answersOf(current)[clue]) {
    state.solved.add(clue);
    state.picks = state.picks.map(() => null);
    state.message = won() ? `All ${current.clues.length} found.` : `${word} is correct!`;
    state.tone = "good";
  } else {
    // The letters stay, since the word may well be right for a different clue.
    state.message = `${word} is not the answer to that clue!`;
    state.tone = "bad";
  }
  render();
}

// --- rendering --------------------------------------------------------------

// The columns of letters, side by side, each centred on the same middle line.
// The middle columns are always the tallest, since every long word crosses
// them, so centring turns the grid into a shape that is fullest in the middle
// and tapers to the edges, rather than a bar chart hanging from the top.
function renderGrid() {
  const state = record();
  const grid = document.getElementById("grid");
  grid.replaceChildren();
  grid.className = won() ? "over" : "";

  columnsOf(current).forEach((column, at) => {
    const stack = document.createElement("div");
    stack.className = "column";
    for (const letter of column) {
      const button = document.createElement("button");
      button.textContent = letter;
      button.className = "letter" + (state.picks[at] === letter ? " picked" : "");
      button.disabled = won();
      button.addEventListener("click", () => pickLetter(at, letter));
      stack.append(button);
    }
    grid.append(stack);
  });

  drawStrings();
}

const SVG = "http://www.w3.org/2000/svg";

// How round the corners are, at most. A short drop gets tighter corners, so
// the two never overlap.
const CORNER = 8;

// Level out of one tile, a rounded turn, straight up or down in the gap
// midway between the columns, another rounded turn, and level into the next.
// Two tiles at the same height just get a straight line.
function elbow(from, to) {
  const rise = to.y - from.y;
  if (Math.abs(rise) < 1) return `M ${from.x} ${from.y} H ${to.x}`;
  const middle = (from.x + to.x) / 2;
  const turn = Math.min(CORNER, Math.abs(rise) / 2, middle - from.x);
  const down = Math.sign(rise);
  return [
    `M ${from.x} ${from.y}`,
    `H ${middle - turn}`,
    `Q ${middle} ${from.y} ${middle} ${from.y + down * turn}`,
    `V ${to.y - down * turn}`,
    `Q ${middle} ${to.y} ${middle + turn} ${to.y}`,
    `H ${to.x}`,
  ].join(" ");
}

// A piece of string between each pair of picked letters in neighbouring
// columns, so the word you are building can be read as one line threaded
// through the grid. Drawn behind the tiles, from centre to centre, so only the
// stretch between them shows; a gap in the picks leaves a gap in the string.
//
// Each piece leaves its tile level, turns a soft corner into the gap between
// the two columns, runs up or down there, and turns again into the next tile.
// A straight line would cut diagonally behind the tiles in between and all but
// vanish on a long drop; the gap is the one place nothing covers it.
// Worked out from where the tiles actually are on screen, so it is redrawn
// whenever the page changes size.
function drawStrings() {
  const grid = document.getElementById("grid");
  const old = grid.querySelector("svg.strings");
  if (old) old.remove();

  const picks = record().picks;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "strings");
  grid.prepend(svg);

  const frame = grid.getBoundingClientRect();
  const centre = (column) => {
    const tile = [...grid.querySelectorAll(".column")[column].children]
      .find((button) => button.textContent === picks[column]);
    const box = tile.getBoundingClientRect();
    return { x: box.left - frame.left + box.width / 2, y: box.top - frame.top + box.height / 2 };
  };

  for (let at = 0; at + 1 < picks.length; at++) {
    if (picks[at] === null || picks[at + 1] === null) continue;
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", elbow(centre(at), centre(at + 1)));
    svg.append(path);
  }
}

// The word as it stands: a box per column, a dot where nothing is picked yet.
function renderWord() {
  const word = document.getElementById("word");
  word.replaceChildren();
  for (const letter of record().picks) {
    const box = document.createElement("span");
    box.className = "box" + (letter === null ? "" : " known");
    box.textContent = letter === null ? BLANK : letter;
    word.append(box);
  }
}

function renderClues() {
  const state = record();
  const answers = answersOf(current);
  const word = won() ? null : pickedWord();
  const list = document.getElementById("clues");
  list.replaceChildren();

  // With sort_clues, shortest first and alphabetical by clue within a length:
  // the clickable clues for a given word then sit together in one block, and
  // nothing about the order the puzzle was written in shows through. Without
  // it, the clues appear in the order puzzles.js gives them. Either way only
  // the display changes; each clue keeps its place for everything else.
  const order = current.clues.map((_, index) => index);
  if (current.sort_clues) {
    order.sort((a, b) =>
      answers[a].length - answers[b].length ||
      current.clues[a].clue.localeCompare(current.clues[b].clue));
  }

  order.forEach((index) => {
    const entry = current.clues[index];
    const row = list.insertRow();
    const solved = state.solved.has(index);

    const clue = row.insertCell();
    // Clickable once the picks spell a word as long as this clue's answer.
    const open = word !== null && word.length === answers[index].length && !solved;
    clue.className = "clue" + (open ? " ready" : "") + (solved ? " solved" : "");
    clue.textContent = `${entry.clue} (${answers[index].length})`;
    if (open) {
      clue.title = `guess ${word} for this clue`;
      clue.addEventListener("click", () => guess(index));
    }

    const answer = row.insertCell();
    answer.className = "answer" + (solved ? " solved" : "");
    // Dots for an answer not yet found, so the column is as wide before as
    // after and finding one never shifts the clues.
    answer.textContent = solved ? answers[index] : BLANK.repeat(answers[index].length);
  });
}

function render() {
  const state = record();
  document.getElementById("pick").value = current.index;
  renderGrid();
  renderWord();
  renderClues();
  document.getElementById("message").textContent = state.message;
  document.getElementById("message").className = state.tone;
  // Greyed out rather than hidden while there is nothing to reset, so it never
  // shifts the word beside it.
  document.getElementById("reset").disabled = won() || state.picks.every((letter) => letter === null);
}

// --- setup ------------------------------------------------------------------

function choose(index) {
  const puzzle = PUZZLES.find((candidate) => candidate.index === index);
  if (!puzzle) return;
  current = puzzle;

  const broken = checkPuzzle(puzzle);
  document.getElementById("broken").textContent = broken.length
    ? "This puzzle does not work as written: " + broken.join("; ") + "."
    : "";
  if (broken.length) return;
  render();
}

function main() {
  const { problems, notes } = checkAll();
  if (problems.length) {
    console.warn(`threadwords: ${problems.length} thing(s) wrong in puzzles.js`);
    for (const problem of problems) console.warn("  " + problem);
  }
  if (notes.length) {
    console.info(`threadwords: ${notes.length} thing(s) worth a look in puzzles.js`);
    for (const note of notes) console.info("  " + note);
  }

  const pick = document.getElementById("pick");
  for (const puzzle of PUZZLES) {
    const option = document.createElement("option");
    option.value = puzzle.index;
    // The name alongside the index, so the list says what each puzzle is.
    option.textContent = `${puzzle.index}: ${puzzle.name}`;
    pick.append(option);
  }

  document.getElementById("reset").addEventListener("click", resetPicks);

  // The string follows the tiles, so it is drawn again whenever they move.
  window.addEventListener("resize", () => {
    if (current) drawStrings();
  });

  pick.addEventListener("change", () => {
    choose(pick.value);
    try {
      history.replaceState(null, "", `?puzzle=${encodeURIComponent(pick.value)}`);
    } catch (error) {
      // Blocked on some local file URLs, and only a convenience anyway.
    }
  });

  // ?puzzle=... in the URL wins; otherwise the newest, which is the last.
  const asked = new URLSearchParams(location.search).get("puzzle");
  const start = PUZZLES.find((puzzle) => puzzle.index === asked) || PUZZLES[PUZZLES.length - 1];
  if (start) choose(start.index);
}

main();
