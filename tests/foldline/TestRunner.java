package foldline;

import java.util.Random;

public final class TestRunner {
  static int n = 0;

  static void ok(boolean c) {
    n++;
    if (!c) throw new AssertionError("check" + n);
  }

  static void close(double a, double b, double tol) {
    ok(Double.isFinite(a) && Double.isFinite(b) && Math.abs(a - b) <= tol);
  }

  static void bad(Runnable r) {
    boolean b = false;
    try {
      r.run();
    } catch (IllegalArgumentException e) {
      b = true;
    }
    ok(b);
  }

  public static void main(String[] args) {
    close(Engine.cdf(0), .5, 0);
    close(Engine.cdf(1), .8413447460685429, 2e-15);
    close(Engine.price(100, 1, .2), 7.965567455405804, 2e-12);
    close(Engine.price(85, 1, 0), 15, 0);
    close(Engine.price(115, 1, 0), 0, 0);
    for (double z = -10; z <= 10; z += .01) close(Engine.cdf(z) + Engine.cdf(-z), 1, 2e-15);
    Random rng = new Random(14);
    double maxErr = 0;
    for (int a = 0; a < 700; a++) {
      Engine.Params p =
          new Engine.Params(
              .18 + .22 * rng.nextDouble(),
              -.3 + .6 * rng.nextDouble(),
              -.25 + .5 * rng.nextDouble(),
              -.5 + rng.nextDouble());
      Engine.Surface s = Engine.run(p);
      ok(s.cells().length == 35);
      ok(s.maxResidual() < 1e-8);
      ok(s.maxIvError() < 2e-8);
      maxErr = Math.max(maxErr, s.maxIvError());
      for (Engine.Cell c : s.cells()) {
        var v = c.solve();
        ok(v.status().equals("converged"));
        ok(v.steps() == 35);
        ok(v.hi() - v.lo() <= 1e-10);
        close(v.iv(), c.truth(), 2e-8);
        close(v.repriced(), c.quote(), 1e-8);
        ok(c.quote() > Math.max(100 - c.strike(), 0) && c.quote() < 100);
        ok(v.vega() > 0);
        double d = 1e-5;
        close(
            (Engine.price(c.strike(), c.time(), v.iv() + d)
                    - Engine.price(c.strike(), c.time(), v.iv() - d))
                / (2 * d),
            v.vega(),
            2e-5);
      }
    }
    for (double atm : new double[] {.18, .4})
      for (double skew : new double[] {-.3, .3})
        for (double curve : new double[] {-.25, .25})
          for (double term : new double[] {-.5, .5}) {
            var s = Engine.run(new Engine.Params(atm, skew, curve, term));
            ok(s.maxIvError() < 2e-8);
          }
    var flat = Engine.run(new Engine.Params(.2, 0, 0, 0));
    ok(flat.vertical() == 0 && flat.butterfly() == 0 && flat.calendar() == 0);
    for (var c : flat.cells()) close(c.solve().iv(), .2, 1e-10);
    ok(Engine.run(new Engine.Params(.4, 0, -.25, 0)).butterfly() > 0);
    ok(Engine.run(new Engine.Params(.2, 0, 0, -.5)).calendar() > 0);
    for (double k : new double[] {85, 100, 115})
      for (double t : new double[] {.25, 2}) {
        double l = Math.max(100 - k, 0);
        ok(Engine.solve(k, t, l + 1e-10).status().equals("precision-limit"));
        ok(Engine.solve(k, t, l).status().equals("zero-limit"));
        ok(Engine.solve(k, t, l - .0001).status().equals("outside-bounds"));
        ok(Engine.solve(k, t, 100).status().equals("infinite-limit"));
        ok(Engine.solve(k, t, 100.1).status().equals("outside-bounds"));
        double cap = Engine.price(k, t, 3);
        ok(Engine.solve(k, t, (cap + 100) / 2).status().equals("above-cap"));
        close(Engine.solve(k, t, cap).iv(), 3, 1e-10);
      }
    for (double v : new double[] {Double.NaN, Double.POSITIVE_INFINITY, -1, 3.1})
      bad(() -> Engine.price(100, 1, v));
    bad(() -> Engine.solve(100, 1, Double.NaN));
    bad(() -> Engine.price(84, 1, .2));
    bad(() -> Engine.price(100, 0, .2));
    bad(() -> Engine.run(null));
    bad(() -> Engine.run(new Engine.Params(.17, 0, 0, 0)));
    bad(() -> Engine.run(new Engine.Params(.2, .31, 0, 0)));
    bad(() -> Engine.diagnostics(new double[2]));
    System.out.println(n + " Java assertions; max IV recovery error " + maxErr);
  }
}
