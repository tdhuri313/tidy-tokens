import { describe, expect, it } from "vitest";
import { hexToRgb } from "../src/core/color";
import { DEFAULT_DELTA_E_THRESHOLD } from "../src/core/nearestToken";
import { RuleContext } from "../src/core/rules/context";
import { runRules } from "../src/core/runRules";
import { Snapshot } from "../src/core/types";

const CONTEXT: RuleContext = {
  colorTokens: [],
  textStyles: [],
  gridSize: 8,
  deltaEThreshold: DEFAULT_DELTA_E_THRESHOLD,
};

function clean(id: string): Snapshot {
  return { id, name: id, type: "FRAME", paints: [], layout: null, text: null };
}

// Breaks every rule: hardcoded fill with no tokens, off-grid padding,
// #777777 text on white at 16px, and no text style
function breaksEverything(id: string): Snapshot {
  return {
    id,
    name: id,
    type: "TEXT",
    paints: [{ kind: "fill", index: 0, color: hexToRgb("#777777"), opacity: 1, isBound: false }],
    layout: { paddingTop: 13, paddingRight: 16, paddingBottom: 16, paddingLeft: 16, itemSpacing: 8 },
    text: {
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      hasTextStyle: false,
      isMixed: false,
      background: hexToRgb("#FFFFFF"),
    },
  };
}

describe("runRules", () => {
  it("returns no issues for a clean snapshot", () => {
    expect(runRules([clean("a")], CONTEXT)).toEqual([]);
  });

  it("returns issues from all 4 rules in order for one snapshot that breaks them all", () => {
    const issues = runRules([breaksEverything("a")], CONTEXT);
    expect(issues.map((issue) => issue.rule)).toEqual([
      "hardcodedColor",
      "offGridSpacing",
      "lowContrast",
      "textStyle",
    ]);
  });

  it("keeps snapshot order across several snapshots", () => {
    const issues = runRules(
      [breaksEverything("first"), clean("middle"), breaksEverything("last")],
      CONTEXT,
    );
    expect(issues.map((issue) => issue.nodeId)).toEqual([
      ...Array(4).fill("first"),
      ...Array(4).fill("last"),
    ]);
  });

  it("returns no issues for an empty snapshot list", () => {
    expect(runRules([], CONTEXT)).toEqual([]);
  });
});
