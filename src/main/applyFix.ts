import { Fix } from "../core/types";

export type FixResult = { ok: true } | { ok: false; reason: string };

type PaintKind = "fill" | "stroke";

function fail(reason: string): FixResult {
  return { ok: false, reason };
}

// Returns the node's current fills or strokes, or a reason they can't be edited
function readPaints(node: SceneNode, kind: PaintKind): ReadonlyArray<Paint> | string {
  if (kind === "fill") {
    if (!("fills" in node)) return "Layer has no fills.";
    if (node.fills === figma.mixed) return "Layer has mixed fills.";
    return node.fills;
  }
  if (!("strokes" in node)) return "Layer has no strokes.";
  return node.strokes;
}

// A style id is not a variable id, so a lookup may throw instead of returning null
async function findVariable(id: string): Promise<Variable | null> {
  try {
    return await figma.variables.getVariableByIdAsync(id);
  } catch {
    return null;
  }
}

async function bindVariable(node: SceneNode, kind: PaintKind, index: number, variable: Variable): Promise<FixResult> {
  if (variable.resolvedType !== "COLOR") return fail(`Variable ${variable.name} is not a color.`);
  const paints = readPaints(node, kind);
  if (typeof paints === "string") return fail(paints);
  const paint = paints[index];
  if (!paint) return fail(`The ${kind} at position ${index} no longer exists.`);
  if (paint.type !== "SOLID") return fail(`The ${kind} at position ${index} is no longer a solid color.`);

  // Paints are read-only, so build a new array with only the target paint replaced
  const next = [...paints];
  next[index] = figma.variables.setBoundVariableForPaint(paint, "color", variable);
  if (kind === "fill") (node as SceneNode & MinimalFillsMixin).fills = next;
  else (node as SceneNode & MinimalStrokesMixin).strokes = next;
  return { ok: true };
}

async function applyPaintStyle(node: SceneNode, kind: PaintKind, index: number, style: BaseStyle): Promise<FixResult> {
  if (style.type !== "PAINT") return fail(`Style ${style.name} is not a color style.`);
  const paints = readPaints(node, kind);
  if (typeof paints === "string") return fail(paints);
  // A style replaces the whole list, so applying it to a layer with several paints would delete the others
  if (paints.length !== 1) {
    return fail(`Style ${style.name} would replace all ${paints.length} ${kind}s on this layer, so it was not applied.`);
  }
  if (index !== 0) return fail(`The ${kind} at position ${index} no longer exists.`);
  if (paints[0].type !== "SOLID") return fail(`The ${kind} is no longer a solid color.`);

  if (kind === "fill") await (node as SceneNode & MinimalFillsMixin).setFillStyleIdAsync(style.id);
  else await (node as SceneNode & MinimalStrokesMixin).setStrokeStyleIdAsync(style.id);
  return { ok: true };
}

async function bindColor(node: SceneNode, fix: Extract<Fix, { type: "bindColor" }>): Promise<FixResult> {
  const variable = await findVariable(fix.tokenId);
  if (variable) return bindVariable(node, fix.paintKind, fix.paintIndex, variable);
  const style = await figma.getStyleByIdAsync(fix.tokenId);
  if (style) return applyPaintStyle(node, fix.paintKind, fix.paintIndex, style);
  return fail("The color token no longer exists.");
}

function setSpacing(node: SceneNode, fix: Extract<Fix, { type: "setSpacing" }>): FixResult {
  if (!("layoutMode" in node)) return fail("Layer does not support auto layout.");
  if (node.layoutMode !== "HORIZONTAL" && node.layoutMode !== "VERTICAL") {
    return fail("Layer no longer uses horizontal or vertical auto layout.");
  }
  node[fix.property] = fix.value;
  return { ok: true };
}

async function applyTextStyle(node: SceneNode, fix: Extract<Fix, { type: "applyTextStyle" }>): Promise<FixResult> {
  if (node.type !== "TEXT") return fail("Layer is no longer a text layer.");
  const style = await figma.getStyleByIdAsync(fix.styleId);
  if (!style) return fail("The text style no longer exists.");
  if (style.type !== "TEXT") return fail(`Style ${style.name} is not a text style.`);
  // Figma refuses text changes until the font is loaded
  await figma.loadFontAsync((style as TextStyle).fontName);
  await node.setTextStyleIdAsync(style.id);
  return { ok: true };
}

export async function applyFix(nodeId: string, fix: Fix): Promise<FixResult> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) return fail("Layer no longer exists.");
    if (node.type === "DOCUMENT" || node.type === "PAGE") return fail("Fixes only apply to layers.");

    switch (fix.type) {
      case "bindColor":
        return await bindColor(node, fix);
      case "setSpacing":
        return setSpacing(node, fix);
      case "applyTextStyle":
        return await applyTextStyle(node, fix);
    }
  } catch (error) {
    // Figma can still throw (locked font, read-only instance child), so turn it into a reason
    return fail(error instanceof Error ? error.message : String(error));
  }
}
