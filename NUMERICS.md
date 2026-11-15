# Numerical contract

## Domain and units

S100, r=q0, European calls, positive time in years. Price/inverse helpers support K85..115 and T0.25..2 (continuous within those ranges); sigma0..3. The grid samples seven fixed strikes and five fixed expiries. Arbitrary probe quotes are finite numbers, then classified by theoretical bounds and the finite solver cap. Zero-time, negative sigma and non-finite arguments are rejected.

Grid parameters: a0.18..0.4, s±0.3, c±0.25, d±0.5. Define x=(K-100)/15 and sigma=a*exp(s*x+c*x²+d*(T-1)). With |x|≤1 and |T-1|≤1, sigma stays between `0.18*exp(-1.05)` and `0.4*exp(1.05)`, strictly positive and below3. The bound is conservative. No stochastic simulation, fitted estimate, market forecast, volatility dynamics or probability claim about this surface is supplied. Annualized sigma is per square root of year; total variance would be sigma²\*T. The heatmap and slice show sigma, **not** total variance.

## Price and derivative

`v=sigma*sqrt(T)`, `d1=log(100/K)/v+v/2`, `d2=d1-v`.

`C=100*Phi(d1)-K*Phi(d2)`. For K<100, compute the OTM put `P=K*Phi(-d2)-100*Phi(-d1)` and return P+100-K. Clamp only a negative floating-point OTM price to0; this is not a clamp of quotes or invalid prices. At sigma0 return intrinsic. Normal tails use an original64point Gauss-Legendre integration of density over |z|..12. Values beyond12 clamp to limiting0/1; omitted tail at12 is under2e-33. Floating-point rounding, not the omitted normal mass, dominates tested errors. Independent Python erfc tests check the actual supported pricing domain, rather than assuming quadrature accuracy from order alone.

`vega=100*phi(d1)*sqrt(T)` per1.00sigma. Dividing by100 gives price per volatility percentage point. Quote-probe sensitivity is1/vega in sigma per price unit, a first-order local derivative only. At zero sigma the helper uses0 as an internal convention; the zero-limit solve returns no vega (N/A), not this convention as an ATM derivative.

## Inversion contract

For finite quote Q, L=max(100-K,0), U100:

1. Q<L or Q>U: outside-bounds, no sigma.
2. Q=L: zero-limit, sigma0, repricedL, residual0, no updates, no vega.
3. Q=U: infinite-limit, no finite sigma.
4. L<Q<U but Q>C(3): above-cap, theoretical finite root exceeds solver cap. No sigma returned.
5. If above L by at most1e-8priceunits, precision-limit: positive mathematical root exists but no numerical sigma is reported. This guard prevents near-intrinsic prices from being treated as accurate IV observations.
6. Otherwise bracket[0,3]. Repeatedly evaluate midpoint; if C(mid)<Q replace lower, else upper. Update until width≤1e-10, at most80steps. Return midpoint and signed residual C(mid)-Q. Converged requires width≤1e-10 **and** |residual|≤1e-8. Generated quotes require converged status or fail the run. Ordinary grid solves take35updates, not35totalpricecalls. Endpoints/bracket checks and final repricing are extra pricing evaluations.

Status branches intentionally distinguish a numerical cap from the theoretical existence of a root. A lower-bound rounded quote can conceal positive volatility, and tiny price errors can move IV substantially when vega is small. No tick-size or quote-accuracy model is assumed. Numerical accuracy is not estimation certainty. Probe input preserves fullprecision on reset; displayed rounded quote can differ from the fullprecision value actually solved.

## Finite-grid diagnostics

Grid is tenor-major. For each of5rows and6adjacent strike pairs, slope=(Cnext-Cprev)/5 must lie in[-1,0], with1e-9 tolerance (30tests). For each of5rows and5triples, Cnext-2Cmid+Cprev≥-1e-9 (25tests). For4adjacent expiry pairs and7strikes, Clater-Cearlier≥-1e-9 (28tests). Counts are violations, not scores. Calendar fixedK comparison is valid only in this zero-rate/zero-yield setup; forward and normalized price do not drift here. At arbitrary rates/dividends compare suitably normalized forward-moneyness quantities instead. This app does not implement that general case.

Grid-local passing counts do not inspect all strikes/tenors, wings, derivatives between points or an interpolant. Synthetic shape not guaranteed arbitrage-free. No local volatility, SVI fitting, repair, trade suggestions or claim that a displayed violation is executable in a market.

## Independent evidence

Java core tests randomly cover700parameter configurations plus all parameter corners; finite-difference vega, knownATMprice `C(100,1,0.2)=7.965567455405804`, symmetry/normalCDF, flat-surface counts, deliberate butterfly/calendar failures, inverse bound/cap cases and invalid domains. JS domain tests independently exercise corners, diagnostics and probe perturbations. Java/JS dump comparison checks every result field. Python uses erfc (not the JS/Java quadrature), direct call (not parity pricing), separate60stepinverse and independently recomputed difference counts. This can catch shared translated pricing errors.

Browser comparisons tolerate1e-12priceunits on scientific-notation ledger residuals because JS math implementations can differ in last bits. Display prices at8decimalplaces and sigma6percentage-pointdecimals are rounding, not solve tolerances. Chart samples are recovered grid sigmas at the selected tenor; coordinates use that slice's padded dynamic scale. Connected points are presentation only. Heatmap fixed5..115% color scale clamps colors only, never numerical values. Full ledger scrolls within a bounded region; no data are silently dropped on mobile.
