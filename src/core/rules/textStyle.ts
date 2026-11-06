import { Fix, Issue, Snapshot, TextInfo, TextStyleToken } from "../types";
import { RuleContext } from "./context";

const MAX_SIZE_DIFF = 1;
const MAX_WEIGHT_DIFF = 100;

type Result = { message: string; fix: Fix | null; suggestion: string | null };

// 1px of size counts the same as 100 of weight
function score(text: TextInfo, style: TextStyleToken): number {
  return Math.abs(text.fontSize - style.fontSize) + Math.abs(text.fontWeight - style.fontWeight) / 100;
}

function isClose(text: TextInfo, style: TextStyleToken): boolean {
  return (
    Math.abs(text.fontSize - style.fontSize) <= MAX_SIZE_DIFF &&
    Math.abs(text.fontWeight - style.fontWeight) <= MAX_WEIGHT_DIFF
  );
}

function findBestStyle(text: TextInfo, styles: TextStyleToken[]): TextStyleToken | null {
  let best: TextStyleToken | null = null;
  for (const style of styles) {
    if (style.fontFamily !== text.fontFamily) continue;
    // Strictly less than, so the first style wins a tie
    if (best === null || score(text, style) < score(text, best)) best = style;
  }
  return best;
}

function describeMatch(text: TextInfo, context: RuleContext): Result {
  const current = `${text.fontFamily} ${text.fontSize}px, weight ${text.fontWeight}`;
  if (text.isMixed) {
    return {
      message: "Text has mixed formatting, so no single text style can be applied.",
      fix: null,
      suggestion: null,
    };
  }
  const best = findBestStyle(text, context.textStyles);
  if (best === null) {
    return {
      message: `Text (${current}) has no text style, and this file has no text style using ${text.fontFamily}.`,
      fix: null,
      suggestion: null,
    };
  }
  // Distant matches aren't auto-applied because they would visibly change the design
  if (!isClose(text, best)) {
    return {
      message: `Text (${current}) has no text style, and no close text style was found.`,
      fix: null,
      suggestion: `Nearest style is ${best.name} (${best.fontSize}px, weight ${best.fontWeight}).`,
    };
  }
  return {
    message: `Text (${current}) has no text style. Apply ${best.name}.`,
    fix: { type: "applyTextStyle", styleId: best.id },
    suggestion: null,
  };
}

export function textStyle(snapshot: Snapshot, context: RuleContext): Issue[] {
  const text = snapshot.text;
  if (text === null || text.hasTextStyle) return [];
  const { message, fix, suggestion } = describeMatch(text, context);
  return [
    {
      id: `${snapshot.id}:textStyle`,
      nodeId: snapshot.id,
      nodeName: snapshot.name,
      rule: "textStyle",
      message,
      severity: "warning",
      fix,
      suggestion,
    },
  ];
}
