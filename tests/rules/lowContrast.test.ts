import { describe, expect, it } from "vitest";
import { hexToRgb } from "../../src/core/color";
import { DEFAULT_DELTA_E_THRESHOLD, prepareTokens } from "../../src/core/nearestToken";
import { RuleContext } from "../../src/core/rules/context";
import { lowContrast } from "../../src/core/rules/lowContrast";
import { ColorToken, Paint, Snapshot, TextInfo } from "../../src/core/types";

const WHITE = hexToRgb("#FFFFFF");

function makeContext(tokens: ColorToken[] = []): RuleContext {
  return {
    colorTokens: prepareTokens(tokens),
    textStyles: [],
    gridSize: 8,
    deltaEThreshold: DEFAULT_DELTA_E_THRESHOLD,
  };
}

function fill(hex: string | null, opacity = 1): Paint {
  return { kind: "fill", index: 0, color: hex === null ? null : hexToRgb(hex), opacity, isBound: false };
}

function makeText(overrides: Partial<TextInfo> = {}): TextInfo {
  return {
    fontFamily: "Inter",
    fontSize: 16,
    fontWeight: 400,
    hasTextStyle: false,
    isMixed: false,
    background: WHITE,
    ...overrides,
  };
}

function makeSnapshot(paints: Paint[], text: TextInfo | null = makeText()): Snapshot {
  return { id: "text-1", name: "Label", type: "TEXT", paints, layout: null, text };
}

describe("lowContrast", () => {
  it("flags #777777 on white at 16px weight 400 without showing a passing value", () => {
    const issues = lowContrast(makeSnapshot([fill("#777777")]), makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "text-1:lowContrast",
      rule: "lowContrast",
      severity: "error",
      fix: null,
    });
    expect(issues[0].message).toMatch(/4\.4[78]:1/);
    expect(issues[0].message).not.toContain("4.50");
    expect(issues[0].message).toContain("4.5:1");
  });

  it("does not flag #767676 on white at 16px weight 400", () => {
    expect(lowContrast(makeSnapshot([fill("#767676")]), makeContext())).toEqual([]);
  });

  it("does not flag #777777 on white at 24px", () => {
    const snapshot = makeSnapshot([fill("#777777")], makeText({ fontSize: 24 }));
    expect(lowContrast(snapshot, makeContext())).toEqual([]);
  });

  it("does not flag #777777 on white at 19px weight 700", () => {
    const snapshot = makeSnapshot([fill("#777777")], makeText({ fontSize: 19, fontWeight: 700 }));
    expect(lowContrast(snapshot, makeContext())).toEqual([]);
  });

  it("flags #777777 on white at 18px weight 700", () => {
    const snapshot = makeSnapshot([fill("#777777")], makeText({ fontSize: 18, fontWeight: 700 }));
    expect(lowContrast(snapshot, makeContext())).toHaveLength(1);
  });

  it("flags black at 0.5 opacity on white at 16px", () => {
    expect(lowContrast(makeSnapshot([fill("#000000", 0.5)]), makeContext())).toHaveLength(1);
  });

  it("suggests the passing token closest to the original color, ignoring failing tokens", () => {
    const context = makeContext([
      { id: "t1", name: "gray-fail", rgb: hexToRgb("#777777") }, // exact match, but fails
      { id: "t2", name: "black", rgb: hexToRgb("#000000") }, // passes, but far
      { id: "t3", name: "gray-pass", rgb: hexToRgb("#767676") }, // passes and is closest
    ]);
    const issues = lowContrast(makeSnapshot([fill("#777777")]), context);
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toContain("gray-pass");
    expect(issues[0].suggestion).toContain("#767676");
    expect(issues[0].suggestion).toContain("4.54:1");
    expect(issues[0].suggestion).not.toContain("gray-fail");
  });

  it("says so when no token passes", () => {
    const context = makeContext([
      { id: "t1", name: "white", rgb: hexToRgb("#FFFFFF") },
      { id: "t2", name: "light-gray", rgb: hexToRgb("#CCCCCC") },
    ]);
    const issues = lowContrast(makeSnapshot([fill("#777777")]), context);
    expect(issues[0].suggestion).toBe("No color token passes against this background.");
  });

  it("always sets fix to null", () => {
    const contexts = [makeContext(), makeContext([{ id: "t", name: "black", rgb: hexToRgb("#000000") }])];
    for (const context of contexts) {
      for (const hex of ["#777777", "#AAAAAA", "#FFFFFF"]) {
        for (const issue of lowContrast(makeSnapshot([fill(hex)]), context)) {
          expect(issue.fix).toBeNull();
        }
      }
    }
  });

  describe("returns no issues for", () => {
    it("non-text nodes", () => {
      expect(lowContrast(makeSnapshot([fill("#777777")], null), makeContext())).toEqual([]);
    });

    it("mixed text", () => {
      const snapshot = makeSnapshot([fill("#777777")], makeText({ isMixed: true }));
      expect(lowContrast(snapshot, makeContext())).toEqual([]);
    });

    it("a null background", () => {
      const snapshot = makeSnapshot([fill("#777777")], makeText({ background: null }));
      expect(lowContrast(snapshot, makeContext())).toEqual([]);
    });

    it("a gradient top fill", () => {
      expect(lowContrast(makeSnapshot([fill("#777777"), fill(null)]), makeContext())).toEqual([]);
    });

    it("no visible fill", () => {
      const stroke: Paint = { ...fill("#777777"), kind: "stroke" };
      expect(lowContrast(makeSnapshot([fill("#777777", 0), stroke]), makeContext())).toEqual([]);
    });
  });
});
