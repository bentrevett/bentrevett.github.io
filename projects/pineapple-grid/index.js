// --- tunable values -------------------------------------------------------

// Placeholder points per hand type, tweak these later.
const HAND_SCORES = {
  "High Card": 1,
  Pair: 2,
  "Two Pair": 4,
  "Three of a Kind": 8,
  Straight: 16,
  Flush: 32,
  "Full House": 64,
  "Four of a Kind": 128,
  "Straight Flush": 256,
  "Royal Flush": 512,
};

// Hand types worst to best, used to order the scoring table.
const HAND_TYPES = Object.keys(HAND_SCORES);

const GRID_SIZE = 5; // the grid is GRID_SIZE by GRID_SIZE
const GRID_CELLS = GRID_SIZE * GRID_SIZE;
const CORNERS = [0, GRID_SIZE - 1, GRID_CELLS - GRID_SIZE, GRID_CELLS - 1];
const TURNS = 7; // number of deals
const DEAL_SIZE = 5; // cards dealt per turn
const PLACE_PER_TURN = 3; // cards placed per turn, the rest are discarded
const TOTAL_DISCARDS = TURNS * (DEAL_SIZE - PLACE_PER_TURN); // reserved slots

// The corners plus three a turn must fill the grid exactly.
if (CORNERS.length + TURNS * PLACE_PER_TURN !== GRID_CELLS) {
  throw new Error("turn structure does not fill the grid exactly");
}

// --- cards ----------------------------------------------------------------

const RANKS = [
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
  { value: 9, label: "9" },
  { value: 10, label: "10" },
  { value: 11, label: "J" },
  { value: 12, label: "Q" },
  { value: 13, label: "K" },
  { value: 14, label: "A" },
];

const SUITS = [
  { symbol: "♠", red: false }, // spades
  { symbol: "♥", red: true }, // hearts
  { symbol: "♦", red: true }, // diamonds
  { symbol: "♣", red: false }, // clubs
];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        value: rank.value,
        rank: rank.label,
        label: rank.label + suit.symbol,
        suit: suit.symbol,
        red: suit.red,
      });
    }
  }
  return deck;
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

function shuffle(deck, random) {
  const shuffled = deck.slice();
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

// The daily puzzle's name. Worked out afresh each time rather than cached,
// so a page left open past midnight stops calling yesterday's puzzle today's.
function todaysSeed() {
  return getDateString(new Date());
}

// --- hand evaluation ------------------------------------------------------

// Names the best five card poker hand. Expects exactly GRID_SIZE cards.
function evaluateHand(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => a - b);
  const isFlush = cards.every((card) => card.suit === cards[0].suit);

  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  // Group sizes, largest first, e.g. a full house is [3, 2].
  const groups = [...counts.values()].sort((a, b) => b - a);

  let isStraight = false;
  let straightHigh = 0;
  if (counts.size === values.length) {
    if (values[values.length - 1] - values[0] === values.length - 1) {
      isStraight = true;
      straightHigh = values[values.length - 1];
    } else if (values.join() === "2,3,4,5,14") {
      // The wheel, where the ace plays low.
      isStraight = true;
      straightHigh = 5;
    }
  }

  if (isStraight && isFlush) {
    return straightHigh === 14 ? "Royal Flush" : "Straight Flush";
  }
  if (groups[0] === 4) return "Four of a Kind";
  if (groups[0] === 3 && groups[1] === 2) return "Full House";
  if (isFlush) return "Flush";
  if (isStraight) return "Straight";
  if (groups[0] === 3) return "Three of a Kind";
  if (groups[0] === 2 && groups[1] === 2) return "Two Pair";
  if (groups[0] === 2) return "Pair";
  return "High Card";
}

// --- lines ----------------------------------------------------------------

// The ten scoring lines, five across and five down. No diagonals.
function makeLines() {
  const rows = [];
  const columns = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    const across = [];
    const down = [];
    for (let j = 0; j < GRID_SIZE; j++) {
      across.push(i * GRID_SIZE + j);
      down.push(j * GRID_SIZE + i);
    }
    rows.push({ label: `Row ${i + 1}`, cells: across });
    columns.push({ label: `Col ${i + 1}`, cells: down });
  }
  // All five rows first, then all five columns.
  return [...rows, ...columns];
}

const LINES = makeLines();

// --- game state -----------------------------------------------------------

let state;

