import foldline.Engine;

public final class Dump {
  public static void main(String[] a) {
    var s =
        Engine.run(
            new Engine.Params(
                Double.parseDouble(a[0]),
                Double.parseDouble(a[1]),
                Double.parseDouble(a[2]),
                Double.parseDouble(a[3])));
    System.out.println(
        s.vertical()
            + ","
            + s.butterfly()
            + ","
            + s.calendar()
            + ","
            + s.maxResidual()
            + ","
            + s.maxIvError());
    for (var c : s.cells()) {
      var z = c.solve();
      System.out.println(
          c.strike()
              + ","
              + c.time()
              + ","
              + c.truth()
              + ","
              + c.quote()
              + ","
              + z.iv()
              + ","
              + z.repriced()
              + ","
              + z.residual()
              + ","
              + z.lo()
              + ","
              + z.hi()
              + ","
              + z.steps()
              + ","
              + z.vega());
    }
  }
}
