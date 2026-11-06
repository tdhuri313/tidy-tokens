import { describe, expect, it } from "vitest";
import { DEFAULT_DELTA_E_THRESHOLD } from "../../src/core/nearestToken";
import { RuleContext } from "../../src/core/rules/context";
import { offGridSpacing } from "../../src/core/rules/offGridSpacing";
import { LayoutInfo, Snapshot } from "../../src/core/types";

function makeContext(gridSize = 8): RuleContext {
  return {
    colorTokens: [],
    textStyles: [],
    gridSize,
    deltaEThreshold: DEFAULT_DELTA_E_THRESHOLD,
  };
}

function makeSnapshot(layout: Partial<LayoutInfo> | null = {}): Snapshot {
  return {
    id: "node-1",
    name: "Card",
    type: "FRAME",
    paints: [],
    layout:
      layout === null
        ? null
        : {
            paddingTop: 16,
            paddingRight: 16,
            paddingBottom: 16,
            paddingLeft: 16,
            itemSpacing: 8,
            ...layout,
          },
    text: null,
  };
}

describe("offGridSpacing", () => {
  it("returns no issues when every value is on-grid", () => {
    expect(offGridSpacing(makeSnapshot(), makeContext())).toEqual([]);
  });

  it("rounds padding of 13 on an 8px grid to 16", () => {
    const issues = offGridSpacing(makeSnapshot({ paddingTop: 13 }), makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "node-1:offGridSpacing:paddingTop",
      rule: "offGridSpacing",
      severity: "warning",
      suggestion: null,
      fix: { type: "setSpacing", property: "paddingTop", value: 16 },
    });
    expect(issues[0].message).toBe("Padding top is 13, which is off the 8px grid. Round to 16.");
  });

  it("rounds padding of 22 on an 8px grid to 24", () => {
    const issues = offGridSpacing(makeSnapshot({ paddingLeft: 22 }), makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toEqual({ type: "setSpacing", property: "paddingLeft", value: 24 });
  });

  it("does not flag padding of 0", () => {
    const snapshot = makeSnapshot({ paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 });
    expect(offGridSpacing(snapshot, makeContext())).toEqual([]);
  });

  it("returns no issues when layout is null", () => {
    expect(offGridSpacing(makeSnapshot(null), makeContext())).toEqual([]);
  });

  it("accepts 12 but flags 13 on a 4px grid", () => {
    expect(offGridSpacing(makeSnapshot({ paddingTop: 12 }), makeContext(4))).toEqual([]);
    const issues = offGridSpacing(makeSnapshot({ paddingTop: 13 }), makeContext(4));
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toEqual({ type: "setSpacing", property: "paddingTop", value: 12 });
  });

  it("does not flag a value within 0.001 of a multiple", () => {
    const snapshot = makeSnapshot({ paddingTop: 16.0005, itemSpacing: 7.9995 });
    expect(offGridSpacing(snapshot, makeContext())).toEqual([]);
  });

  it("returns separate issues with different ids for multiple off-grid properties", () => {
    const issues = offGridSpacing(
      makeSnapshot({ paddingTop: 13, paddingBottom: 22 }),
      makeContext(),
    );
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.id)).toEqual([
      "node-1:offGridSpacing:paddingTop",
      "node-1:offGridSpacing:paddingBottom",
    ]);
  });

  it("flags itemSpacing when it is off-grid", () => {
    const issues = offGridSpacing(makeSnapshot({ itemSpacing: 10 }), makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toEqual({ type: "setSpacing", property: "itemSpacing", value: 8 });
    expect(issues[0].message).toContain("Item spacing is 10");
  });

  it("returns no issues when gridSize is 0", () => {
    expect(offGridSpacing(makeSnapshot({ paddingTop: 13 }), makeContext(0))).toEqual([]);
  });
});
