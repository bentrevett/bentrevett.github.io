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

const TYPE_IDS = TYPES.map((type) => type.id);

// "O (cricket), NIL" into [{ letters: "O", gloss: "cricket" }, { letters: "NIL", gloss: "" }].
// Split on commas outside brackets only, so a gloss is free to hold one.
function readLetters(text) {
  return (text || "")
    .split(/,(?![^()]*\))/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const bracketed = item.match(/^(.*?)\s*\((.*)\)$/);
      return bracketed ? { letters: bracketed[1], gloss: bracketed[2] } : { letters: item, gloss: "" };
    });
}

// One sentence onto another, unless it is already there.
function addSentence(held, more) {
  more = (more || "").trim();
  if (!more || held.includes(more)) return held;
  return held ? `${held} ${more}` : more;
}

// The file's shape — a key per type — into the one the page works with:
//
//   { word, types: ["anagram", ...], notes: { container: "..." }, letters: [{ letters, gloss }], note }
//
// with `types` in the order TYPES declares, whatever order the keys came in.
//
// Two entries for the same word are one entry: the types are pooled and both
// notes kept. Adding "about" a second time to give it a type it was missing is
// a reasonable way to edit the file by hand, so it works, and it is reported
// below rather than silently swallowed.
function mergeEntries(list) {
  const byWord = new Map();
  for (const raw of list) {
    const key = (raw.word || "").trim().toLowerCase();
    if (!byWord.has(key)) byWord.set(key, { word: raw.word, types: [], notes: {}, letters: [], note: "" });
    const held = byWord.get(key);
    for (const id of TYPE_IDS) {
      if (!(id in raw)) continue;
      if (!held.types.includes(id)) held.types.push(id);
      if (id === "abbreviation") {
        for (const item of readLetters(raw[id])) {
          const same = held.letters.find((had) => had.letters === item.letters);
          if (!same) held.letters.push(item);
          else if (!same.gloss) same.gloss = item.gloss;
        }
      } else {
        held.notes[id] = addSentence(held.notes[id] || "", raw[id]);
      }
    }
    held.note = addSentence(held.note, raw.note);
  }
  for (const entry of byWord.values()) {
    entry.types.sort((a, b) => TYPE_IDS.indexOf(a) - TYPE_IDS.indexOf(b));
  }
  return [...byWord.values()].sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
}

