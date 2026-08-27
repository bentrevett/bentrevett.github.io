// --- tunable values -------------------------------------------------------

// Placeholder points per hand type, tweak these later.
const HAND_SCORES = {
  "High Card": 1,
  "Pair": 2,
  "Two Pair": 4,
  "Three of a Kind": 8,
  "Straight": 16,
  "Flush": 32,
  "Full House": 64,
  "Four of a Kind": 128,
  "Straight Flush": 256,
  "Royal Flush": 512,
};

// Hand types worst to best, used to order the scoring table.
const HAND_TYPES = Object.keys(HAND_SCORES);

// Ordered top to bottom. The top row is the hardest to fill well, so it pays
// the most, much as the royalties in open face Chinese poker do. A row that
// beats the one below it drops to its demoted multiplier instead. The bottom
// row has nothing beneath it, so it is never demoted.
const ROWS = [
  { key: "top", label: "Top", multiplier: 4, demoted: 2 },
  { key: "middle", label: "Middle", multiplier: 2, demoted: 1 },
  { key: "bottom", label: "Bottom", multiplier: 1, demoted: 1 },
];

const ROW_SIZE = 5; // cards per row
const TURNS = 5; // number of deals
const DEAL_SIZE = 5; // cards dealt per turn
const PLACE_PER_TURN = 3; // cards placed per turn, the rest are discarded
const TOTAL_DISCARDS = TURNS * (DEAL_SIZE - PLACE_PER_TURN); // reserved slots

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

// Names the best five card poker hand. Expects exactly ROW_SIZE cards.
// Ranks a five card hand as a list that compares straight through: the hand
// type first, then the tie breakers in the order they matter. Comparing only
// the type would not do, since a pair of aces has to beat a pair of twos when
// checking the rows are in order.
function rankHand(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const isFlush = cards.every((card) => card.suit === cards[0].suit);

  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  // Biggest group first, then highest value, so a full house reads as the
  // three before the two, and a pair as the pair before its kickers.
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0]
  );
  const shape = groups.map((group) => group[1]);
  const byGroup = groups.map((group) => group[0]);

  let straightHigh = 0;
  if (counts.size === values.length) {
    if (values[0] - values[values.length - 1] === values.length - 1) {
      straightHigh = values[0];
    } else if (values.join() === "14,5,4,3,2") {
      // The wheel, where the ace plays low.
      straightHigh = 5;
    }
  }

  if (straightHigh && isFlush) {
    return straightHigh === 14
      ? { name: "Royal Flush", rank: [9, straightHigh] }
      : { name: "Straight Flush", rank: [8, straightHigh] };
  }
  if (shape[0] === 4) return { name: "Four of a Kind", rank: [7, ...byGroup] };
  if (shape[0] === 3 && shape[1] === 2) {
    return { name: "Full House", rank: [6, ...byGroup] };
  }
  if (isFlush) return { name: "Flush", rank: [5, ...values] };
  if (straightHigh) return { name: "Straight", rank: [4, straightHigh] };
  if (shape[0] === 3) return { name: "Three of a Kind", rank: [3, ...byGroup] };
  if (shape[0] === 2 && shape[1] === 2) {
    return { name: "Two Pair", rank: [2, ...byGroup] };
  }
  if (shape[0] === 2) return { name: "Pair", rank: [1, ...byGroup] };
  return { name: "High Card", rank: [0, ...values] };
}

function evaluateHand(cards) {
  return rankHand(cards).name;
}

