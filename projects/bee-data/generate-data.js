const fs = require("fs");
// Run from wherever; paths are relative to this script, not the shell.
process.chdir(__dirname);

// Shared by Bee Definition and Bee Switch, which both load these with a
// script tag.
//
// The datasets are small enough to just hand the browser whole, but fetch does
// not work from a file:// URL, so each one is wrapped in a line of JavaScript
// that a plain script tag can load. The text is passed through untouched, so
// these stay byte for byte the JSON you can read in the source files. Nothing
// is trimmed or reshaped: the game picks what it needs at runtime, so choices
// about which definition makes a good clue stay visible in index.js.
const FILES = [
  { name: "PUZZLE_DATA", source: "puzzle-data.json", output: "puzzle-data.js" },
  { name: "WORD_DEFINITIONS", source: "word-definitions.json", output: "word-definitions.js" },
];

for (const file of FILES) {
  const text = fs.readFileSync(file.source, "utf8").trim();
  const body =
    `// Generated from ${file.source}. Regenerate with: node generate-data.js\n` +
    "// The source JSON verbatim, wrapped so a plain script tag can load it.\n" +
    `const ${file.name} = ${text};\n`;
  fs.writeFileSync(file.output, body);

  // Round trip: what the browser parses must equal the source exactly.
  const sandbox = {};
  new (require("vm").Script)(body + `\n;this.D=${file.name};`).runInNewContext(sandbox);
  if (JSON.stringify(sandbox.D) !== JSON.stringify(JSON.parse(text))) {
    throw new Error(`${file.output} does not round trip`);
  }
  console.log(
    `${file.output.padEnd(22)} ${(fs.statSync(file.output).size / 1e6).toFixed(2)} MB, ` +
      `${Object.keys(sandbox.D).length} keys, round trip ok`
  );
}

const puzzles = JSON.parse(fs.readFileSync("puzzle-data.json", "utf8"));
const dates = Object.keys(puzzles).sort();
console.log(`\n${dates.length} puzzles, ${dates[0]} to ${dates[dates.length - 1]}`);
