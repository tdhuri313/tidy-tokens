import { describe, expect, it } from "vitest";
import { DEFAULT_DELTA_E_THRESHOLD } from "../../src/core/nearestToken";
import { RuleContext } from "../../src/core/rules/context";
import { textStyle } from "../../src/core/rules/textStyle";
import { Snapshot, TextInfo, TextStyleToken } from "../../src/core/types";

function style(id: string, fontSize: number, fontWeight: number, fontFamily = "Inter"): TextStyleToken {
  return { id, name: `Style ${id}`, fontFamily, fontSize, fontWeight };
}

function makeContext(textStyles: TextStyleToken[]): RuleContext {
  return { colorTokens: [], textStyles, gridSize: 8, deltaEThreshold: DEFAULT_DELTA_E_THRESHOLD };
}

function makeSnapshot(overrides: Partial<TextInfo> = {}, isText = true): Snapshot {
  const text: TextInfo = {
    fontFamily: "Inter",
    fontSize: 16,
    fontWeight: 400,
    hasTextStyle: false,
    isMixed: false,
    background: null,
    ...overrides,
  };
  return {
    id: "text-1",
    name: "Label",
    type: isText ? "TEXT" : "FRAME",
    paints: [],
    layout: null,
    text: isText ? text : null,
  };
}

function runOne(snapshot: Snapshot, styles: TextStyleToken[]) {
  const issues = textStyle(snapshot, makeContext(styles));
  expect(issues).toHaveLength(1);
  return issues[0];
}

describe("textStyle", () => {
  it("gives an exact match an applyTextStyle fix", () => {
    const issue = runOne(makeSnapshot(), [style("body", 16, 400)]);
    expect(issue).toMatchObject({
      id: "text-1:textStyle",
      rule: "textStyle",
      severity: "warning",
      fix: { type: "applyTextStyle", styleId: "body" },
      suggestion: null,
    });
    expect(issue.message).toContain("Style body");
  });

  it("treats a size difference of 1 and weight difference of 100 as close", () => {
    const issue = runOne(makeSnapshot(), [style("near", 17, 500)]);
    expect(issue.fix).toEqual({ type: "applyTextStyle", styleId: "near" });
  });

  it("gives a suggestion and fix null when the size differs by more than 1", () => {
    const issue = runOne(makeSnapshot(), [style("big", 18, 400)]);
    expect(issue.fix).toBeNull();
    expect(issue.message).toContain("no close text style");
    expect(issue.suggestion).toContain("Style big");
    expect(issue.suggestion).toContain("18px");
    expect(issue.suggestion).toContain("400");
  });

  it("gives a suggestion and fix null when the weight differs by more than 100", () => {
    const issue = runOne(makeSnapshot(), [style("bold", 16, 700)]);
    expect(issue.fix).toBeNull();
    expect(issue.suggestion).toContain("Style bold");
    expect(issue.suggestion).toContain("700");
  });

  it("picks the lowest score among several candidates", () => {
    // Scores against 16px/400: a = 4 + 0 = 4, b = 2 + 1 = 3, c = 2 + 0 = 2
    const issue = runOne(makeSnapshot(), [style("a", 20, 400), style("b", 18, 500), style("c", 18, 400)]);
    expect(issue.fix).toBeNull();
    expect(issue.suggestion).toContain("Style c");
  });

  it("keeps the first style when two tie", () => {
    // Both score 1: 17px/400 and 16px/500
    const issue = runOne(makeSnapshot(), [style("first", 17, 400), style("second", 16, 500)]);
    expect(issue.fix).toEqual({ type: "applyTextStyle", styleId: "first" });
  });

  it("never uses a style in another font family", () => {
    const issue = runOne(makeSnapshot(), [style("roboto", 16, 400, "Roboto"), style("inter", 20, 700)]);
    expect(issue.fix).toBeNull();
    expect(issue.suggestion).toContain("Style inter");
    expect(issue.suggestion).not.toContain("roboto");
  });

  it("returns fix null and suggestion null when no style uses the font family", () => {
    const issue = runOne(makeSnapshot(), [style("roboto", 16, 400, "Roboto")]);
    expect(issue.fix).toBeNull();
    expect(issue.suggestion).toBeNull();
    expect(issue.message).toContain("no text style using Inter");
  });

  it("returns fix null and suggestion null for an empty text style list", () => {
    const issue = runOne(makeSnapshot(), []);
    expect(issue.fix).toBeNull();
    expect(issue.suggestion).toBeNull();
  });

  it("flags mixed text with fix null", () => {
    const issue = runOne(makeSnapshot({ isMixed: true }), [style("body", 16, 400)]);
    expect(issue.fix).toBeNull();
    expect(issue.suggestion).toBeNull();
    expect(issue.message).toContain("mixed formatting");
  });

  it("returns no issues for text that already has a style", () => {
    expect(textStyle(makeSnapshot({ hasTextStyle: true }), makeContext([style("body", 16, 400)]))).toEqual([]);
  });

  it("returns no issues for a non-text node", () => {
    expect(textStyle(makeSnapshot({}, false), makeContext([style("body", 16, 400)]))).toEqual([]);
  });
});