function newGame(seedString, label) {
  const deck = shuffle(makeDeck(), makeRandom(hashString(seedString)));
  const grid = new Array(GRID_CELLS).fill(null);
  // The four corners start face up.
  CORNERS.forEach((cell, index) => {
    grid[cell] = deck[index];
  });

  state = {
    label: label,
    deck: deck,
    turn: 0,
    grid: grid,
    hand: deck.slice(CORNERS.length, CORNERS.length + DEAL_SIZE),
    // Placements made this turn, so they can be undone before the turn ends.
    placements: [],
    selected: null,
    discards: [],
    finished: false,
  };
}

function isPlaced(handIndex) {
  return state.placements.some((placement) => placement.handIndex === handIndex);
}

function selectCard(handIndex) {
  if (state.finished || isPlaced(handIndex)) return;
  // Clicking the selected card again clears the selection.
  state.selected = state.selected === handIndex ? null : handIndex;
  render();
}

function placeSelected(cellIndex) {
  const handIndex = state.selected;
  if (state.finished || handIndex === null) return;
  if (state.grid[cellIndex] !== null) return;

  state.grid[cellIndex] = state.hand[handIndex];
  state.placements.push({ handIndex: handIndex, cellIndex: cellIndex });
  state.selected = null;

  if (state.placements.length === PLACE_PER_TURN) endTurn();
  render();
}

function endTurn() {
  // Cards still unplaced at the end of the turn are discarded.
  state.discards.push(...state.hand.filter((_, index) => !isPlaced(index)));
  state.turn += 1;
  state.selected = null;

  if (state.turn >= TURNS) {
    // Keep the final hand and its placements on screen, greyed out.
    state.finished = true;
  } else {
    state.placements = [];
    const start = CORNERS.length + state.turn * DEAL_SIZE;
    state.hand = state.deck.slice(start, start + DEAL_SIZE);
  }
}

function undo() {
  if (state.finished) return;
  const last = state.placements.pop();
  if (!last) return;
  state.grid[last.cellIndex] = null;
  state.selected = null;
  render();
}

// --- scoring --------------------------------------------------------------

// A line only scores once all five of its cells are filled.
function scoreLine(line) {
  const cards = line.cells.map((cell) => state.grid[cell]);
  if (cards.some((card) => card === null)) return null;
  const handType = evaluateHand(cards);
  return { handType: handType, points: HAND_SCORES[handType] };
}

function totalScore() {
  return LINES.reduce((total, line) => {
    const result = scoreLine(line);
    return total + (result ? result.points : 0);
  }, 0);
}

// --- rendering ------------------------------------------------------------

// Builds a fixed width card, so a "10" takes the same space as a "J" and
// nothing shifts when a hand happens to contain a ten.
function pipElement(rankText, suitText, className) {
  const span = document.createElement("span");
  if (className) span.className = className;
  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = rankText;
  span.append(rank, suitText);
  return span;
}

function cardElement(card) {
  return pipElement(card.rank, card.suit, card.red ? "red" : "");
}

function slotElement() {
  return pipElement("·", "·", "slot");
}

function cardsElement(cards, slots) {
  const elements = cards.map(cardElement);
  // Show the remaining empty slots so the row length is obvious.
  for (let i = cards.length; i < slots; i++) {
    elements.push(slotElement());
  }

  const fragment = document.createDocumentFragment();
  elements.forEach((element, index) => {
    if (index > 0) fragment.append(" ");
    fragment.append(element);
  });
  return fragment;
}

function widestOf(strings) {
  return Math.max(...strings.map((string) => [...string].length));
}

// Padded to the widest text each column could ever hold, so they do not
// resize as lines are completed. Derived from the data, not hardcoded.
const COLUMN_WIDTHS = {
  Line: widestOf(LINES.map((line) => line.label)),
  Hand: widestOf(HAND_TYPES),
  Score: widestOf(HAND_TYPES.map((handType) => String(HAND_SCORES[handType]))),
};

function renderScoring() {
  const table = document.getElementById("scoring");
  table.replaceChildren();

  const header = table.insertRow();
  for (const text of ["Hand", "Points"]) {
    const cell = document.createElement("th");
    cell.textContent = text;
    header.append(cell);
  }

  for (const handType of HAND_TYPES) {
    const row = table.insertRow();
    row.insertCell().textContent = handType;
    row.insertCell().textContent = HAND_SCORES[handType];
  }
}

