package foldline;

public final class Main {
  public static void main(String[] args) {
    var p = args.length == 0 ? new Engine.Params(.24, -.18, .12, .04) : parse(args);
    var s = Engine.run(p);
    System.out.println(
        "Synthetic European calls: S100,r=q0. Not market data or an arbitrage-free guarantee.");
    System.out.println("T_years,strike,invented_sigma,quote,recovered_sigma,residual");
    for (var c : s.cells())
      System.out.println(
          c.time()
              + ","
              + c.strike()
              + ","
              + c.truth()
              + ","
              + c.quote()
              + ","
              + c.solve().iv()
              + ","
              + c.solve().residual());
    System.out.println(
        "Discrete failures vertical="
            + s.vertical()
            + " butterfly="
            + s.butterfly()
            + " calendar="
            + s.calendar());
  }

  static Engine.Params parse(String[] a) {
    if (a.length != 4)
      throw new IllegalArgumentException("Use zero arguments or atm skew curve term, in decimals");
    return new Engine.Params(
        Double.parseDouble(a[0]),
        Double.parseDouble(a[1]),
        Double.parseDouble(a[2]),
        Double.parseDouble(a[3]));
  }
}
