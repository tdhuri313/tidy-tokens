import { describe, expect, it } from "vitest";
import { computeScore } from "../src/core/score";
import { Issue, RuleName, Snapshot } from "../src/core/types";

// A layer with an auto-layout frame, so it's checkable
function layer(id: string): Snapshot {
  return {
    id,
    name: id,
    type: "FRAME",
    paints: [],
    layout: { paddingTop: 8, paddingRight: 8, paddingBottom: 8, paddingLeft: 8, itemSpacing: 8 },
    text: null,
  };
}

// A layer with no paints, layout, or text, so there's nothing to check
function emptyLayer(id: string): Snapshot {
  return { id, name: id, type: "GROUP", paints: [], layout: null, text: null };
}

function layers(count: number): Snapshot[] {
  return Array.from({ length: count }, (_, i) => layer(`n${i}`));
}

function issue(nodeId: string, rule: RuleName = "offGridSpacing"): Issue {
  return {
    id: `${nodeId}:${rule}`,
    nodeId,
    nodeName: nodeId,
    rule,
    message: "",
    severity: "warning",
    fix: null,
    suggestion: null,
  };
}

describe("computeScore", () => {
  it("scores 100 when every layer is clean", () => {
    expect(computeScore(layers(5), []).score).toBe(100);
  });

  it("scores 75 for 3 clean layers out of 4", () => {
    const summary = computeScore(layers(4), [issue("n0")]);
    expect(summary).toMatchObject({ score: 75, checkedLayers: 4, cleanLayers: 3 });
  });

  it("scores 99, not 100, for 199 clean layers out of 200", () => {
    expect(computeScore(layers(200), [issue("n0")]).score).toBe(99);
  });

  it("scores 29 for 29 clean layers out of 100, despite floating-point error", () => {
    const issues = Array.from({ length: 71 }, (_, i) => issue(`n${i}`));
    expect(computeScore(layers(100), issues).score).toBe(29);
  });

  it("counts a layer with several issues as not clean only once", () => {
    const issues = [issue("n0", "hardcodedColor"), issue("n0", "offGridSpacing"), issue("n0", "textStyle")];
    const summary = computeScore(layers(4), issues);
    expect(summary).toMatchObject({ score: 75, cleanLayers: 3 });
  });

  it("counts every issue in issueCount and countsByRule, with 0 for rules without issues", () => {
    const issues = [issue("n0", "hardcodedColor"), issue("n0", "hardcodedColor"), issue("n1", "textStyle")];
    const summary = computeScore(layers(3), issues);
    expect(summary.issueCount).toBe(3);
    expect(summary.countsByRule).toEqual({
      hardcodedColor: 2,
      offGridSpacing: 0,
      lowContrast: 0,
      textStyle: 1,
    });
  });

  it("leaves layers with nothing to check out of checkedLayers", () => {
    const summary = computeScore([layer("a"), emptyLayer("b"), emptyLayer("c")], []);
    expect(summary).toMatchObject({ score: 100, checkedLayers: 1, cleanLayers: 1 });
  });

  it("returns score null when no layers are checkable", () => {
    const summary = computeScore([emptyLayer("a"), emptyLayer("b")], []);
    expect(summary).toMatchObject({ score: null, checkedLayers: 0, cleanLayers: 0 });
  });

  it("returns score null for an empty snapshot list", () => {
    expect(computeScore([], []).score).toBeNull();
  });
});