function renderGrid() {
  const table = document.getElementById("grid");
  table.replaceChildren();

  for (let i = 0; i < GRID_SIZE; i++) {
    const line = table.insertRow();
    for (let j = 0; j < GRID_SIZE; j++) {
      const cellIndex = i * GRID_SIZE + j;
      const card = state.grid[cellIndex];
      const cell = line.insertCell();
      // Every cell holds one card sized element, empty or not, so the grid
      // never changes size.
      cell.append(card ? cardElement(card) : slotElement());

      const open = card === null && !state.finished;
      if (open && state.selected !== null) {
        cell.className = "open";
        cell.addEventListener("click", () => placeSelected(cellIndex));
      } else if (open) {
        cell.className = "empty";
      }
    }
  }
}

function renderLines() {
  const table = document.getElementById("lines");
  table.replaceChildren();

  const header = table.insertRow();
  for (const text of ["Line", "Cards", "Hand", "Score"]) {
    const cell = document.createElement("th");
    cell.textContent = text;
    if (COLUMN_WIDTHS[text]) cell.style.width = `${COLUMN_WIDTHS[text]}ch`;
    header.append(cell);
  }

  for (const line of LINES) {
    const cards = line.cells
      .map((cell) => state.grid[cell])
      .filter((card) => card !== null);
    const result = scoreLine(line);

    const row = table.insertRow();
    row.insertCell().textContent = line.label;
    row.insertCell().append(cardsElement(cards, GRID_SIZE));
    row.insertCell().textContent = result ? result.handType : "—";
    row.insertCell().textContent = result ? result.points : "—";
  }

  const totalRow = table.insertRow();
  const totalLabel = document.createElement("th");
  totalLabel.colSpan = 3;
  totalLabel.textContent = "Total";
  const totalValue = document.createElement("th");
  totalValue.textContent = totalScore();
  totalRow.append(totalLabel, totalValue);
}

function renderHand() {
  const container = document.getElementById("hand");
  container.replaceChildren();

  const remaining = PLACE_PER_TURN - state.placements.length;
  const note = document.createElement("p");
  note.textContent = state.finished
    ? "The grid is full, the puzzle is complete."
    : state.selected === null
    ? `Select a card, then click an empty cell. ${remaining} to place.`
    : `Now click an empty cell. ${remaining} to place.`;
  if (state.finished) note.className = "placed";
  container.append(note);

  const table = document.createElement("table");
  table.id = "handTable";

  state.hand.forEach((card, index) => {
    const placement = state.placements.find((p) => p.handIndex === index);
    const line = table.insertRow();
    // Placed cards grey out in place rather than vanishing. Once the puzzle
    // is over the whole table greys out for the same reason.
    if (placement || state.finished) line.className = "placed";

    // A fixed width marker column, so selecting never shifts anything.
    const marker = line.insertCell();
    marker.className = "marker";
    marker.textContent = state.selected === index ? "▸" : " ";

    line.insertCell().append(cardElement(card));

    const button = document.createElement("button");
    button.textContent = "Select";
    button.disabled = placement !== undefined || state.finished;
    if (!button.disabled) {
      button.addEventListener("click", () => selectCard(index));
    }
    line.insertCell().append(button);

    // Where the card ended up, padded so it never changes the row width.
    const where = line.insertCell();
    const ref = document.createElement("span");
    ref.className = "cellref";
    ref.textContent = placement ? cellName(placement.cellIndex) : " ";
    where.append(ref);
  });

  container.append(table);
}

function cellName(cellIndex) {
  const row = Math.floor(cellIndex / GRID_SIZE) + 1;
  const column = (cellIndex % GRID_SIZE) + 1;
  return `R${row}C${column}`;
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.label}`;
  // Greyed out while today's puzzle is the one on screen. That is what says
  // you are on it, now the heading no longer singles it out, and it stops a
  // stray click wiping a board you are part way through.
  document.getElementById("today").disabled = state.label === todaysSeed();

  // Holds at the last turn when finished, so the line never changes length.
  const turn = Math.min(state.turn + 1, TURNS);
  document.getElementById("status").textContent = `Turn ${turn} of ${TURNS}.`;

  renderGrid();
  renderLines();
  renderHand();

  // Always shown, with every slot reserved from turn one, so the line does
  // not pop into existence and shove the rest of the page down.
  const discards = document.getElementById("discards");
  discards.replaceChildren(
    "Discarded: ",
    cardsElement(state.discards, TOTAL_DISCARDS)
  );

  document.getElementById("undo").disabled =
    state.finished || state.placements.length === 0;
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

  renderScoring();

  document.getElementById("undo").addEventListener("click", undo);

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
