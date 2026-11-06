import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  deltaE76,
  hexToRgb,
  linearToSrgb,
  rgbToHex,
  rgbToLab,
  srgbToLinear,
} from "../src/core/color";

const WHITE = hexToRgb("#FFFFFF");
const BLACK = hexToRgb("#000000");

// toBeCloseTo(x, 2) passes when |diff| < 0.005, so check tolerances explicitly
function expectWithin(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe("contrastRatio", () => {
  it("is 21 for black vs. white in either order", () => {
    expectWithin(contrastRatio(BLACK, WHITE), 21, 1e-9);
    expectWithin(contrastRatio(WHITE, BLACK), 21, 1e-9);
  });

  it("is about 4.48 for #777777 on white", () => {
    expectWithin(contrastRatio(hexToRgb("#777777"), WHITE), 4.48, 0.01);
  });
});

describe("deltaE76", () => {
  it("is 0 for identical colors", () => {
    const lab = rgbToLab(hexToRgb("#3366CC"));
    expect(deltaE76(lab, lab)).toBe(0);
  });
});

describe("rgbToLab", () => {
  it("converts white to L=100, a=0, b=0", () => {
    const lab = rgbToLab(WHITE);
    expectWithin(lab.l, 100, 0.1);
    expectWithin(lab.a, 0, 0.1);
    expectWithin(lab.b, 0, 0.1);
  });

  it("converts black to L=0, a=0, b=0", () => {
    const lab = rgbToLab(BLACK);
    expectWithin(lab.l, 0, 0.1);
    expectWithin(lab.a, 0, 0.1);
    expectWithin(lab.b, 0, 0.1);
  });

  it("converts #FF0000 to L=53.24, a=80.09, b=67.20", () => {
    const lab = rgbToLab(hexToRgb("#FF0000"));
    expectWithin(lab.l, 53.24, 0.1);
    expectWithin(lab.a, 80.09, 0.1);
    expectWithin(lab.b, 67.2, 0.1);
  });
});

describe("hex conversion", () => {
  it("round-trips hex to RGB and back", () => {
    for (const hex of ["#000000", "#FFFFFF", "#777777", "#FF0000", "#3366CC", "#0A1B2C"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it("accepts hex without a leading #", () => {
    expect(rgbToHex(hexToRgb("3366cc"))).toBe("#3366CC");
  });

  it("throws on invalid hex values", () => {
    for (const bad of ["", "#", "#FFF", "FFF", "#GGGGGG", "#12345", "#1234567", "##123456", " #123456"]) {
      expect(() => hexToRgb(bad)).toThrow();
    }
  });
});

describe("sRGB transfer functions", () => {
  it("round-trip within 0.001", () => {
    for (const c of [0, 0.04, 0.5, 1]) {
      expectWithin(linearToSrgb(srgbToLinear(c)), c, 0.001);
    }
  });
});
