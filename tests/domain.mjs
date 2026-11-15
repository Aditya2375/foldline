import assert from "node:assert/strict";
import {
  run,
  solve,
  price,
  vega,
  cdf,
  diagnostics,
  validate,
} from "../web/src/model.js";
let n = 0;
const ok = (b) => {
  n++;
  assert.ok(b);
};
const close = (a, b, t = 1e-8) =>
  ok(Number.isFinite(a) && Math.abs(a - b) <= t);
for (const a of [0.18, 0.4])
  for (const s of [-0.3, 0, 0.3])
    for (const c of [-0.25, 0, 0.25])
      for (const t of [-0.5, 0, 0.5]) {
        const r = run({ atm: a, skew: s, curve: c, term: t });
        for (const q of r.cells) {
          const z = q.solve;
          ok(z.status === "converged");
          close(z.iv, q.truth, 2e-8);
          ok(z.hi - z.lo <= 1e-10);
          ok(z.steps === 35);
          close(price(q.strike, q.time, z.iv), q.quote);
          close(z.residual, z.repriced - q.quote, 0);
          ok(z.vega > 0);
        }
        const qs = r.cells.map((c) => c.quote);
        const d = diagnostics(qs);
        ok(
          d.vertical === r.vertical &&
            d.butterfly === r.butterfly &&
            d.calendar === r.calendar,
        );
      }
close(price(100, 1, 0.2), 7.965567455405804, 1e-12);
for (let z = -10; z < 10; z += 0.01) close(cdf(z) + cdf(-z), 1, 2e-15);
for (const k of [85, 100, 115])
  for (const t of [0.25, 0.5, 1, 2]) {
    const l = Math.max(100 - k, 0),
      cap = price(k, t, 3);
    ok(solve(k, t, l + 1e-10).status === "precision-limit");
    ok(solve(k, t, l).status === "zero-limit");
    ok(solve(k, t, 100).status === "infinite-limit");
    ok(solve(k, t, l - 0.000001).status === "outside-bounds");
    ok(solve(k, t, 100.001).status === "outside-bounds");
    ok(solve(k, t, (cap + 100) / 2).status === "above-cap");
    close(solve(k, t, cap).iv, 3, 1e-10);
    const sigma = 0.24,
      qq = price(k, t, sigma),
      eps = 1e-5,
      s = solve(k, t, qq);
    close((solve(k, t, qq + eps).iv - s.iv) / eps, 1 / vega(k, t, sigma), 0.01);
    close(
      (price(k, t, sigma + eps) - price(k, t, sigma - eps)) / (2 * eps),
      vega(k, t, sigma),
      1e-5,
    );
  }
for (const v of [NaN, Infinity, -Infinity])
  for (const fn of [
    () => solve(100, 1, v),
    () => price(100, 1, v),
    () => vega(100, 1, v),
    () => validate({ atm: v, skew: 0, curve: 0, term: 0 }),
  ])
    assert.throws(fn);
for (const p of [
  null,
  {},
  { atm: 0.17, skew: 0, curve: 0, term: 0 },
  { atm: 0.2, skew: 0.31, curve: 0, term: 0 },
  { atm: 0.2, skew: 0, curve: 0.26, term: 0 },
  { atm: 0.2, skew: 0, curve: 0, term: 0.51 },
])
  assert.throws(() => run(p));
for (const c of [[], Array(35).fill(NaN), null])
  assert.throws(() => diagnostics(c));
const flat = run({ atm: 0.2, skew: 0, curve: 0, term: 0 });
ok(flat.vertical + flat.butterfly + flat.calendar === 0);
ok(run({ atm: 0.4, skew: 0, curve: -0.25, term: 0 }).butterfly > 0);
ok(run({ atm: 0.2, skew: 0, curve: 0, term: -0.5 }).calendar > 0);
const q = Array(35).fill(10);
q[1] = 20;
ok(diagnostics(q).vertical > 0 && diagnostics(q).butterfly > 0);
q[8] = 5;
ok(diagnostics(q).calendar > 0);
console.log(
  `${n} domain assertions plus invalid-input throws and diagnostic fixtures`,
);
