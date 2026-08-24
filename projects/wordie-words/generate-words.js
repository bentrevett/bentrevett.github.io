const fs = require("fs");
// Run from wherever; paths are relative to this script, not the shell.
process.chdir(__dirname);

const WORD_LENGTH = 5;

function read(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length === WORD_LENGTH);
}

// One file per list rather than one per game. Wordie Down wants only the
// answers, so bundling both would make it fetch five times what it needs,
// and the games that want both now share a cache entry instead of each
// carrying its own identical copy.
const LISTS = [
  { name: "ANSWER_WORDS", source: "answer-words.txt", output: "answer-words.js" },
  { name: "VALID_WORDS", source: "valid-words.txt", output: "valid-words.js" },
];

for (const list of LISTS) {
  const words = read(list.source);

  const bad = words.filter((word) => !/^[a-z]{5}$/.test(word));
  if (bad.length) throw new Error(`${list.source} has non a-z words: ${bad.slice(0, 5)}`);

  const repeats = words.length - new Set(words).size;
  if (repeats) throw new Error(`${list.source} repeats ${repeats} word(s)`);

  const header = [
    `// Generated from ${list.source}. Regenerate with: node generate-words.js`,
    "// Loaded with a plain script tag, so the pages work from a file:// URL",
    "// with no server and no fetch.",
    "",
    "// Every word is exactly five letters, so they are run together and cut",
    "// back apart rather than carrying a separator each.",
    "",
  ].join("\n");

  const body =
    `const ${list.name} = "${words.join("")}".match(/.{${WORD_LENGTH}}/g);\n`;

  fs.writeFileSync(list.output, header + body);

  // Round trip: what the browser will parse must match the source list.
  const sandbox = {};
  new (require("vm").Script)(
    fs.readFileSync(list.output, "utf8") + `\n;this.W=${list.name};`
  ).runInNewContext(sandbox);
  const same =
    sandbox.W.length === words.length && sandbox.W.every((w, i) => w === words[i]);
  if (!same) throw new Error(`${list.output} does not round trip`);

  console.log(
    `${list.output.padEnd(16)} ${String(words.length).padStart(6)} words |` +
      ` ${String(fs.statSync(list.output).size).padStart(6)} bytes | round trip ok`
  );
}
