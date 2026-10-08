// The puzzles live in puzzles.js, written by hand and pulled in by a script
// tag: PUZZLES comes from there.

// --- letters ---------------------------------------------------------------

// What counts: every character but a space. Case does not matter.
function lettersOf(text) {
  return text.toUpperCase().replace(/\s+/g, "");
}

// The letters a phrase has to spare once its answer is taken out, in the order
// they stand in the phrase. Null if the answer is not in the phrase at all,
// which can only mean a typo in puzzles.js.
function leftoverOf(phrase, answer) {
  const pool = [...lettersOf(phrase)];
  for (const letter of lettersOf(answer)) {
    const at = pool.indexOf(letter);
    if (at === -1) return null;
    pool.splice(at, 1);
  }
  return pool;
}

// The letters a clue has to spare, as puzzles.js gives them in spare_letters,
// in the order written there. A clue without the field falls back to working
// them out, in the order they stand in the phrase.
function spareOf(clue) {
  if (typeof clue.spare_letters === "string") return [...lettersOf(clue.spare_letters)];
  return leftoverOf(clue.phrase || "", clue.answer || "") || [];
}

// "(4)", or "(3,7)" for an answer of two words, as a crossword would give it.
function lengthOf(answer) {
  return "(" + answer.trim().split(/\s+/).map((word) => word.length).join(",") + ")";
}

const sorted = (letters) => [...letters].sort().join("");

// --- checking the puzzles --------------------------------------------------

// Everything about one puzzle that would stop it being solvable as written. The
// puzzles are hand-made, so this is the proof-reader: it runs when the page
// loads, and anything it finds goes to the console and onto the page.
function checkPuzzle(puzzle) {
  const problems = [];
  const label = `"${puzzle.index}"`;
  if (!puzzle.category) problems.push(`${label} has no category`);
  if (!puzzle.solution) problems.push(`${label} has no solution`);
  if (!Array.isArray(puzzle.clues) || puzzle.clues.length === 0) {
    problems.push(`${label} has no clues`);
    return problems;
  }

  const spare = [];
  puzzle.clues.forEach((clue, index) => {
    const which = `${label} clue ${index + 1} ("${clue.phrase}")`;
    const left = leftoverOf(clue.phrase || "", clue.answer || "");
    if (left === null) {
      problems.push(`${which}: ${clue.answer} cannot be made from its letters`);
      return;
    }
    if (left.length === 0) problems.push(`${which}: has no letters left over`);
    // spare_letters is written by hand, so it is checked against what taking
    // the answer out of the phrase really leaves.
    if (typeof clue.spare_letters === "string" && sorted(lettersOf(clue.spare_letters)) !== sorted(left)) {
      problems.push(`${which}: spare_letters says ${clue.spare_letters}, but taking ${clue.answer} out leaves ${sorted(left)}`);
      return;
    }
    spare.push(...spareOf(clue));
  });

  // Only worth comparing once every clue has added up on its own.
  if (puzzle.solution && problems.length === 0) {
    const want = sorted(lettersOf(puzzle.solution));
    const have = sorted(spare);
    if (want !== have) {
      problems.push(`${label}: the leftovers are ${have}, but ${puzzle.solution} needs ${want}`);
    }
  }
  return problems;
}

function checkAll() {
  const problems = [];
  const seen = new Set();
  for (const puzzle of PUZZLES) {
    if (!puzzle.index) problems.push("a puzzle has no index");
    else if (seen.has(puzzle.index)) problems.push(`"${puzzle.index}" is the index of two puzzles`);
    seen.add(puzzle.index);
    problems.push(...checkPuzzle(puzzle));
  }
  return problems;
}

// --- game state -------------------------------------------------------------

// One record per puzzle, made the first time it is opened, so moving between
// puzzles in the dropdown keeps what you had done on each.
const progress = new Map();

let current;

function progressOf(puzzle) {
  if (!progress.has(puzzle.index)) {
    progress.set(puzzle.index, {
      typed: puzzle.clues.map(() => ""),
      solved: puzzle.clues.map(() => false),
      solutionTyped: "",
      solutionSolved: false,
    });
  }
  return progress.get(puzzle.index);
}

function done() {
  return progressOf(current).solutionSolved;
}

// --- rendering --------------------------------------------------------------

// A row of fixed width letter boxes, with a dot for each one not yet known, so
// letters arriving never change how wide anything is.
function letterBoxes(letters, known) {
  const holder = document.createElement("span");
  holder.className = "boxes";
  for (const letter of letters) {
    const box = document.createElement("span");
    box.className = "box" + (known ? " known" : "");
    box.textContent = known ? letter : "·";
    holder.append(box);
  }
  return holder;
}

// The answer box for a clue or for the solution. Built once per puzzle and
// updated in place as you type: redrawing it on every keystroke would throw
// away the caret.
function answerBox(answer, typed, solved, onType, width) {
  const input = document.createElement("input");
  input.type = "text";
  // Every clue box is as wide as the longest answer, so the lengths and the
  // spare letters line up in columns rather than wandering row to row.
  input.size = (width || lettersOf(answer).length) + 2;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "characters");
  input.setAttribute("autocorrect", "off");
  input.value = solved ? answer : typed;
  input.disabled = solved || done();
  input.className = solved ? "right" : "";
  input.addEventListener("input", () => onType(input));
  return input;
}

// Right or wrong is only said once the box holds as many letters as the
// answer: a half-typed word is not wrong yet, it is unfinished.
function judge(input, answer) {
  const typed = lettersOf(input.value);
  const full = typed.length >= lettersOf(answer).length;
  const right = typed === lettersOf(answer);
  input.className = right ? "right" : full ? "wrong" : "";
  return right;
}

