package foldline;

/** Synthetic European calls. All prices use S=100 and r=q=0. */
public final class Engine {
  private Engine() {}

  private static final double[] STRIKES = {85, 90, 95, 100, 105, 110, 115};
  private static final double[] TIMES = {.25, .5, 1, 1.5, 2};

  public record Params(double atm, double skew, double curve, double term) {}

  public record Solve(
      String status,
      double iv,
      double repriced,
      double residual,
      double lo,
      double hi,
      int steps,
      double vega) {}

  public record Cell(double strike, double time, double truth, double quote, Solve solve) {}

  public record Surface(
      Cell[] cells,
      int vertical,
      int butterfly,
      int calendar,
      double maxResidual,
      double maxIvError) {}

  static final int N = 64;
  static final double[] X = new double[N], W = new double[N];

  static {
    for (int i = 0; i < N / 2; i++) {
      double z = Math.cos(Math.PI * (i + .75) / (N + .5));
      for (int k = 0; k < 30; k++) {
        double[] pd = legendre(z);
        double step = pd[0] / pd[1];
        z -= step;
        if (Math.abs(step) < 2e-16) break;
      }
      double der = legendre(z)[1];
      X[i] = -z;
      X[N - 1 - i] = z;
      W[i] = 2 / ((1 - z * z) * der * der);
      W[N - 1 - i] = W[i];
    }
  }

  static double[] legendre(double z) {
    double a = 1, b = z;
    for (int j = 2; j <= N; j++) {
      double c = ((2 * j - 1) * z * b - (j - 1) * a) / j;
      a = b;
      b = c;
    }
    return new double[] {b, N * (z * b - a) / (z * z - 1)};
  }

  public static double density(double z) {
    return Math.exp(-.5 * z * z) / Math.sqrt(2 * Math.PI);
  }

  public static double cdf(double z) {
    if (!Double.isFinite(z)) throw new IllegalArgumentException("Finite normal argument required");
    if (z == 0) return .5;
    double a = Math.abs(z);
    if (a >= 12) return z < 0 ? 0 : 1;
    double mid = (a + 12) / 2, half = (12 - a) / 2, sum = 0;
    for (int i = 0; i < N; i++) sum += W[i] * density(mid + half * X[i]);
    double tail = half * sum;
    return z < 0 ? tail : 1 - tail;
  }

  static void validQuoteArgs(double k, double t) {
    if (!Double.isFinite(k) || k < 85 || k > 115 || !Double.isFinite(t) || t < .25 || t > 2)
      throw new IllegalArgumentException("Strike85..115 and time0.25..2 required");
  }

  public static double price(double k, double t, double sigma) {
    validQuoteArgs(k, t);
    if (!Double.isFinite(sigma) || sigma < 0 || sigma > 3)
      throw new IllegalArgumentException("Volatility0..3 required");
    if (sigma == 0) return Math.max(100 - k, 0);
    double v = sigma * Math.sqrt(t), d1 = Math.log(100 / k) / v + v / 2, d2 = d1 - v;
    // Price the OTM leg first, then use parity to avoid subtracting two large ITM terms.
    return k < 100
        ? Math.max(0, k * cdf(-d2) - 100 * cdf(-d1)) + 100 - k
        : Math.max(0, 100 * cdf(d1) - k * cdf(d2));
  }

  public static double vega(double k, double t, double sigma) {
    validQuoteArgs(k, t);
    if (!Double.isFinite(sigma) || sigma < 0 || sigma > 3)
      throw new IllegalArgumentException("Volatility0..3 required");
    if (sigma == 0) return 0;
    double v = sigma * Math.sqrt(t);
    return 100 * density(Math.log(100 / k) / v + v / 2) * Math.sqrt(t);
  }

  static Solve absent(String status) {
    return new Solve(status, Double.NaN, Double.NaN, Double.NaN, 0, 3, 0, Double.NaN);
  }

  public static Solve solve(double k, double t, double quote) {
    validQuoteArgs(k, t);
    if (!Double.isFinite(quote)) throw new IllegalArgumentException("Finite quote required");
    double lower = Math.max(100 - k, 0);
    if (quote < lower || quote > 100) return absent("outside-bounds");
    if (quote == lower) return new Solve("zero-limit", 0, lower, 0, 0, 0, 0, Double.NaN);
    if (quote == 100) return absent("infinite-limit");
    if (quote > price(k, t, 3)) return absent("above-cap");
    if (quote - lower <= 1e-8) return absent("precision-limit");
    double lo = 0, hi = 3;
    int n = 0;
    while (hi - lo > 1e-10 && n < 80) {
      double mid = (lo + hi) / 2;
      if (price(k, t, mid) < quote) lo = mid;
      else hi = mid;
      n++;
    }
    double iv = (lo + hi) / 2, reprice = price(k, t, iv), res = reprice - quote;
    return new Solve(
        Math.abs(res) <= 1e-8 && hi - lo <= 1e-10 ? "converged" : "not-converged",
        iv,
        reprice,
        res,
        lo,
        hi,
        n,
        vega(k, t, iv));
  }

  public static void validate(Params p) {
    if (p == null
        || !Double.isFinite(p.atm)
        || p.atm < .18
        || p.atm > .4
        || !Double.isFinite(p.skew)
        || Math.abs(p.skew) > .3
        || !Double.isFinite(p.curve)
        || Math.abs(p.curve) > .25
        || !Double.isFinite(p.term)
        || Math.abs(p.term) > .5)
      throw new IllegalArgumentException("ATM18..40%; skew±0.3; curve±0.25; term±0.5 required");
  }

  public static Surface run(Params p) {
    validate(p);
    Cell[] cells = new Cell[35];
    double mr = 0, mi = 0;
    for (int j = 0; j < 5; j++)
      for (int i = 0; i < 7; i++) {
        double k = STRIKES[i], t = TIMES[j], x = (k - 100) / 15;
        double sigma = p.atm * Math.exp(p.skew * x + p.curve * x * x + p.term * (t - 1));
        double q = price(k, t, sigma);
        Solve s = solve(k, t, q);
        if (!s.status.equals("converged"))
          throw new ArithmeticException("Generated quote did not converge");
        cells[j * 7 + i] = new Cell(k, t, sigma, q, s);
        mr = Math.max(mr, Math.abs(s.residual));
        mi = Math.max(mi, Math.abs(s.iv - sigma));
      }
    double[] quotes = new double[35];
    for (int i = 0; i < 35; i++) quotes[i] = cells[i].quote;
    int[] d = diagnostics(quotes);
    return new Surface(cells, d[0], d[1], d[2], mr, mi);
  }

  public static int[] diagnostics(double[] c) {
    if (c == null || c.length != 35) throw new IllegalArgumentException("35 cells required");
    for (double q : c)
      if (!Double.isFinite(q)) throw new IllegalArgumentException("Finite cell quote required");
    int vertical = 0, butterfly = 0, calendar = 0;
    for (int j = 0; j < 5; j++)
      for (int i = 0; i < 7; i++) {
        int a = j * 7 + i;
        if (i > 0) {
          double slope = (c[a] - c[a - 1]) / 5;
          if (slope > 1e-9 || slope < -1 - 1e-9) vertical++;
        }
        if (i > 1) {
          double second = c[a] - 2 * c[a - 1] + c[a - 2];
          if (second < -1e-9) butterfly++;
        }
        if (j > 0 && c[a] < c[a - 7] - 1e-9) calendar++;
      }
    return new int[] {vertical, butterfly, calendar};
  }
}