// Everything worth knowing about the file after you have edited it, in two
// piles. A word listed twice is a `merge` — worth mentioning, not wrong, since
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

    const keys = Object.keys(entry).filter((k) => k !== "word" && k !== "note");
    if (!keys.some((k) => TYPE_IDS.includes(k))) problems.push(`"${word}" has no types`);
    for (const k of keys) {
      if (!TYPE_IDS.includes(k)) problems.push(`"${word}" has an unknown key: ${k}`);
      else if (typeof entry[k] !== "string") problems.push(`"${word}" has a ${k} that is not text`);
    }
    if ("note" in entry && typeof entry.note !== "string") problems.push(`"${word}" has a note that is not text`);
    for (const item of readLetters(entry.abbreviation)) {
      if (!/^[A-Z0-9][A-Z0-9 ']*$/.test(item.letters)) {
        problems.push(`"${word}" has abbreviation "${item.letters}" — letters should be capitals, with any explanation in brackets`);
      }
    }

    // The things that make a word unsearchable, all of which were cleaned out
    // of the file once and are easy to reintroduce by pasting from a list.
    // A lone x or y, that is: "x-ray" is a word in its own right.
    if (/(^|\s)[xy]('s)?(\s|$)/i.test(word)) {
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

// Where what has been typed starts inside an entry: 0 at the very beginning,
// 1 at the start of a later word, -1 nowhere.
//
// Prefix rather than substring, but per word rather than per entry. Typing
// "front" should find "in front of", because a phrase is filed under the words
// it is made of and you will not always have read the first of them. Typing
// "omewhat" still finds nothing: matching mid-word would turn every short
// query into a list of accidents.
function startsAtWord(text, typed) {
  if (!typed || text.startsWith(typed)) return 0;
  for (let at = 0; at < text.length; at++) {
    // A space or a hyphen both start a new word: "about-turn" answers to
    // "turn" as readily as "in front of" answers to "front".
    if (text[at] !== " " && text[at] !== "-") continue;
    if (text.startsWith(typed, at + 1)) return 1;
  }
  return -1;
}

// Entries the typed text reaches, in the type being shown. Those it matches
// from the beginning come first, so typing the start of a word still brings
// that word to the top; within each group the order stays alphabetical.
function matches() {
  const typed = state.typed.trim().toLowerCase();
  const found = [];
  for (const entry of ENTRIES) {
    if (state.type && !entry.types.includes(state.type)) continue;
    const at = startsAtWord(entry.word.toLowerCase(), typed);
    if (at >= 0) found.push({ entry, at });
  }
  return found.sort((a, b) => a.at - b.at).map((hit) => hit.entry);
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

function element(tag, className, text) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

// A type's tag. It is also the quickest way to see the rest of its type, and
// the type being shown is picked out, so you can see at a glance which of a
// word's several readings you are looking at.
function tagFor(id) {
  const tag = element("span", id === state.type ? "tag on" : "tag", labelOf(id));
  tag.title = `show every ${labelOf(id).toLowerCase()} entry`;
  tag.addEventListener("click", () => {
    state.type = id;
    state.all = false;
    render();
  });
  return tag;
}

// One line of an entry: a tag (or a few) on the left, what it means on the
// right. The tag column is the same width everywhere, so the notes line up
// down the whole table rather than only within one entry.
function lineOf(tags, body, className) {
  const line = element("div", className ? `line ${className}` : "line");
  const left = element("span", "tags");
  left.append(...tags);
  const right = element("span", "body");
  if (body !== undefined) right.append(body);
  line.append(left, right);
  return line;
}

// Abbreviation letters as tiles, each with its gloss in small type after it.
function lettersOf(entry) {
  const list = element("span", "letters");
  for (const { letters, gloss } of entry.letters) {
    const item = element("span", "item");
    item.append(element("span", "tile", letters));
    if (gloss) item.append(element("span", "gloss", gloss));
    list.append(item);
  }
  return list;
}

// Everything an entry means, one type to a line:
//
//   ANAGRAM REVERSAL
//   CONTAINER      Wraps around: what follows goes inside it.
//   ABBREVIATION   [A] [C] [CA] [RE] [ON]
//
// Types with nothing to say share the first line, since a line each would
// only be a column of tags. Then a line for each type that does have a note,
// then the abbreviation letters, then anything said of the word as a whole.
function meaningOf(entry) {
  const cell = element("td", "meaning");
  const plain = entry.types.filter((id) => id !== "abbreviation" && !entry.notes[id]);
  if (plain.length) cell.append(lineOf(plain.map(tagFor), undefined, "plain"));
  for (const id of entry.types) {
    if (id === "abbreviation" || !entry.notes[id]) continue;
    cell.append(lineOf([tagFor(id)], entry.notes[id]));
  }
  if (entry.types.includes("abbreviation")) {
    cell.append(lineOf([tagFor("abbreviation")], entry.letters.length ? lettersOf(entry) : undefined));
  }
  if (entry.note) cell.append(lineOf([], entry.note, "note"));
  return cell;
}

function renderResults() {
  const table = document.getElementById("results");
  table.replaceChildren();

  // Redrawn with the rows rather than left in the HTML, since replaceChildren
  // takes the whole table down every time.
  const head = table.createTHead().insertRow();
  head.append(element("th", "word", "Word"), element("th", "meaning", "Wordplay"));

  const body = table.createTBody();
  const showing = state.all ? matches() : matches().slice(0, MOST);
  for (const entry of showing) {
    const row = body.insertRow();
    row.append(element("td", "word", entry.word), meaningOf(entry));
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
