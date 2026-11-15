import { run, solve, DEFAULT } from "../web/src/model.js";
import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from "node:fs";

const HTTP_PORT = 8989;
const CDP_PORT = 9390;
const SHOTS = process.env.SMOKE_SHOTS === "1";
const root = new URL("..", import.meta.url).pathname;

const profile = mkdtempSync("/tmp/foldline-chrome-");
const server = spawn(
  "python3",
  [
    "-m",
    "http.server",
    String(HTTP_PORT),
    "--bind",
    "127.0.0.1",
    "--directory",
    `${root}docs`,
  ],
  { stdio: "ignore", detached: true },
);
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const cleanup = async (code) => {
  for (const child of [chrome, server]) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await Promise.all(
    [chrome, server].map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => child.once("exit", r)),
    ),
  );
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
};
const timeout = setTimeout(() => {
  console.error("smoke: timeout");
  cleanup(1);
}, 90000);
process.on("SIGINT", () => cleanup(2));
process.on("uncaughtException", (e) => {
  console.error(e);
  cleanup(1);
});
process.on("unhandledRejection", (e) => {
  console.error(e);
  cleanup(1);
});

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? "ok" : "NOT OK"} - ${name}${detail ? " - " + detail : ""}`,
  );
};

await waitFor(
  async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok,
  "chrome devtools",
);
const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let mid = 0;
const rpcPending = new Map();
const consoleErrors = [];
const requests = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Network.requestWillBeSent")
    requests.push(msg.params.request.url);
  if (msg.id && rpcPending.has(msg.id)) {
    rpcPending.get(msg.id)(msg);
    rpcPending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown")
    consoleErrors.push(
      msg.params.exceptionDetails?.exception?.description ?? "page exception",
    );
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++mid;
    rpcPending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails)
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  await new Promise((r) => setTimeout(r, 900));
  const metrics = await cdp("Page.getLayoutMetrics");
  const size = metrics.result.cssContentSize;
  const r = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  });
  writeFileSync(
    `${root}smoke-${name}.png`,
    Buffer.from(r.result.data, "base64"),
  );
};

await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const url = process.env.SMOKE_URL || `http://127.0.0.1:${HTTP_PORT}/`;
await cdp("Page.navigate", { url });
await waitFor(
  async () =>
    await evaluate(`document.querySelectorAll('#ledger tr').length===35`),
  "rendered",
);
const input = (id, value) =>
  evaluate(
    `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}));true`,
  );
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click();true`);
const submit = (id) =>
  evaluate(
    `document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true`,
  );
const text = (id) =>
  evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
const near = (a, b, t = 1e-7) => Number.isFinite(a) && Math.abs(a - b) <= t;
const snap = () =>
  evaluate(
    `({grid:[...document.querySelectorAll('.matrix button')].map(b=>({text:b.textContent,pressed:b.getAttribute('aria-pressed'),label:b.getAttribute('aria-label')})),ledger:[...document.querySelectorAll('#ledger tr')].map(r=>[...r.cells].map(c=>c.textContent)),audit:[...document.querySelectorAll('#audit strong')].map(x=>x.textContent),poly:document.querySelector('#smile polyline').getAttribute('points'),svgWidth:document.querySelector('#smile').getBoundingClientRect().width,dot:[document.querySelector('#smile .chosen').getAttribute('cx'),document.querySelector('#smile .chosen').getAttribute('cy')].map(Number),counts:['vertical','butterfly','calendar'].map(id=>document.getElementById(id).textContent),state:document.getElementById('state').textContent,probe:document.getElementById('probe-state').textContent,message:document.getElementById('probe-message').textContent})`,
  );
async function verify(p, sel, label) {
  const r = run(p),
    v = await snap();
  check(
    label + " grid",
    v.grid.length === 35 &&
      v.grid.every(
        (g, i) =>
          g.text === (r.cells[i].solve.iv * 100).toFixed(2) &&
          g.pressed === String(i === sel) &&
          g.label.includes(`Strike ${r.cells[i].strike}`),
      ),
  );
  check(
    label + " ledger245cells",
    v.ledger.length === 35 &&
      v.ledger.every((row, i) => {
        const c = r.cells[i],
          e = [
            String(c.time),
            String(c.strike),
            (c.truth * 100).toFixed(6),
            c.quote.toFixed(8),
            (c.solve.iv * 100).toFixed(6),
            c.solve.residual.toExponential(3),
            String(c.solve.steps),
          ];
        return row.every((q, j) =>
          j === 5
            ? Math.abs(Number(q) - Number(e[j])) < 1e-12 &&
              Math.abs(Number(q)) <= 1e-8
            : q === e[j],
        );
      }),
  );
  check(
    label + " counts",
    v.counts.every(
      (q, i) => +q === r[["vertical", "butterfly", "calendar"][i]],
    ),
  );
  const c = r.cells[sel],
    z = c.solve;
  check(
    label + " audit",
    v.audit[0] === c.quote.toFixed(8) &&
      v.audit[1] === `${(100 * c.truth).toFixed(6)}%` &&
      v.audit[2] === c.quote.toFixed(8) &&
      v.audit[3] === `${(100 * z.iv).toFixed(6)}%` &&
      v.audit[4] === z.repriced.toFixed(8) &&
      v.audit[5] === z.residual.toExponential(3) &&
      +v.audit[6] === z.steps &&
      v.audit[7] === (z.hi - z.lo).toExponential(3) &&
      +v.audit[8] === Math.max(100 - c.strike, 0) &&
      +v.audit[9] === 100 &&
      v.audit[10] === z.vega.toFixed(8) &&
      v.audit[11] === (1 / z.vega).toExponential(3),
  );
  const slice = r.cells.slice(
      Math.floor(sel / 7) * 7,
      Math.floor(sel / 7) * 7 + 7,
    ),
    vs = slice.map((c) => 100 * c.solve.iv),
    min = Math.min(...vs),
    max = Math.max(...vs),
    pad = Math.max(1, (max - min) * 0.15),
    lo = Math.max(0, min - pad),
    hi = max + pad,
    width = Math.max(260, v.svgWidth),
    x = (k) => 46 + ((k - 85) / 30) * (width - 60),
    y = (s) => 20 + ((hi - s) / (hi - lo)) * 178,
    points = v.poly.split(" ").map((s) => s.split(",").map(Number));
  check(
    label + " everyPoint",
    points.length === 7 &&
      points.every(
        (a, i) =>
          near(a[0], x(slice[i].strike)) &&
          near(a[1], y(slice[i].solve.iv * 100)),
      ),
  );
  check(
    label + " dot",
    near(v.dot[0], x(c.strike)) && near(v.dot[1], y(c.solve.iv * 100)),
  );
  check(
    label + " headlines",
    (await text("recovered")) === "35 / 35" &&
      (await text("residual")) === r.maxResidual.toExponential(3) &&
      (await text("recovery")) === (r.maxIvError * 100).toExponential(2),
  );
}
await verify(DEFAULT, 17, "default");
await shot("default");
for (const i of [0, 6, 7, 14, 20, 21, 28, 34]) {
  await evaluate(
    `document.querySelectorAll('.matrix button')[${i}].click();true`,
  );
  await verify(DEFAULT, i, "selected" + i);
}
const gridBeforeProbe = await snap();
await input("quote", 100);
await submit("probe");
check(
  "infinite limit",
  (await text("probe-state")).includes("infinite-limit") &&
    (await text("probe-message")).includes("no finite"),
);
await input("quote", 101);
await submit("probe");
check("outside upper", (await text("probe-state")).includes("outside-bounds"));
await input("quote", -1);
await submit("probe");
check("outside lower", (await text("probe-state")).includes("outside-bounds"));
await input("quote", 0);
await submit("probe");
check(
  "zero limit",
  (await text("probe-state")).includes("zero-limit") &&
    (await snap()).audit[3] === "0.000000%",
);
await input("quote", 1e-10);
await submit("probe");
check(
  "near-floor precision limit",
  (await text("probe-state")).includes("precision-limit") &&
    (await snap()).audit[3] === "N/A",
);
await input("quote", 99);
await submit("probe");
check(
  "finite above cap",
  (await text("probe-state")).includes("above-cap") &&
    (await snap()).audit[3] === "N/A",
);
const c = run(DEFAULT).cells[34],
  q = c.quote + 0.01;
await input("quote", q);
await submit("probe");
const z = solve(c.strike, c.time, q),
  v = await snap();
check(
  "edited quote recovery",
  v.audit[3] === `${(100 * z.iv).toFixed(6)}%` && v.audit[2] === q.toFixed(8),
);
check(
  "probe leaves grid",
  JSON.stringify(v.ledger) === JSON.stringify(gridBeforeProbe.ledger) &&
    JSON.stringify(v.counts) === JSON.stringify(gridBeforeProbe.counts) &&
    v.grid[34].text === (c.solve.iv * 100).toFixed(2),
);
await input("quote", "");
await submit("probe");
check(
  "blank quote retains audit",
  (await text("probe-state")).startsWith("Not applied:") &&
    (await snap()).audit[3] === v.audit[3],
);
await click("#reset");
await verify(DEFAULT, 34, "reset");
await input("atm", 40);
const before = await snap();
check("grid dirty", (await text("state")).includes("Unapplied"));
await input("curve", 0.26);
await submit("controls");
check(
  "invalid grid retains",
  JSON.stringify((await snap()).ledger) === JSON.stringify(before.ledger) &&
    (await text("state")).startsWith("Not applied:"),
);
await input("atm", "");
await submit("controls");
check(
  "blank grid retains",
  JSON.stringify((await snap()).ledger) === JSON.stringify(before.ledger),
);
const cases = [
  { atm: 0.4, skew: 0, curve: -0.25, term: -0.5 },
  { atm: 0.18, skew: -0.3, curve: -0.25, term: 0.5 },
  { atm: 0.2, skew: 0, curve: 0, term: 0 },
];
for (let i = 0; i < cases.length; i++) {
  const p = cases[i];
  for (const id of ["atm", "skew", "curve", "term"])
    await input(id, id === "atm" ? p[id] * 100 : p[id]);
  await submit("controls");
  await verify(p, 34, "scenario" + i);
}
check(
  "flat diagnostics",
  (await snap()).counts.every((x) => +x === 0),
);
for (const id of ["atm", "skew", "curve", "term"])
  await input(id, id === "atm" ? DEFAULT[id] * 100 : DEFAULT[id]);
await submit("controls");
await evaluate(`document.querySelectorAll('.matrix button')[17].click();true`);
for (const width of [768, 390, 360, 320]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
  );
  const bounds = await evaluate(
    `({doc:document.documentElement.scrollWidth,viewport:innerWidth,svg:document.getElementById('smile').getBoundingClientRect().toJSON(),matrix:document.querySelector('.matrix').getBoundingClientRect().width,scroll:document.querySelector('.scroll').getBoundingClientRect().width,controls:[...document.querySelectorAll('input,form button,.metrics strong,.audit strong')].map(e=>e.getBoundingClientRect().toJSON())})`,
  );
  check("width" + width + " noPageOverflow", bounds.doc <= width);
  check(
    "width" + width + " controls",
    bounds.controls.every((b) => b.left >= 0 && b.right <= width + 0.5),
  );
  check(
    "width" + width + " chart",
    bounds.svg.left >= 0 && bounds.svg.right <= width + 0.5,
  );
  if (width === 320) {
    check(
      "matrixScrollBounded",
      bounds.matrix > bounds.scroll && bounds.scroll <= width,
    );
    await shot("mobile-plots");
    await click("summary");
    await shot("mobile-ledger");
    const l = await evaluate(
      `({h:document.querySelector('.ledger-scroll').clientHeight,sh:document.querySelector('.ledger-scroll').scrollHeight,w:document.querySelector('.ledger-scroll').clientWidth,sw:document.querySelector('.ledger-scroll').scrollWidth})`,
    );
    check("ledgerBoundedBothAxes", l.h <= 440 && l.sh > l.h && l.sw > l.w);
  }
  await verify(DEFAULT, 17, "width" + width);
}
check("noErrors", consoleErrors.length === 0, consoleErrors.join(";"));
const origin = new URL(url).origin;
check(
  "noOffOriginRequests",
  requests.every((u) => u.startsWith(origin) || u === "about:blank"),
  requests.filter((u) => !u.startsWith(origin)).join(";"),
);
check(
  "noStorage",
  await evaluate(
    `localStorage.length===0&&sessionStorage.length===0&&!document.cookie`,
  ),
);
check(
  "CSP",
  await evaluate(
    `document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'")`,
  ),
);
writeFileSync(root + "browser-checks.json", JSON.stringify(checks, null, 2));
const failures = checks.filter((c) => !c.ok);
console.log(`${checks.length} Chrome checks, ${failures.length} failures`);
clearTimeout(timeout);
await cleanup(failures.length ? 1 : 0);
