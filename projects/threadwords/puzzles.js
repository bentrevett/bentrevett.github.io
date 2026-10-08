// The puzzles, written by hand. Loaded by a script tag rather than fetched, so
// the page works from a file:// URL as well as over the web.
//
// Each puzzle has:
//
//   index       what ?puzzle= in the URL picks, and the first thing the
//               dropdown shows
//   name        shown beside the index in the dropdown
//   layout      how the answers are laid out in the grid:
//                 "balanced"  spread to keep every column as full as
//                             possible; see below
//                 "left"      every answer starts in the leftmost column
//                 "right"     every answer finishes in the rightmost column
//   sort_clues  true: clues listed shortest answer first, alphabetical by
//               clue within a length; false: in the order written here
//   clues       each with:
//                 clue    what the solver is shown
//                 answer  the word it clues, letters only; answers can be
//                         any mix of lengths
//
// The page lays the answers out itself: the grid is as wide as the longest
// answer. Balanced, the answers go in longest first, each starting wherever
// it leaves the thinnest column as full as possible. Each column then keeps
// only its different letters, sorted, so neither the order of the answers nor
// how often a letter appears gives anything away.
//
// It checks every puzzle when it loads and says so in the browser console,
// and on the page, if anything is wrong: a repeated answer or clue, a missing
// or unknown layout, or a sort_clues that is not true or false. A column
// holding a single letter, which leaves nothing to choose, is only noted in
// the console: some themes make it unavoidable.
//
// Puzzles appear in the dropdown in the order they are listed here, and the
// page opens on the last one, so add new puzzles at the bottom.

