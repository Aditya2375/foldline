# foldline

A synthetic implied-volatility grid and quote-inversion lab. A Java 21 core prices 35 invented European calls with Black-Scholes, then recovers each quote's annualized volatility by bisection. The dependency-free browser mirror adds a selectable heatmap, expiry slice, separate editable quote probe, discrete price checks and full ledger.

**No market quotes or calibration.** A successful round trip checks the inverse, not predictive skill. The chosen shapes can violate price constraints. Passing the finite-grid checks is not a proof of an arbitrage-free continuous surface. No interpolation, extrapolation, American options, trading, accounts, uploads, storage or external runtime requests.

## Run locally

```sh
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`. No package install needed. After download, the app works offline. Background links leave the app only when clicked.

## Java first

Java 21+:

```sh
javac -d build/classes src/foldline/*.java tools/*.java tests/foldline/*.java
java -cp build/classes foldline.Main
# Optional decimal parameters: base sigma, skew, curvature, term
java -cp build/classes foldline.Main 0.24 -0.18 0.12 0.04
java -cp build/classes foldline.TestRunner
```

## Model and inverse

- Spot 100; continuously compounded rate and dividend yield both 0. Prices are per underlying unit, without currency.
- Strikes 85..115 in steps of 5. Expiries 0.25, 0.5, 1, 1.5 and 2 years. Volatility is annualized, in inverse-square-root-year units.
- `x = (K - 100) / 15`; invented `sigma = base * exp(skew*x + curve*x*x + term*(T - 1))`.
- Base 18..40%, skew -0.3..0.3, curvature -0.25..0.25, term -0.5..0.5. Base is the K100, T1 volatility, not the ATM value for every expiry.
- Compute the out-of-money option first, then use put-call parity for in-the-money calls. An original 64-point Gauss-Legendre normal-tail integral supplies the CDF, truncated at 12 standard deviations.
- Invert each full-precision call price on sigma 0..3 (0..300%), stopping at bracket width at most `1e-10` and requiring absolute price residual at most `1e-8`. Generated cells take 35 bisection updates. Sigma error and price error have different units.
- The quote probe does **not** alter the grid. Each cell change or grid build restores the generated quote. Grid and probe have separate applied/dirty/error states.

Theoretical call-price interval is `[max(100-K,0),100]`. An exact lower-bound quote maps to the zero-volatility limit; the upper bound requires infinite volatility. Quotes outside the interval have no nonnegative Black-Scholes solution. An interior quote above the price at sigma3 has a finite solution outside this solver's cap. It is not a theoretical bounds violation. Within `1e-8` price units above the floor the tool returns a precision-limit status and no sigma, rather than a misleading near-intrinsic numerical inverse. Non-finite input is rejected. No numeric sentinel is shown as a valid sigma.

Vega is `dC/dsigma`, per 1.00 sigma, not per 1 percentage point. `1/vega` is only a local inverse sensitivity. Rounding or noisy quotes near intrinsic can make volatility poorly identified, even with a tight numerical bracket. At zero-limit the vega and inverse sensitivity are deliberately N/A; no right-limit derivative claim is made.

Discrete diagnostics check adjacent call-price slopes in [-1,0], equal-strike-spacing butterfly prices at least 0, and nondecreasing call prices across expiries. Calendar comparison at fixed strike is valid **here because rate and yield are both zero**; it does not generalize unchanged to arbitrary carry. Tolerance is `1e-9` in slope units for verticals and price units for butterfly/calendar differences. Only these grid points and adjacent differences are tested. See [NUMERICS.md](NUMERICS.md).

## Tests

Node22+, Java21+, Python3 standard library. Chrome smoke needs `google-chrome` on PATH. No application dependencies.

```sh
node tests/parity.mjs
node tests/domain.mjs
python3 tests/reference.py
node tools/build-web.mjs
node tests/browser-smoke.mjs
```

Full-state Java/JS parity includes every quote, recovered sigma, bracket, residual, vega and all discrete counts. Independent Python uses the standard library's `erfc`, a direct call formula and a separate 60-step inverse. Analytic tests cover an ATM known price, zero-volatility limits, flat surfaces, bound/cap statuses, vega finite differences and deliberately failing discrete constraints. Chrome checks all grid values and ledger fields, selected chart coordinates and markers, probe statuses, dirty/invalid retention, resizing and scroll containment. Small last-digit residual differences between JS engines are compared with a price-unit tolerance, not exact string equality. CI rebuilds `docs/` and checks drift, full-history secrets and local static rules.

## Reading

- [Macroption: Black-Scholes formulas](https://www.macroption.com/black-scholes-formula/) for pricing and vega units.
- [SciPy: bisection](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.bisect.html) for bracket requirements and tolerance semantics. No SciPy code or runtime is used.
- [Gatheral and Jacquier: Arbitrage-free SVI volatility surfaces](https://arxiv.org/html/1204.0646) for continuous-surface constraints. This app does not implement SVI or claim those guarantees.

Original implementation and interface. No third-party paper, code, data, fonts or assets bundled. Educational model, not investment advice.

## License

Copyright (c) 2026 Aditya Kulkarni. Choose **MIT OR Apache-2.0**. See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE).
