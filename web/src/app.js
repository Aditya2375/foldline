import { DEFAULT, STRIKES, TIMES, run, solve } from "./model.js";
const $ = (id) => document.getElementById(id),
  fmt = (v, n = 6) => (v === null ? "N/A" : v.toFixed(n)),
  sci = (v) => (v === null ? "N/A" : v.toExponential(3)),
  pct = (v, n = 4) => (v === null ? "N/A" : `${(100 * v).toFixed(n)}%`);
let applied = { ...DEFAULT },
  surface = run(applied),
  selected = 17,
  probePrice = null,
  probeSolve = null;
function el(tag, text) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}
function svgEl(tag, attrs, text) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
function draw() {
  const svg = $("smile"),
    width = Math.max(260, svg.getBoundingClientRect().width),
    height = 230,
    left = 46,
    right = 14,
    top = 20,
    bottom = 32;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const row = Math.floor(selected / 7),
    slice = surface.cells.slice(row * 7, row * 7 + 7),
    vs = slice.map((c) => 100 * c.solve.iv),
    min = Math.min(...vs),
    max = Math.max(...vs),
    pad = Math.max(1, (max - min) * 0.15),
    lo = Math.max(0, min - pad),
    hi = max + pad;
  const x = (k) => left + ((k - 85) / 30) * (width - left - right),
    y = (v) => top + ((hi - v) / (hi - lo)) * (height - top - bottom);
  for (let i = 0; i < 3; i++) {
    const v = lo + ((hi - lo) * i) / 2,
      yy = y(v);
    svg.append(
      svgEl("line", {
        x1: left,
        x2: width - right,
        y1: yy,
        y2: yy,
        class: "grid",
      }),
      svgEl(
        "text",
        { x: left - 7, y: yy + 4, "text-anchor": "end" },
        `${v.toFixed(1)}%`,
      ),
    );
  }
  const pts = slice
    .map((c) => `${x(c.strike)},${y(c.solve.iv * 100)}`)
    .join(" ");
  svg.append(svgEl("polyline", { points: pts, class: "line" }));
  for (const c of slice)
    svg.append(
      svgEl("circle", {
        cx: x(c.strike),
        cy: y(c.solve.iv * 100),
        r: 3,
        class: "dot",
      }),
    );
  const c = surface.cells[selected];
  svg.append(
    svgEl("circle", {
      cx: x(c.strike),
      cy: y(c.solve.iv * 100),
      r: 5,
      class: "chosen",
    }),
  );
  for (const k of [85, 100, 115])
    svg.append(
      svgEl(
        "text",
        { x: x(k), y: height - 8, "text-anchor": "middle" },
        String(k),
      ),
    );
  $("slice-label").textContent =
    `T = ${c.time} years · σ in % · strike on x-axis`;
}
function showProbe() {
  const c = surface.cells[selected],
    z = probeSolve;
  const messages = {
    converged:
      "Converged within the 0..300% solver bracket. This is a numerical inverse, not a volatility forecast.",
    "zero-limit":
      "At the lower price bound: σ = 0 is the mathematical limiting solution. Floating-point prices near intrinsic may not identify volatility reliably.",
    "infinite-limit":
      "At price 100: approached only as σ tends to infinity. There is no finite implied volatility.",
    "outside-bounds":
      "Outside theoretical call-price bounds. No nonnegative Black-Scholes implied volatility exists.",
    "above-cap":
      "Inside theoretical bounds, but above the price at σ = 300%. A finite implied volatility exists above this solver cap; it is not a bounds violation.",
    "precision-limit":
      "The price is above the lower bound by at most 1e-8 price units. A positive mathematical root exists, but this tool declines to report an unreliable numerical volatility near intrinsic.",
    "not-converged":
      "The numerical convergence checks failed. Do not treat the estimate as a solved volatility.",
  };
  $("probe-message").textContent = messages[z.status];
  $("probe-state").textContent =
    `Applied probe price ${probePrice.toPrecision(15)} · ${z.status}`;
  const entries = [
    ["Generated call price", fmt(c.quote, 8)],
    ["Invented grid σ", pct(c.truth, 6)],
    ["Applied probe price", fmt(probePrice, 8)],
    ["Recovered probe σ", pct(z.iv, 6)],
    ["Repriced call", fmt(z.repriced, 8)],
    ["Signed price residual", sci(z.residual)],
    ["Bisection updates", String(z.steps)],
    ["Final bracket width / σ", z.iv === null ? "N/A" : sci(z.hi - z.lo)],
    ["Theoretical price floor", fmt(Math.max(100 - c.strike, 0), 8)],
    ["Theoretical price ceiling", "100.00000000"],
    ["Vega / per 1.00 σ", fmt(z.vega, 8)],
    ["Local 1/vega / σ per price", z.vega > 0 ? sci(1 / z.vega) : "N/A"],
  ];
  $("audit").replaceChildren(
    ...entries.map(([label, value]) => {
      const d = el("div");
      d.append(el("span", label), el("strong", value));
      return d;
    }),
  );
}
function resetProbe() {
  const c = surface.cells[selected];
  probePrice = c.quote;
  probeSolve = solve(c.strike, c.time, probePrice);
  $("quote").value = probePrice.toPrecision(17);
  showProbe();
}
function choose(i) {
  selected = i;
  for (const [b, j] of Array.from(
    document.querySelectorAll(".matrix button"),
  ).map((b, j) => [b, j]))
    b.setAttribute("aria-pressed", String(j === selected));
  const c = surface.cells[i];
  $("selection").textContent = `Strike ${c.strike} · ${c.time} years`;
  resetProbe();
  draw();
}
function render() {
  $("state").textContent =
    `APPLIED / base ${(applied.atm * 100).toFixed(2)}% · skew ${applied.skew} · curve ${applied.curve} · term ${applied.term}`;
  $("recovered").textContent = "35 / 35";
  $("residual").textContent = sci(surface.maxResidual);
  $("recovery").textContent = (surface.maxIvError * 100).toExponential(2);
  for (const key of ["vertical", "butterfly", "calendar"])
    $(key).textContent = String(surface[key]);
  const tr = el("tr");
  const a = el("th", "T / K");
  a.scope = "col";
  tr.append(a);
  for (const k of STRIKES) {
    const th = el("th", String(k));
    th.scope = "col";
    tr.append(th);
  }
  $("matrix-head").replaceChildren(tr);
  $("matrix").replaceChildren(
    ...TIMES.map((t, j) => {
      const tr = el("tr"),
        th = el("th", `${t}y`);
      th.scope = "row";
      tr.append(th);
      for (let i = 0; i < 7; i++) {
        const id = j * 7 + i,
          c = surface.cells[id],
          td = el("td"),
          b = el("button", (100 * c.solve.iv).toFixed(2));
        b.type = "button";
        b.setAttribute(
          "aria-label",
          `Strike ${c.strike}, expiry ${c.time} years, implied volatility ${(100 * c.solve.iv).toFixed(6)} percent`,
        );
        b.setAttribute("aria-pressed", String(id === selected));
        const f = Math.max(0, Math.min(1, (c.solve.iv * 100 - 5) / 110));
        b.style.backgroundColor = `rgb(${Math.round(244 - 95 * f)},${Math.round(247 - 54 * f)},${Math.round(242 - 75 * f)})`;
        b.addEventListener("click", () => choose(id));
        td.append(b);
        tr.append(td);
      }
      return tr;
    }),
  );
  $("ledger").replaceChildren(
    ...surface.cells.map((c) => {
      const tr = el("tr");
      for (const v of [
        c.time,
        c.strike,
        (100 * c.truth).toFixed(6),
        fmt(c.quote, 8),
        (100 * c.solve.iv).toFixed(6),
        sci(c.solve.residual),
        c.solve.steps,
      ])
        tr.append(el("td", String(v)));
      return tr;
    }),
  );
  choose(selected);
}
$("controls").addEventListener("input", () => {
  $("state").textContent =
    "Unapplied edits. Grid, checks and probe still use the last applied parameters.";
});
$("controls").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const values = {};
    for (const id of ["atm", "skew", "curve", "term"]) {
      if ($(id).value.trim() === "") throw Error("Fill all four inputs.");
      values[id] = Number($(id).value);
    }
    values.atm /= 100;
    const next = run(values);
    applied = values;
    surface = next;
    render();
  } catch (err) {
    $("state").textContent =
      `Not applied: ${err.message} Previous grid and probe retained.`;
  }
});
$("quote").addEventListener("input", () => {
  $("probe-state").textContent =
    "Unapplied quote edit. Audit still shows the last applied probe.";
});
$("probe").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    if ($("quote").value.trim() === "")
      throw Error("Enter a finite call price.");
    const q = Number($("quote").value),
      c = surface.cells[selected],
      s = solve(c.strike, c.time, q);
    probePrice = q;
    probeSolve = s;
    showProbe();
  } catch (err) {
    $("probe-state").textContent =
      `Not applied: ${err.message} Previous probe retained.`;
  }
});
$("reset").addEventListener("click", resetProbe);
window.addEventListener("resize", draw);
render();
