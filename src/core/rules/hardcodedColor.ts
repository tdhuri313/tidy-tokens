import { Fix, Issue, Paint, RGB, Snapshot } from "../types";
import { rgbToHex } from "../color";
import { findNearestToken } from "../nearestToken";
import { RuleContext } from "./context";

function needsCheck(paint: Paint): paint is Paint & { color: RGB } {
  return !paint.isBound && paint.color !== null && paint.opacity !== 0;
}

function describeMatch(
  paint: Paint & { color: RGB },
  context: RuleContext,
): { message: string; fix: Fix | null } {
  const hex = rgbToHex(paint.color);
  const match = findNearestToken(paint.color, context.colorTokens, context.deltaEThreshold);
  if (!match) {
    return { message: `Hardcoded color ${hex}: this file has no color tokens.`, fix: null };
  }
  const name = match.token.name;
  const delta = match.distance.toFixed(1);
  if (!match.isClose) {
    return {
      message: `Hardcoded color ${hex}: no close token found (nearest is ${name}, Delta E ${delta}).`,
      fix: null,
    };
  }
  return {
    message: `Hardcoded color ${hex} matches token ${name} (Delta E ${delta}).`,
    fix: { type: "bindColor", paintKind: paint.kind, paintIndex: paint.index, tokenId: match.token.id },
  };
}

export function hardcodedColor(snapshot: Snapshot, context: RuleContext): Issue[] {
  return snapshot.paints.filter(needsCheck).map((paint) => {
    const { message, fix } = describeMatch(paint, context);
    return {
      id: `${snapshot.id}:hardcodedColor:${paint.kind}:${paint.index}`,
      nodeId: snapshot.id,
      nodeName: snapshot.name,
      rule: "hardcodedColor",
      message,
      severity: "warning",
      fix,
      suggestion: null,
    };
  });
}