const PUZZLES = [
  {
    index: "001",
    name: "Happy Holidays",
    layout: "balanced",
    sort_clues: true,
    clues: [
      { clue: "December the 25th", answer: "CHRISTMAS" },
      { clue: "Festive song", answer: "CAROL" },
      { clue: "Christmas, in a carol", answer: "NOEL" },
      { clue: "Workshop helpers", answer: "ELVES" },
      { clue: "He comes down the chimney", answer: "SANTA" },
      { clue: "Red-nosed reindeer", answer: "RUDOLPH" },
      { clue: "It makes Christmas white", answer: "SNOW" },
      { clue: "What waits under the tree", answer: "PRESENTS" },
    ],
  },
  {
    index: "002",
    name: "Happy Halloween",
    layout: "balanced",
    sort_clues: true,
    clues: [
      { clue: "Framework of bones", answer: "SKELETON" },
      { clue: "Witch's bubbling pot", answer: "CAULDRON" },
      { clue: "Orange vegetable for carving", answer: "PUMPKIN" },
      { clue: "Count Dracula, for one", answer: "VAMPIRE" },
      { clue: "Shuffling undead creature", answer: "ZOMBIE" },
      { clue: "Spider's dusty creation", answer: "COBWEB" },
      { clue: "Sheet-wearing spook", answer: "GHOST" },
      { clue: "She flies on a broomstick", answer: "WITCH" },
    ],
  },
  {
    index: "003",
    name: "Blast Off",
    layout: "balanced",
    sort_clues: true,
    clues: [
      { clue: "It brings distant stars closer", answer: "TELESCOPE" },
      { clue: "One who travels into space", answer: "ASTRONAUT" },
      { clue: "Space rock", answer: "ASTEROID" },
      { clue: "The cosmos", answer: "UNIVERSE" },
      { clue: "When the Moon blocks the Sun", answer: "ECLIPSE" },
      { clue: "Largest planet", answer: "JUPITER" },
      { clue: "The Milky Way, for one", answer: "GALAXY" },
      { clue: "Cloud of gas and dust where stars are born", answer: "NEBULA" },
    ],
  },
  {
    index: "004",
    name: "Hard at Work",
    layout: "balanced",
    sort_clues: true,
    clues: [
      { clue: "Designer of buildings", answer: "ARCHITECT" },
      { clue: "Lends you books", answer: "LIBRARIAN" },
      { clue: "Tends the flower beds", answer: "GARDENER" },
      { clue: "Works under the bonnet", answer: "MECHANIC" },
      { clue: "Called out for a burst pipe", answer: "PLUMBER" },
      { clue: "Checks your teeth", answer: "DENTIST" },
      { clue: "Works the land", answer: "FARMER" },
      { clue: "Makes suits to measure", answer: "TAILOR" },
    ],
  },
  {
    index: "005",
    name: "Busy Bs",
    layout: "left",
    sort_clues: true,
    clues: [
      { clue: "Colourful winged insect", answer: "BUTTERFLY" },
      { clue: "Common garden songbird", answer: "BLACKBIRD" },
      { clue: "Annual celebration with cake", answer: "BIRTHDAY" },
      { clue: "Wrist jewellery", answer: "BRACELET" },
      { clue: "Two-wheeler", answer: "BICYCLE" },
      { clue: "Treat to dunk in tea", answer: "BISCUIT" },
      { clue: "Curved yellow fruit", answer: "BANANA" },
      { clue: "It crosses a river", answer: "BRIDGE" },
    ],
  },
  {
    index: "006",
    name: "Keep Going",
    layout: "right",
    sort_clues: true,
    clues: [
      { clue: "Tending the flower beds", answer: "GARDENING" },
      { clue: "Making a tune through pursed lips", answer: "WHISTLING" },
      { clue: "Doing lengths of the pool", answer: "SWIMMING" },
      { clue: "Going up a rock face", answer: "CLIMBING" },
      { clue: "Moving to the music", answer: "DANCING" },
      { clue: "Turning the pages", answer: "READING" },
      { clue: "Making a cake", answer: "BAKING" },
      { clue: "Walking the hills", answer: "HIKING" },
    ],
  },
  {
    index: "007",
    name: "From the Sun",
    layout: "balanced",
    sort_clues: false,
    clues: [
      { clue: "Metal that's liquid at room temperature", answer: "MERCURY" },
      { clue: "Men are from Mars, Women are from _____, John Gray book", answer: "VENUS" },
      { clue: "_____, Wind & Fire, band", answer: "EARTH" },
      { clue: "Setting of Total Recall", answer: "MARS" },
      { clue: "_______ Ascending, 2015 Wachowski film", answer: "JUPITER" },
      { clue: "Sega home console", answer: "SATURN" },
      { clue: "Uranium namesake", answer: "URANUS" },
      { clue: "God of the sea", answer: "NEPTUNE" },
      { clue: "Mickey Mouse's pet dog", answer: "PLUTO" },
    ],
  },
  {
    index: "008",
    name: "Animal Alphabet",
    layout: "left",
    sort_clues: false,
    clues: [
      { clue: "Tiny worker in a colony", answer: "ANT" },
      { clue: "Hibernating giant of the woods", answer: "BEAR" },
      { clue: "Desert ship with a hump", answer: "CAMEL" },
      { clue: "Clever sea mammal that clicks", answer: "DOLPHIN" },
      { clue: "Large bird of prey", answer: "EAGLE" },
      { clue: "Pond hopper", answer: "FROG" },
      { clue: "Long-necked grazer", answer: "GIRAFFE" },
      { clue: "Pet that runs on a wheel", answer: "HAMSTER" },
    ],
  },
  {
    index: "009",
    name: "What's Cooking?",
    layout: "balanced",
    sort_clues: true,
    clues: [
      { clue: "Pan with a long handle and a lid", answer: "SAUCEPAN" },
      { clue: "Bowl for draining pasta", answer: "COLANDER" },
      { clue: "It pops when the bread is done", answer: "TOASTER" },
      { clue: "Flipper for pancakes", answer: "SPATULA" },
      { clue: "Boils water for tea", answer: "KETTLE" },
      { clue: "Keeps the milk cold", answer: "FRIDGE" },
      { clue: "Beater for eggs", answer: "WHISK" },
      { clue: "Spoon for serving soup", answer: "LADLE" },
    ],
  },
  {
    index: "010",
    name: "Chain Reaction",
    layout: "balanced",
    sort_clues: false,
    clues: [
      { clue: "Snappy swamp reptile", answer: "ALLIGATOR" },
      { clue: "Arc of colours after a shower", answer: "RAINBOW" },
      { clue: "Tusked Arctic mammal", answer: "WALRUS" },
      { clue: "Carrot-nosed winter figure", answer: "SNOWMAN" },
      { clue: "Pad for jotting things down", answer: "NOTEBOOK" },
      { clue: "Hopping Australian with a pouch", answer: "KANGAROO" },
      { clue: "Players led by a conductor", answer: "ORCHESTRA" },
      { clue: "It keeps a ship in place", answer: "ANCHOR" },
      { clue: "World's largest country", answer: "RUSSIA" },
    ],
  },
];

if (typeof module !== "undefined") {
  module.exports = { PUZZLES };
}
