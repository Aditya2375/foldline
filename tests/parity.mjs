import { run } from "../web/src/model.js";
import { execFileSync } from "node:child_process";
let n = 0,
  max = 0;
const check = (a, b) => {
  n++;
  const e = Math.abs(a - b) / Math.max(1, Math.abs(b));
  max = Math.max(max, e);
  if (!Number.isFinite(a) || e > 2e-8) throw Error(`parity ${a} ${b}`);
};
const configs = [
  [0.24, -0.18, 0.12, 0.04],
  [0.2, 0, 0, 0],
  [0.4, 0, -0.25, 0],
  [0.2, 0, 0, -0.5],
];
for (const atm of [0.18, 0.29, 0.4])
  for (const skew of [-0.3, 0, 0.3])
    for (const curve of [-0.25, 0, 0.25])
      for (const term of [-0.5, 0, 0.5]) configs.push([atm, skew, curve, term]);
for (const a of configs) {
  const j = execFileSync(
    process.env.JAVA || "java",
    ["-cp", "build/classes", "Dump", ...a.map(String)],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((s) => s.split(",").map(Number));
  const s = run({ atm: a[0], skew: a[1], curve: a[2], term: a[3] });
  [s.vertical, s.butterfly, s.calendar, s.maxResidual, s.maxIvError].forEach(
    (v, i) => check(v, j[0][i]),
  );
  s.cells.forEach((c, i) => {
    const z = c.solve;
    [
      c.strike,
      c.time,
      c.truth,
      c.quote,
      z.iv,
      z.repriced,
      z.residual,
      z.lo,
      z.hi,
      z.steps,
      z.vega,
    ].forEach((v, k) => check(v, j[i + 1][k]));
    if (z.status !== "converged") throw Error("status");
  });
}
console.log(`${n} Java/JS full-state comparisons; max scaled error ${max}`);
