// Every promise the generator makes, checked on every daily seed for the next
// ninety days at all three sizes. Run with: node verify.js
const T = require("./tetronimo.js");

const DAYS = 90;
const BUDGET = { Small: 200, Medium: 600, Large: 1500 }; // ms per board

const seeds = [];
const day = new Date(2026, 8, 1);
for (let i = 0; i < DAYS; i++) {
  seeds.push(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`);
  day.setDate(day.getDate() + 1);
}

const errors = [];
const check = (ok, m) => { if (!ok && errors.length < 20) errors.push(m); };
const stats = {};

for (let size = 0; size < T.SIZES.length; size++) {
  const name = T.SIZES[size].name;
  stats[name] = { ms: [], marks: [], dots: [], grades: {} };

  for (const seed of seeds) {
    const started = Date.now();
    const p = T.makePuzzle(seed, size);
    const ms = Date.now() - started;
    const where = `${seed}/${name}`;

    const region = new Set(p.region);
    const dots = new Set(p.dots);
    const labels = new Map(p.labels);

    // 1. A logic solver finishes it, with no guessing, at the shipped tier.
    const out = T.solve(region, p.names, p.marks, dots, p.side, T.TIERS.medium);
    check(out.solved, `${where}: the solver cannot finish it`);
    // And what it works out is the intended answer.
    if (out.letters) {
      for (const [id, letter] of out.letters) {
        check(labels.get(id) === letter, `${where}: solver disagrees with the answer at ${id}`);
      }
    }

    // 2. Independently: exactly one labelling exists at all.
    check(T.countLabellings(region, p.names, p.marks, dots, p.side, 3) === 1,
      `${where}: not a unique answer`);

    // 3. All three kinds of clue.
    check(dots.size >= 1, `${where}: no dot`);
    check(p.marks.some(([, k]) => k === "X"), `${where}: no X`);
    check(p.marks.some(([, k]) => k === "="), `${where}: no =`);

    // 4. Every mark sits on a real join, and agrees with the answer.
    for (const [[a, b], kind] of p.marks) {
      check(region.has(a) && region.has(b), `${where}: mark outside the region`);
      check(b === a + 1 || b === a + T.BIGGEST, `${where}: mark not on an edge`);
      const same = labels.get(a) === labels.get(b);
      check(kind === "=" ? same : !same, `${where}: ${kind} disagrees with the answer`);
    }
    for (const dot of dots) check(region.has(dot), `${where}: dot outside the region`);

    // 5. The board itself.
    check(p.region.length % 4 === 0, `${where}: region is not a multiple of four`);
    check(p.names.length === 2, `${where}: ${p.names.length} shapes`);
    for (const id of p.region) {
      check(Math.floor(id / T.BIGGEST) < p.side && id % T.BIGGEST < p.side,
        `${where}: cell outside the board`);
    }

    // 6. Time.
    check(ms <= BUDGET[name], `${where}: took ${ms}ms, budget ${BUDGET[name]}ms`);

    // Every board must need the rules it is built for, not just survive them.
    check(p.grade === "medium", `${where}: graded ${p.grade}, want medium`);
    check(!T.solve(region, p.names, p.marks, dots, p.side, T.TIERS.easy).solved,
      `${where}: the easy rules alone finish it`);

    stats[name].ms.push(ms);
    stats[name].marks.push(p.marks.length);
    stats[name].dots.push(p.dots.length);
    stats[name].grades[p.grade] = (stats[name].grades[p.grade] || 0) + 1;
  }
}

const q = (a, f) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * f)];
console.log(`${DAYS} daily seeds x ${T.SIZES.length} sizes = ${DAYS * T.SIZES.length} boards\n`);
console.log("size    time ms med/p90/max   marks  dots  grades");
for (const [name, s] of Object.entries(stats)) {
  console.log(
    `${name.padEnd(7)} ${String(q(s.ms, .5)).padStart(4)}/${String(q(s.ms, .9)).padStart(4)}/${String(q(s.ms, 1)).padStart(5)}` +
    `   ${String(q(s.marks, .5)).padStart(4)}  ${String(q(s.dots, .5)).padStart(4)}  ${JSON.stringify(s.grades)}`
  );
}
console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.join("\n") : "\nNO ERRORS");
