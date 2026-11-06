import { Issue, Paint, RGB, Snapshot, TextInfo } from "../types";
import { contrastRatio, rgbToHex } from "../color";
import { findNearestToken } from "../nearestToken";
import { RuleContext } from "./context";

// WCAG's large-text sizes, 18pt and 14pt (bold), converted to CSS pixels (1pt = 4/3 px)
export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_TEXT_PX = 56 / 3;

function isLargeText(text: TextInfo): boolean {
  return text.fontSize >= LARGE_TEXT_PX || (text.fontWeight >= 700 && text.fontSize >= LARGE_BOLD_TEXT_PX);
}

// Figma draws the last fill on top
function topVisibleFill(paints: Paint[]): Paint | null {
  const fills = paints.filter((paint) => paint.kind === "fill" && paint.opacity > 0);
  return fills.length > 0 ? fills[fills.length - 1] : null;
}

// Simple alpha blend in sRGB space
function blend(color: RGB, opacity: number, background: RGB): RGB {
  const mix = (fg: number, bg: number) => fg * opacity + bg * (1 - opacity);
  return { r: mix(color.r, background.r), g: mix(color.g, background.g), b: mix(color.b, background.b) };
}

// Round down so a failing ratio like 4.499 never displays as 4.50
function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

function suggestToken(textColor: RGB, background: RGB, required: number, context: RuleContext): string {
  const passing = context.colorTokens.filter((token) => contrastRatio(token.rgb, background) >= required);
  const match = findNearestToken(textColor, passing);
  if (!match) return "No color token passes against this background.";
  const ratio = formatRatio(contrastRatio(match.token.rgb, background));
  return `Try token ${match.token.name} (${rgbToHex(match.token.rgb)}), which has ${ratio}:1 contrast.`;
}

export function lowContrast(snapshot: Snapshot, context: RuleContext): Issue[] {
  const text = snapshot.text;
  if (text === null || text.isMixed || text.background === null) return [];
  const fill = topVisibleFill(snapshot.paints);
  if (fill === null || fill.color === null) return [];

  const background = text.background;
  const textColor = fill.opacity < 1 ? blend(fill.color, fill.opacity, background) : fill.color;
  const required = isLargeText(text) ? 3 : 4.5;
  const ratio = contrastRatio(textColor, background);
  if (ratio >= required) return [];

  return [
    {
      id: `${snapshot.id}:lowContrast`,
      nodeId: snapshot.id,
      nodeName: snapshot.name,
      rule: "lowContrast",
      message: `Text contrast is ${formatRatio(ratio)}:1, but ${required}:1 is required.`,
      severity: "error",
      fix: null, // changing text color changes the design's intent, so the designer decides
      suggestion: suggestToken(textColor, background, required, context),
    },
  ];
}
