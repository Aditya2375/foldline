// Original 64-point Gauss-Legendre integration of the standard-normal density.
const N = 64,
  X = [],
  W = [];
for (let i = 0; i < N / 2; i++) {
  let z = Math.cos((Math.PI * (i + 0.75)) / (N + 0.5)),
    der = 0;
  for (let k = 0; k < 30; k++) {
    let a = 1,
      b = z;
    for (let j = 2; j <= N; j++) {
      const t = ((2 * j - 1) * z * b - (j - 1) * a) / j;
      a = b;
      b = t;
    }
    der = (N * (z * b - a)) / (z * z - 1);
    const step = b / der;
    z -= step;
    if (Math.abs(step) < 2e-16) break;
  }
  let a = 1,
    b = z;
  for (let j = 2; j <= N; j++) {
    const t = ((2 * j - 1) * z * b - (j - 1) * a) / j;
    a = b;
    b = t;
  }
  der = (N * (z * b - a)) / (z * z - 1);
  X[i] = -z;
  X[N - 1 - i] = z;
  W[i] = W[N - 1 - i] = 2 / ((1 - z * z) * der * der);
}
export const density = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
export function cdf(x) {
  if (!Number.isFinite(x)) throw Error("Finite normal argument required.");
  if (x === 0) return 0.5;
  const a = Math.abs(x);
  if (a >= 12) return x < 0 ? 0 : 1;
  const mid = (a + 12) / 2,
    half = (12 - a) / 2;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += W[i] * density(mid + half * X[i]);
  const tail = half * sum;
  return x < 0 ? tail : 1 - tail;
}
export const STRIKES = Object.freeze([85, 90, 95, 100, 105, 110, 115]);
export const TIMES = Object.freeze([0.25, 0.5, 1, 1.5, 2]);
export const DEFAULT = Object.freeze({
  atm: 0.24,
  skew: -0.18,
  curve: 0.12,
  term: 0.04,
});
export function validArgs(k, t) {
  if (
    !Number.isFinite(k) ||
    k < 85 ||
    k > 115 ||
    !Number.isFinite(t) ||
    t < 0.25 ||
    t > 2
  )
    throw Error("Strike85..115 and time0.25..2 required.");
}
export function price(k, t, sigma) {
  validArgs(k, t);
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 3)
    throw Error("Volatility0..3 required.");
  if (sigma === 0) return Math.max(100 - k, 0);
  const v = sigma * Math.sqrt(t),
    d1 = Math.log(100 / k) / v + v / 2,
    d2 = d1 - v;
  return k < 100
    ? Math.max(0, k * cdf(-d2) - 100 * cdf(-d1)) + 100 - k
    : Math.max(0, 100 * cdf(d1) - k * cdf(d2));
}
export function vega(k, t, sigma) {
  validArgs(k, t);
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 3)
    throw Error("Volatility0..3 required.");
  if (sigma === 0) return 0;
  const v = sigma * Math.sqrt(t);
  return 100 * density(Math.log(100 / k) / v + v / 2) * Math.sqrt(t);
}
const absent = (status) => ({
  status,
  iv: null,
  repriced: null,
  residual: null,
  lo: 0,
  hi: 3,
  steps: 0,
  vega: null,
});
export function solve(k, t, quote) {
  validArgs(k, t);
  if (!Number.isFinite(quote)) throw Error("Finite quote required.");
  const lower = Math.max(100 - k, 0);
  if (quote < lower || quote > 100) return absent("outside-bounds");
  if (quote === lower)
    return {
      status: "zero-limit",
      iv: 0,
      repriced: lower,
      residual: 0,
      lo: 0,
      hi: 0,
      steps: 0,
      vega: null,
    };
  if (quote === 100) return absent("infinite-limit");
  if (quote > price(k, t, 3)) return absent("above-cap");
  if (quote - lower <= 1e-8) return absent("precision-limit");
  let lo = 0,
    hi = 3,
    steps = 0;
  while (hi - lo > 1e-10 && steps < 80) {
    const mid = (lo + hi) / 2;
    if (price(k, t, mid) < quote) lo = mid;
    else hi = mid;
    steps++;
  }
  const iv = (lo + hi) / 2,
    repriced = price(k, t, iv),
    residual = repriced - quote;
  return {
    status:
      Math.abs(residual) <= 1e-8 && hi - lo <= 1e-10
        ? "converged"
        : "not-converged",
    iv,
    repriced,
    residual,
    lo,
    hi,
    steps,
    vega: vega(k, t, iv),
  };
}
export function validate(p) {
  if (
    !p ||
    !Number.isFinite(p.atm) ||
    p.atm < 0.18 ||
    p.atm > 0.4 ||
    !Number.isFinite(p.skew) ||
    Math.abs(p.skew) > 0.3 ||
    !Number.isFinite(p.curve) ||
    Math.abs(p.curve) > 0.25 ||
    !Number.isFinite(p.term) ||
    Math.abs(p.term) > 0.5
  )
    throw Error("ATM18..40%; skew±0.3; curve±0.25; term±0.5 required.");
}
export function diagnostics(c) {
  if (
    !Array.isArray(c) ||
    c.length !== 35 ||
    c.some((q) => !Number.isFinite(q))
  )
    throw Error("35 finite quotes required.");
  let vertical = 0,
    butterfly = 0,
    calendar = 0;
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 7; i++) {
      const a = j * 7 + i;
      if (i > 0) {
        const slope = (c[a] - c[a - 1]) / 5;
        if (slope > 1e-9 || slope < -1 - 1e-9) vertical++;
      }
      if (i > 1 && c[a] - 2 * c[a - 1] + c[a - 2] < -1e-9) butterfly++;
      if (j > 0 && c[a] < c[a - 7] - 1e-9) calendar++;
    }
  return { vertical, butterfly, calendar };
}
export function run(p) {
  validate(p);
  const cells = [];
  let maxResidual = 0,
    maxIvError = 0;
  for (const time of TIMES)
    for (const strike of STRIKES) {
      const x = (strike - 100) / 15,
        truth =
          p.atm * Math.exp(p.skew * x + p.curve * x * x + p.term * (time - 1)),
        quote = price(strike, time, truth),
        s = solve(strike, time, quote);
      if (s.status !== "converged")
        throw Error("Generated quote did not converge.");
      cells.push({ strike, time, truth, quote, solve: s });
      maxResidual = Math.max(maxResidual, Math.abs(s.residual));
      maxIvError = Math.max(maxIvError, Math.abs(s.iv - truth));
    }
  return {
    cells,
    ...diagnostics(cells.map((c) => c.quote)),
    maxResidual,
    maxIvError,
  };
}
