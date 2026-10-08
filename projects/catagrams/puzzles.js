// The puzzles, written by hand. Loaded by a script tag rather than fetched, so
// the page works from a file:// URL as well as over the web.
//
// Each puzzle has:
//
//   index     what the dropdown shows, and what ?puzzle= in the URL picks
//   category  what every answer, and the solution, has in common; hidden on
//             the page until the solution is in
//   clues     the phrases, each with:
//               phrase         what the solver is shown
//               answer         the word hidden in it
//               spare_letters  what is left of the phrase once the answer is
//                              taken out, in the order it is shown
//   solution  what the spare letters spell
//
// Spaces do not count, everything else does. The page checks every clue's
// spare_letters against what taking the answer out of the phrase really
// leaves, and that all the spare letters together make the solution, and says
// so in the browser console and on the page if anything does not add up.
//
// Puzzles appear in the dropdown in the order they are listed here, and the
// page opens on the last one, so add new puzzles at the bottom.

const PUZZLES = [
  {
    index: "001",
    category: "Countries #1",
    clues: [
      { phrase: "OPEN LAD", answer: "POLAND" , spare_letters: "E" },
      { phrase: "GRAIN", answer: "IRAN" , spare_letters: "G" },
      { phrase: "SPICE AN", answer: "SPAIN" , spare_letters: "CE" },
      { phrase: "ROMAN", answer: "OMAN" , spare_letters: "R" },
      { phrase: "YEAR NOW", answer: "NORWAY" , spare_letters: "E" },
    ],
    solution: "GREECE",
  },
  {
    index: "002",
    category: "Fruits #1",
    clues: [
      { phrase: "EMAIL", answer: "LIME", spare_letters: "A" },
      { phrase: "PLENUM", answer: "PLUM", spare_letters: "EN" },
      { phrase: "OPERA", answer: "PEAR", spare_letters: "O" },
      { phrase: "GATED", answer: "DATE", spare_letters: "G" },
      { phrase: "PREACH", answer: "PEACH", spare_letters: "R" },
    ],
    solution: "ORANGE",
  },
  {
    index: "003",
    category: "Birds #1",
    clues: [
      { phrase: "DROVE", answer: "DOVE", spare_letters: "R" },
      { phrase: "WHEN", answer: "HEN", spare_letters: "W" },
      { phrase: "COWER", answer: "CROW", spare_letters: "E" },
      { phrase: "MENU", answer: "EMU", spare_letters: "N" },
    ],
    solution: "WREN",
  },
];

if (typeof module !== "undefined") {
  module.exports = { PUZZLES };
}
