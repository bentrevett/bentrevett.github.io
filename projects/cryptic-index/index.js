// The data lives in indicators.js, pulled in by a script tag: TYPES and
// INDICATORS both come from there.
//
// Everything is held in memory and filtered on every keystroke. Walking a few
// thousand entries costs nothing, so there is no index to build and no
// debounce to get wrong: what you see is always what you have typed.
//
// Drawing them is the part that costs, so only the first MOST are put on the
// page. Nobody reads six thousand rows, and by the third letter there are
// rarely more than a handful left.
const MOST = 200;

// --- reading the data ------------------------------------------------------

// A syntax error in indicators.js stops the whole file loading, and no amount
// of checking inside this one can see an entry that never arrived. All this
// can do is say so on the page rather than leaving a blank one.
if (typeof INDICATORS === "undefined" || typeof TYPES === "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("countText").textContent =
      "indicators.js did not load — there is probably a typo in it. The browser console says where.";
  });
  throw new Error("cryptic-index: indicators.js did not load");
}

// Two entries for the same word are one entry: the types are pooled and both
// notes kept. Adding "about" a second time to give it a type it was missing is
// a reasonable way to edit the file by hand, so it works, and it is reported
// below rather than silently swallowed.
function mergeEntries(list) {
  const byWord = new Map();
  for (const entry of list) {
    const key = (entry.word || "").trim().toLowerCase();
    const held = byWord.get(key);
    if (!held) {
      byWord.set(key, { word: entry.word, types: [...entry.types], notes: entry.notes || "" });
      continue;
    }
    for (const type of entry.types) if (!held.types.includes(type)) held.types.push(type);
    const note = (entry.notes || "").trim();
    if (note && !held.notes.includes(note)) held.notes = (held.notes + " " + note).trim();
  }
  // Back into the order TYPES declares, so a merged entry's tags read the same
  // as everything else. A type TYPES does not define goes last rather than
  // first, which is where findIndex would otherwise put it.
  const rank = (id) => {
    const at = TYPES.findIndex((type) => type.id === id);
    return at === -1 ? TYPES.length : at;
  };
  for (const entry of byWord.values()) entry.types.sort((a, b) => rank(a) - rank(b));
  return [...byWord.values()].sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
}

