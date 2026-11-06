import { describe, expect, it } from "vitest";
import { hexToRgb } from "../../src/core/color";
import { DEFAULT_DELTA_E_THRESHOLD, prepareTokens } from "../../src/core/nearestToken";
import { RuleContext } from "../../src/core/rules/context";
import { hardcodedColor } from "../../src/core/rules/hardcodedColor";
import { Paint, Snapshot } from "../../src/core/types";

const TOKENS = prepareTokens([
  { id: "tok-black", name: "black", rgb: hexToRgb("#000000") },
  { id: "tok-blue", name: "blue", rgb: hexToRgb("#3366CC") },
]);

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    colorTokens: TOKENS,
    textStyles: [],
    gridSize: 8,
    deltaEThreshold: DEFAULT_DELTA_E_THRESHOLD,
    ...overrides,
  };
}

function makePaint(overrides: Partial<Paint> = {}): Paint {
  return {
    kind: "fill",
    index: 0,
    color: hexToRgb("#3467CD"),
    opacity: 1,
    isBound: false,
    ...overrides,
  };
}

function makeSnapshot(paints: Paint[]): Snapshot {
  return { id: "node-1", name: "Button", type: "FRAME", paints, layout: null, text: null };
}

describe("hardcodedColor", () => {
  it("gives a close hardcoded fill a bindColor fix with the right token", () => {
    const issues = hardcodedColor(makeSnapshot([makePaint()]), makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "node-1:hardcodedColor:fill:0",
      rule: "hardcodedColor",
      severity: "warning",
      suggestion: null,
      fix: { type: "bindColor", paintKind: "fill", paintIndex: 0, tokenId: "tok-blue" },
    });
    expect(issues[0].message).toContain("#3467CD");
    expect(issues[0].message).toContain("blue");
  });

  it("flags a far color with fix null", () => {
    const issues = hardcodedColor(
      makeSnapshot([makePaint({ color: hexToRgb("#FF0000") })]),
      makeContext(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toBeNull();
    expect(issues[0].message).toContain("#FF0000");
    expect(issues[0].message).toContain("no close token");
  });

  it("flags a paint with fix null when there are no tokens", () => {
    const issues = hardcodedColor(makeSnapshot([makePaint()]), makeContext({ colorTokens: [] }));
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toBeNull();
    expect(issues[0].message).toContain("no color tokens");
  });

  it("skips a bound paint", () => {
    const issues = hardcodedColor(makeSnapshot([makePaint({ isBound: true })]), makeContext());
    expect(issues).toEqual([]);
  });

  it("skips a gradient (color null)", () => {
    const issues = hardcodedColor(makeSnapshot([makePaint({ color: null })]), makeContext());
    expect(issues).toEqual([]);
  });

  it("skips a fully transparent paint", () => {
    const issues = hardcodedColor(makeSnapshot([makePaint({ opacity: 0 })]), makeContext());
    expect(issues).toEqual([]);
  });

  it("flags a stroke with paintKind stroke and the right index", () => {
    const issues = hardcodedColor(
      makeSnapshot([makePaint({ kind: "stroke", index: 2 })]),
      makeContext(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe("node-1:hardcodedColor:stroke:2");
    expect(issues[0].fix).toEqual({
      type: "bindColor",
      paintKind: "stroke",
      paintIndex: 2,
      tokenId: "tok-blue",
    });
  });

  it("returns two issues with different ids for two hardcoded paints", () => {
    const issues = hardcodedColor(
      makeSnapshot([makePaint({ index: 0 }), makePaint({ index: 1 })]),
      makeContext(),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].id).not.toBe(issues[1].id);
  });
});
