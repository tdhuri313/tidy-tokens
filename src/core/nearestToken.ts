import { ColorToken, RGB } from "./types";
import { Lab, deltaE76, rgbToLab } from "./color";

export const DEFAULT_DELTA_E_THRESHOLD = 5;

export type LabToken = ColorToken & { lab: Lab };

export type NearestTokenResult = {
  token: LabToken;
  distance: number;
  isClose: boolean;
};

export function prepareTokens(tokens: ColorToken[]): LabToken[] {
  return tokens.map((token) => ({ ...token, lab: rgbToLab(token.rgb) }));
}

// Each lookup is O(tokens): one deltaE76 per token. Token Lab values are
// cached by prepareTokens, so tokens aren't reconverted for every comparison.
export function findNearestToken(
  rgb: RGB,
  tokens: LabToken[],
  threshold = DEFAULT_DELTA_E_THRESHOLD,
): NearestTokenResult | null {
  if (tokens.length === 0) return null;
  const lab = rgbToLab(rgb);
  let best = tokens[0];
  let bestDistance = deltaE76(lab, best.lab);
  for (let i = 1; i < tokens.length; i++) {
    const distance = deltaE76(lab, tokens[i].lab);
    // Strictly less than, so the first token wins a tie
    if (distance < bestDistance) {
      best = tokens[i];
      bestDistance = distance;
    }
  }
  return { token: best, distance: bestDistance, isClose: bestDistance < threshold };
}