// Everything worth knowing about the file after you have edited it, in two
// two. A word listed twice is a `merge` — worth mentioning, not wrong, since
// adding a second entry is a fair way to give an existing word another type.
// Everything else is a `problem`: it will cost you a lookup.
function checkEntries(list) {
  const merges = [];
  const problems = [];
  const seen = new Map();
  for (const entry of list) {
    const word = (entry.word || "").trim();
    const key = word.toLowerCase();
    if (seen.has(key)) {
      merges.push(`"${word}" is listed ${seen.get(key) + 1} times — pooled into one entry`);
    }
    seen.set(key, (seen.get(key) || 0) + 1);

    if (!word) problems.push("an entry has no word");
    if (word !== entry.word) problems.push(`"${entry.word}" has a space at one end`);
    if (word !== word.toLowerCase()) problems.push(`"${word}" has a capital letter, so it will not be found`);
    if (!Array.isArray(entry.types) || entry.types.length === 0) {
      problems.push(`"${word}" has no types`);
    } else {
      for (const type of entry.types) {
        if (!TYPES.some((known) => known.id === type)) problems.push(`"${word}" has an unknown type: ${type}`);
      }
    }
    if (typeof entry.notes !== "string") problems.push(`"${word}" has notes that are not text`);
    // The things that make a word unsearchable, all of which were cleaned out
    // of the file once and are easy to reintroduce by pasting from a list.
    if (/\b[xy]('s)?\b/i.test(word)) {
      problems.push(`"${word}" holds an x or y standing in for the fodder — use the indicator on its own`);
    }
    if (word.includes("/")) problems.push(`"${word}" holds a slash — make it two entries`);
    if (word.includes("(")) problems.push(`"${word}" holds a bracket — make it two entries`);
    if (/[\u2018\u2019\u2026]/.test(word)) problems.push(`"${word}" holds a curly quote or an ellipsis`);
  }
  return { merges, problems };
}

const ENTRIES = mergeEntries(INDICATORS);

let state = {
  typed: "",
  // A type id, or null for all of them.
  type: null,
  // Set by the Show all button, and dropped again the moment the search
  // changes: it answers "let me see the rest of these", not "always show
  // everything".
  all: false,
};

// Entries whose word starts with what has been typed, in the type being shown.
// Prefix rather than substring: typing F wants words beginning with F, which
// is how you look something up having just read it in a clue.
function matches() {
  const typed = state.typed.trim().toLowerCase();
  return ENTRIES.filter((entry) => {
    if (state.type && !entry.types.includes(state.type)) return false;
    return entry.word.toLowerCase().startsWith(typed);
  });
}

function labelOf(id) {
  const type = TYPES.find((candidate) => candidate.id === id);
  return type ? type.label : id;
}

// --- rendering ------------------------------------------------------------

// The type buttons, with the one in force greyed out to say so.
function renderTypes() {
  const row = document.getElementById("types");
  row.replaceChildren();

  const button = (label, id) => {
    const element = document.createElement("button");
    element.textContent = label;
    element.disabled = state.type === id;
    element.addEventListener("click", () => {
      state.type = id;
      state.all = false;
      render();
    });
    row.append(element);
  };

  button("All", null);
  for (const type of TYPES) button(type.label, type.id);
}

function renderResults() {
  const table = document.getElementById("results");
  table.replaceChildren();

  // Redrawn with the rows rather than left in the HTML, since replaceChildren
  // takes the whole table down every time.
  const head = table.createTHead().insertRow();
  for (const [name, className] of [["Word", "word"], ["Types", "types"], ["Notes", "notes"]]) {
    const cell = document.createElement("th");
    cell.textContent = name;
    cell.className = className;
    head.append(cell);
  }

  const showing = state.all ? matches() : matches().slice(0, MOST);
  for (const entry of showing) {
    const line = table.insertRow();

    const word = line.insertCell();
    word.className = "word";
    word.textContent = entry.word;

    const types = line.insertCell();
    types.className = "types";
    for (const id of entry.types) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = labelOf(id);
      // A tag is also the quickest way to see the rest of its type.
      tag.title = `show every ${labelOf(id).toLowerCase()} indicator`;
      tag.addEventListener("click", () => {
        state.type = id;
        state.all = false;
        render();
      });
      types.append(tag);
    }

    const notes = line.insertCell();
    notes.className = "notes";
    notes.textContent = entry.notes;
  }
}

function render() {
  renderTypes();

  // The reminder for the type being shown. Kept to one line's height whether
  // there is one or not, so the list below does not jump about as you type.
  const shown = TYPES.find((candidate) => candidate.id === state.type);
  document.getElementById("reminder").textContent = shown ? shown.reminder : "";

  const found = matches().length;
  const pool = state.type
    ? ENTRIES.filter((entry) => entry.types.includes(state.type)).length
    : ENTRIES.length;
  const many = (n) => `${n} ${n === 1 ? "entry" : "entries"}`;
  const counted = found === pool ? many(pool) : `${found} of ${many(pool)}`;
  const capped = found > MOST && !state.all;
  document.getElementById("countText").textContent =
    capped ? `${counted}, showing the first ${MOST}` : counted;
  document.getElementById("showAll").disabled = !capped;

  renderResults();
  document.getElementById("clear").disabled = state.typed === "" && state.type === null;
}

// --- setup ----------------------------------------------------------------

function main() {
  const search = document.getElementById("search");

  // On input rather than on keyup, so pasting and holding a key down are
  // caught along with ordinary typing.
  search.addEventListener("input", () => {
    state.typed = search.value;
    state.all = false;
    render();
  });

  document.getElementById("showAll").addEventListener("click", () => {
    state.all = true;
    render();
  });

  document.getElementById("clear").addEventListener("click", () => {
    state = { typed: "", type: null, all: false };
    search.value = "";
    search.focus();
    render();
  });

  // Escape empties the box without reaching for the button.
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.getElementById("clear").click();
  });

  // Said once, at the console, so editing the file tells you what it made of
  // your edit rather than leaving you to notice a missing row.
  const { merges, problems } = checkEntries(INDICATORS);
  console.log(`cryptic-index: ${ENTRIES.length} entries from ${INDICATORS.length} listed`);
  if (merges.length) {
    console.log(`cryptic-index: ${merges.length} word(s) listed more than once`);
    for (const merge of merges) console.log("  " + merge);
  }
  if (problems.length) {
    console.warn(`cryptic-index: ${problems.length} thing(s) wrong in indicators.js`);
    for (const problem of problems) console.warn("  " + problem);
  }

  render();
  search.focus();
}

main();
