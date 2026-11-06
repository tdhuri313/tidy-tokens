import { ColorToken, RGB, TextStyleToken } from "../core/types";

export type LoadedTokens = {
  colorTokens: ColorToken[];
  textStyles: TextStyleToken[];
};

// Guards against alias loops (A -> B -> A)
const MAX_ALIAS_DEPTH = 10;

function isAlias(value: VariableValue): value is VariableAlias {
  return typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS";
}

function isRgb(value: VariableValue): value is RGB | RGBA {
  return typeof value === "object" && "r" in value && "g" in value && "b" in value;
}

async function defaultValue(variable: Variable): Promise<VariableValue | null> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (!collection) return null;
  const value = variable.valuesByMode[collection.defaultModeId];
  return value === undefined ? null : value;
}

// Follows aliases through each variable's default mode until it reaches a color.
// Returns null for anything that can't be resolved.
async function resolveColor(value: VariableValue | null, depth = 0): Promise<RGB | null> {
  if (value === null || depth > MAX_ALIAS_DEPTH) return null;
  if (isRgb(value)) return { r: value.r, g: value.g, b: value.b };
  if (isAlias(value)) {
    const target = await figma.variables.getVariableByIdAsync(value.id);
    return target ? resolveColor(await defaultValue(target), depth + 1) : null;
  }
  // A composed color: its color part may itself be a color or an alias
  if (typeof value === "object" && "color" in value) return resolveColor(value.color, depth + 1);
  return null;
}

async function loadColorVariables(): Promise<ColorToken[]> {
  const variables = await figma.variables.getLocalVariablesAsync("COLOR");
  const tokens: ColorToken[] = [];
  for (const variable of variables) {
    const rgb = await resolveColor(await defaultValue(variable));
    if (rgb) tokens.push({ id: variable.id, name: variable.name, rgb });
  }
  return tokens;
}

async function loadPaintStyles(): Promise<ColorToken[]> {
  const styles = await figma.getLocalPaintStylesAsync();
  const tokens: ColorToken[] = [];
  for (const style of styles) {
    const paint = style.paints.length === 1 ? style.paints[0] : null;
    if (paint && paint.type === "SOLID") {
      tokens.push({ id: style.id, name: style.name, rgb: { r: paint.color.r, g: paint.color.g, b: paint.color.b } });
    }
  }
  return tokens;
}

// TextStyle has no fontWeight in @figma/plugin-typings (only fontName and fontSize),
// so the weight comes from the font's style name, like "Semi Bold Italic".
const WEIGHTS_BY_NAME: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

export function weightFromStyleName(style: string): number {
  const key = style.toLowerCase().replace(/italic|oblique/g, "").replace(/[\s_-]/g, "");
  if (key === "") return 400; // "Italic" alone means a regular weight
  // Unknown names (like "Condensed") default to 400. This is a guess, not a measured weight.
  return WEIGHTS_BY_NAME[key] ?? 400;
}

async function loadTextStyles(): Promise<TextStyleToken[]> {
  const styles = await figma.getLocalTextStylesAsync();
  return styles.map((style) => ({
    id: style.id,
    name: style.name,
    fontFamily: style.fontName.family,
    fontSize: style.fontSize,
    fontWeight: weightFromStyleName(style.fontName.style),
  }));
}

export async function loadTokens(): Promise<LoadedTokens> {
  const variables = await loadColorVariables();
  const paintStyles = await loadPaintStyles();
  return { colorTokens: [...variables, ...paintStyles], textStyles: await loadTextStyles() };
}
