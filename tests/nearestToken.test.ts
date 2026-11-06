import { describe, expect, it } from "vitest";
import { deltaE76, hexToRgb, rgbToLab } from "../src/core/color";
import {
  DEFAULT_DELTA_E_THRESHOLD,
  findNearestToken,
  prepareTokens,
} from "../src/core/nearestToken";
import { ColorToken } from "../src/core/types";

const RAW_TOKENS: ColorToken[] = [
  { id: "1", name: "black", rgb: hexToRgb("#000000") },
  { id: "2", name: "blue", rgb: hexToRgb("#3366CC") },
  { id: "3", name: "white", rgb: hexToRgb("#FFFFFF") },
];
const TOKENS = prepareTokens(RAW_TOKENS);

describe("findNearestToken", () => {
  it("gives an exact match distance 0 and isClose true", () => {
    const result = findNearestToken(hexToRgb("#3366CC"), TOKENS);
    expect(result?.token.id).toBe("2");
    expect(result?.distance).toBe(0);
    expect(result?.isClose).toBe(true);
  });

  it("marks a near match under the threshold as close", () => {
    const result = findNearestToken(hexToRgb("#3467CD"), TOKENS);
    expect(result?.token.id).toBe("2");
    expect(result!.distance).toBeGreaterThan(0);
    expect(result!.distance).toBeLessThan(DEFAULT_DELTA_E_THRESHOLD);
    expect(result?.isClose).toBe(true);
  });

  it("still returns the nearest token for a far color, with isClose false", () => {
    const result = findNearestToken(hexToRgb("#FF0000"), TOKENS);
    expect(result).not.toBeNull();
    expect(result!.distance).toBeGreaterThanOrEqual(DEFAULT_DELTA_E_THRESHOLD);
    expect(result?.isClose).toBe(false);
  });

  it("is not close when the distance exactly equals the threshold", () => {
    const rgb = hexToRgb("#3467CD");
    const threshold = deltaE76(rgbToLab(rgb), TOKENS[1].lab);
    const result = findNearestToken(rgb, TOKENS, threshold);
    expect(result?.distance).toBe(threshold);
    expect(result?.isClose).toBe(false);
  });

  it("returns null for an empty token list", () => {
    expect(findNearestToken(hexToRgb("#3366CC"), [])).toBeNull();
  });

  it("keeps the first token when two tie", () => {
    const tied = prepareTokens([
      { id: "a", name: "first", rgb: hexToRgb("#3366CC") },
      { id: "b", name: "second", rgb: hexToRgb("#3366CC") },
    ]);
    expect(findNearestToken(hexToRgb("#3467CD"), tied)?.token.id).toBe("a");
  });
});

describe("prepareTokens", () => {
  it("keeps id, name, and rgb and adds the Lab value", () => {
    RAW_TOKENS.forEach((raw, i) => {
      const prepared = TOKENS[i];
      expect(prepared.id).toBe(raw.id);
      expect(prepared.name).toBe(raw.name);
      expect(prepared.rgb).toEqual(raw.rgb);
      expect(prepared.lab).toEqual(rgbToLab(raw.rgb));
    });
  });
});