function renderPuzzle() {
  const puzzle = current;
  const record = progressOf(puzzle);

  // Working out what the words have in common is half the puzzle, so it is
  // only said once the solution is in. Until then a question mark holds the
  // line, so the page does not jump when the answer arrives.
  document.getElementById("category").textContent = record.solutionSolved
    ? `Category: ${puzzle.category}`
    : "Category: ?";

  const table = document.getElementById("clues");
  table.replaceChildren();
  const widest = Math.max(...puzzle.clues.map((clue) => lettersOf(clue.answer).length));

  puzzle.clues.forEach((clue, index) => {
    const row = table.insertRow();
    const left = spareOf(clue);

    const phrase = row.insertCell();
    phrase.className = "phrase";
    phrase.textContent = clue.phrase.toUpperCase();

    const cell = row.insertCell();
    cell.className = "answer";
    const input = answerBox(clue.answer, record.typed[index], record.solved[index], (box) => {
      record.typed[index] = box.value;
      if (!judge(box, clue.answer)) return;
      record.solved[index] = true;
      box.value = clue.answer.toUpperCase();
      box.disabled = true;
      spare.firstChild.replaceWith(letterBoxes(left, true));
      renderPool();
      // Straight on to the next clue still open, so a run of solves does not
      // need the mouse in between.
      const next = [...table.querySelectorAll("input")].find((other) => !other.disabled);
      (next || document.getElementById("solution")).focus();
      render();
    }, widest);
    input.id = `clue${index}`;
    cell.append(input);

    const length = document.createElement("span");
    length.className = "length";
    length.textContent = " " + lengthOf(clue.answer);
    cell.append(length);

    // What this clue has to spare: dots until it is solved, then the letters,
    // with how many there are after them either way.
    const spare = row.insertCell();
    spare.className = "spare";
    const count = document.createElement("span");
    count.className = "length";
    count.textContent = `(${left.length})`;
    spare.append(letterBoxes(left, record.solved[index]), count);
  });

  // The solution box, with the pool of leftovers above it.
  const solutionCell = document.getElementById("solutionCell");
  solutionCell.replaceChildren();
  const input = answerBox(puzzle.solution, record.solutionTyped, record.solutionSolved, (box) => {
    record.solutionTyped = box.value;
    if (!judge(box, puzzle.solution)) return;
    record.solutionSolved = true;
    box.value = puzzle.solution.toUpperCase();
    renderPuzzle();
    render();
  });
  input.id = "solution";
  solutionCell.append(input);
  const length = document.createElement("span");
  length.className = "length";
  length.textContent = " " + lengthOf(puzzle.solution);
  solutionCell.append(length);

  renderPool();
}

// Every leftover found so far, in clue order, with dots holding the places of
// the ones still to come. One even run of letters rather than a group per
// clue: which clue gave which letter is no help in unscrambling them.
function renderPool() {
  const record = progressOf(current);
  const pool = document.getElementById("pool");
  pool.replaceChildren();
  current.clues.forEach((clue, index) => {
    const boxes = letterBoxes(spareOf(clue), record.solved[index] || record.solutionSolved);
    pool.append(...boxes.childNodes);
  });
}

function render() {
  const record = progressOf(current);
  document.getElementById("pick").value = current.index;

  const solvedClues = record.solved.filter(Boolean).length;
  document.getElementById("message").textContent = record.solutionSolved
    ? `Solved: ${current.solution.toUpperCase()}.`
    : "";
  document.getElementById("clues").className = record.solutionSolved ? "done" : "";
  document.getElementById("clear").disabled =
    record.typed.every((text) => !text) && !record.solutionTyped && solvedClues === 0;
}

// --- setup ------------------------------------------------------------------

function choose(index) {
  const puzzle = PUZZLES.find((candidate) => candidate.index === index);
  if (!puzzle) return;
  current = puzzle;

  const broken = checkPuzzle(puzzle);
  document.getElementById("broken").textContent = broken.length
    ? "This puzzle does not add up as written: " + broken.join("; ") + "."
    : "";

  renderPuzzle();
  render();
}

function main() {
  const problems = checkAll();
  if (problems.length) {
    console.warn(`catagrams: ${problems.length} thing(s) wrong in puzzles.js`);
    for (const problem of problems) console.warn("  " + problem);
  }

  // The dropdown lists the puzzles by index, in the order puzzles.js gives
  // them. Not by category: that would give away what the category is.
  const pick = document.getElementById("pick");
  for (const puzzle of PUZZLES) {
    const option = document.createElement("option");
    option.value = puzzle.index;
    option.textContent = puzzle.index;
    pick.append(option);
  }

  pick.addEventListener("change", () => {
    choose(pick.value);
    try {
      history.replaceState(null, "", `?puzzle=${encodeURIComponent(pick.value)}`);
    } catch (error) {
      // Blocked on some local file URLs, and only a convenience anyway.
    }
  });

  document.getElementById("clear").addEventListener("click", () => {
    const record = progressOf(current);
    record.typed = current.clues.map(() => "");
    record.solved = current.clues.map(() => false);
    record.solutionTyped = "";
    record.solutionSolved = false;
    renderPuzzle();
    render();
  });

  // ?puzzle=... in the URL wins; otherwise the newest, which is the last.
  const asked = new URLSearchParams(location.search).get("puzzle");
  const start = PUZZLES.find((puzzle) => puzzle.index === asked) || PUZZLES[PUZZLES.length - 1];
  if (start) choose(start.index);
}

main();