// Negative when a is the weaker hand, positive when it is the stronger.
function compareHands(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

// --- game state -----------------------------------------------------------

let state;

function newGame(seedString, label) {
  const deck = shuffle(makeDeck(), makeRandom(hashString(seedString)));
  state = {
    label: label,
    deck: deck,
    turn: 0,
    hand: deck.slice(0, DEAL_SIZE),
    rows: { top: [], middle: [], bottom: [] },
    // Placements made this turn, so they can be undone before the turn ends.
    placements: [],
    discards: [],
    finished: false,
  };
}

function isPlaced(handIndex) {
  return state.placements.some((placement) => placement.handIndex === handIndex);
}

function placeCard(handIndex, rowKey) {
  const row = state.rows[rowKey];
  if (state.finished || isPlaced(handIndex) || row.length >= ROW_SIZE) return;

  // The card stays in hand and is greyed out, so the layout does not shift.
  row.push(state.hand[handIndex]);
  state.placements.push({ handIndex: handIndex, rowKey: rowKey });

  if (state.placements.length === PLACE_PER_TURN) endTurn();
  render();
}

function endTurn() {
  // Cards still unplaced at the end of the turn are discarded.
  state.discards.push(...state.hand.filter((_, index) => !isPlaced(index)));
  state.turn += 1;

  if (state.turn >= TURNS) {
    // Keep the final hand and its placements on screen, greyed out, rather
    // than clearing them and collapsing the table.
    state.finished = true;
  } else {
    state.placements = [];
    const start = state.turn * DEAL_SIZE;
    state.hand = state.deck.slice(start, start + DEAL_SIZE);
  }
}

function undo() {
  if (state.finished) return;
  const last = state.placements.pop();
  if (!last) return;
  state.rows[last.rowKey].pop();
  render();
}

// --- multipliers ----------------------------------------------------------

// The rows are meant to run weakest at the top to strongest at the bottom. A
// row that beats the one below it still scores, it just pays its demoted
// multiplier rather than costing you the whole board.
//
// Rows show their full multiplier from the start and only drop once they can
// be seen to beat the row below, which needs both rows full. Nothing is ever
// held back as unknown, so the column reads as what you are playing for.
function rowMultipliers() {
  const settled = new Map();

  ROWS.forEach((rowInfo, index) => {
    const full = { value: rowInfo.multiplier, demoted: false };
    const below = ROWS[index + 1];
    // Nothing beneath the bottom row to compare it against.
    if (!below) return settled.set(rowInfo.key, full);

    const cards = state.rows[rowInfo.key];
    const cardsBelow = state.rows[below.key];
    if (cards.length < ROW_SIZE || cardsBelow.length < ROW_SIZE) {
      return settled.set(rowInfo.key, full);
    }

    // Hands are compared in full, so a pair of aces beats a pair of twos.
    const beatsBelow =
      compareHands(rankHand(cards).rank, rankHand(cardsBelow).rank) > 0;
    settled.set(
      rowInfo.key,
      beatsBelow ? { value: rowInfo.demoted, demoted: true } : full
    );
  });

  return settled;
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

function cardsElement(cards, slots) {
  const elements = cards.map(cardElement);
  // Show the remaining empty slots so the row length is obvious. They are
  // built like cards so an empty row is exactly as wide as a full one.
  for (let i = cards.length; i < slots; i++) {
    elements.push(pipElement("·", "·", "slot"));
  }

  const fragment = document.createDocumentFragment();
  elements.forEach((element, index) => {
    if (index > 0) fragment.append(" ");
    fragment.append(element);
  });
  return fragment;
}

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

function widestOf(strings) {
  return Math.max(...strings.map((string) => [...string].length));
}

// Every multiplier a row can end up paying, full or demoted.
const MULTIPLIERS = [
  ...new Set(ROWS.flatMap((rowInfo) => [rowInfo.multiplier, rowInfo.demoted])),
];

// The result columns are padded to the widest text they could ever hold, so
// they do not resize when a row is completed or a multiplier drops. Derived
// from the scoring table so retuning HAND_SCORES keeps this correct.
const COLUMN_WIDTHS = {
  Hand: widestOf(HAND_TYPES),
  Points: widestOf(HAND_TYPES.map((handType) => String(HAND_SCORES[handType]))),
  Multiplier: widestOf(MULTIPLIERS.map((multiplier) => `${multiplier}×`)),
  Score: widestOf(
    HAND_TYPES.flatMap((handType) =>
      MULTIPLIERS.map((multiplier) => String(HAND_SCORES[handType] * multiplier))
    )
  ),
};

function renderBoard() {
  const table = document.getElementById("board");
  table.replaceChildren();

  const header = table.insertRow();
  const columns = ["Row", "Cards", "Hand", "Points", "Multiplier", "Score"];
  for (const text of columns) {
    const cell = document.createElement("th");
    cell.textContent = text;
    if (COLUMN_WIDTHS[text]) cell.style.width = `${COLUMN_WIDTHS[text]}ch`;
    header.append(cell);
  }

  const multipliers = rowMultipliers();
  let total = 0;

  for (const rowInfo of ROWS) {
    const cards = state.rows[rowInfo.key];
    const multiplier = multipliers.get(rowInfo.key);
    const complete = cards.length === ROW_SIZE;
    const handType = complete ? evaluateHand(cards) : null;

    const row = table.insertRow();
    row.insertCell().textContent = rowInfo.label;
    row.insertCell().append(cardsElement(cards, ROW_SIZE));
    row.insertCell().textContent = complete ? handType : "—";
    row.insertCell().textContent = complete ? HAND_SCORES[handType] : "—";

    const multiplierCell = row.insertCell();
    multiplierCell.textContent = `${multiplier.value}×`;
    if (multiplier.demoted) {
      multiplierCell.className = "demoted";
      multiplierCell.title =
        `${rowInfo.label} beats the row below it, so it pays ` +
        `${multiplier.value}× instead of ${rowInfo.multiplier}×`;
    }

    if (complete) {
      const score = HAND_SCORES[handType] * multiplier.value;
      total += score;
      row.insertCell().textContent = score;
    } else {
      row.insertCell().textContent = "—";
    }
  }

  const totalRow = table.insertRow();
  const totalLabel = document.createElement("th");
  totalLabel.colSpan = columns.length - 1;
  totalLabel.textContent = "Total";
  const totalValue = document.createElement("th");
  totalValue.textContent = total;
  totalRow.append(totalLabel, totalValue);
}

function renderHand() {
  const container = document.getElementById("hand");
  container.replaceChildren();

  const remaining = PLACE_PER_TURN - state.placements.length;
  const note = document.createElement("p");
  note.textContent = state.finished
    ? "All fifteen cards placed, the puzzle is complete."
    : `Place ${remaining} more card${remaining === 1 ? "" : "s"}, the rest are discarded.`;
  if (state.finished) note.className = "placed";
  container.append(note);

  // A table so the buttons line up, since "10♥" is wider than "J♥".
  const table = document.createElement("table");
  table.id = "handTable";

  state.hand.forEach((card, index) => {
    const placement = state.placements.find((p) => p.handIndex === index);
    const line = table.insertRow();
    // Placed cards stay put and grey out rather than vanishing. Once the
    // puzzle is over the whole table greys out for the same reason.
    if (placement || state.finished) line.className = "placed";
    line.insertCell().append(cardElement(card));

    for (const rowInfo of ROWS) {
      const button = document.createElement("button");
      button.textContent = rowInfo.label;
      if (placement || state.finished) {
        button.disabled = true;
        if (placement && placement.rowKey === rowInfo.key) {
          button.className = "chosen";
        }
      } else {
        button.disabled = state.rows[rowInfo.key].length >= ROW_SIZE;
        button.addEventListener("click", () => placeCard(index, rowInfo.key));
      }
      line.insertCell().append(button);
    }
  });

  container.append(table);
}

function render() {
  document.getElementById("puzzle").textContent = `Puzzle: ${state.label}`;
  // Greyed out while today's puzzle is the one on screen. That is what says
  // you are on it, now the heading no longer singles it out, and it stops a
  // stray click wiping a board you are part way through.
  document.getElementById("today").disabled = state.label === todaysSeed();

  // Holds at the last turn when finished, so the line never changes length.
  const status = document.getElementById("status");
  const turn = Math.min(state.turn + 1, TURNS);
  status.textContent = `Turn ${turn} of ${TURNS}.`;

  renderBoard();
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
