import { LayoutInfo, Paint, RGB, Snapshot, TextInfo } from "../core/types";

export type Scope = "selection" | "page" | "allPages";

// Node types that can have paints, auto layout, or text
const NODE_TYPES: NodeType[] = [
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "SECTION",
  "RECTANGLE",
  "ELLIPSE",
  "POLYGON",
  "STAR",
  "VECTOR",
  "LINE",
  "BOOLEAN_OPERATION",
  "TEXT",
];

// ---- Finding nodes ----

function isVisible(node: BaseNode): boolean {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if ("visible" in current && !current.visible) return false;
    current = current.parent;
  }
  return true;
}

function nodesInSelection(): SceneNode[] {
  const found = new Map<string, SceneNode>();
  for (const selected of figma.currentPage.selection) {
    if (NODE_TYPES.includes(selected.type)) found.set(selected.id, selected);
    if ("findAllWithCriteria" in selected) {
      for (const node of selected.findAllWithCriteria({ types: NODE_TYPES })) found.set(node.id, node);
    }
  }
  return [...found.values()];
}

export async function findNodes(scope: Scope): Promise<SceneNode[]> {
  figma.skipInvisibleInstanceChildren = true;
  if (scope === "selection") return nodesInSelection();
  if (scope === "page") return figma.currentPage.findAllWithCriteria({ types: NODE_TYPES });
  await figma.loadAllPagesAsync();
  // Search each page (not figma.root), so the results are layers and never pages
  return figma.root.children.flatMap((page) => page.findAllWithCriteria({ types: NODE_TYPES }));
}

// ---- Paints ----

function toRgb(color: RGB): RGB {
  return { r: color.r, g: color.g, b: color.b };
}

function hasStyle(styleId: string | PluginAPI["mixed"]): boolean {
  return typeof styleId === "string" && styleId !== "";
}

function convertPaints(
  paints: ReadonlyArray<globalThis.Paint>,
  kind: Paint["kind"],
  styled: boolean,
): Paint[] {
  const result: Paint[] = [];
  paints.forEach((paint, index) => {
    if (paint.visible === false) return;
    const isSolid = paint.type === "SOLID";
    result.push({
      kind,
      index, // the original array index, so a fix can target the right paint
      color: isSolid ? toRgb(paint.color) : null,
      opacity: paint.opacity ?? 1,
      isBound: styled || (isSolid && paint.boundVariables?.color !== undefined),
    });
  });
  return result;
}

function collectPaints(node: SceneNode): Paint[] {
  const paints: Paint[] = [];
  if ("fills" in node && node.fills !== figma.mixed) {
    paints.push(...convertPaints(node.fills, "fill", hasStyle(node.fillStyleId)));
  }
  if ("strokes" in node) {
    paints.push(...convertPaints(node.strokes, "stroke", hasStyle(node.strokeStyleId)));
  }
  return paints;
}

// ---- Layout ----

function collectLayout(node: SceneNode): LayoutInfo | null {
  if (!("layoutMode" in node)) return null;
  if (node.layoutMode !== "HORIZONTAL" && node.layoutMode !== "VERTICAL") return null;
  const bound = node.boundVariables ?? {};
  // A value bound to a variable is already on-system, so it's reported as 0 to avoid a false flag
  const value = (field: keyof LayoutInfo) => (bound[field] ? 0 : node[field]);
  return {
    paddingTop: value("paddingTop"),
    paddingRight: value("paddingRight"),
    paddingBottom: value("paddingBottom"),
    paddingLeft: value("paddingLeft"),
    // With SPACE_BETWEEN, Figma sizes the gap automatically, so the stored number isn't
    // a designer's choice. Reporting 0 avoids a false off-grid flag.
    itemSpacing: node.primaryAxisAlignItems === "SPACE_BETWEEN" ? 0 : value("itemSpacing"),
  };
}

// ---- Text ----

function opaqueSolidOrNull(paints: ReadonlyArray<globalThis.Paint>): RGB | null | undefined {
  // The last paint is drawn on top, so check from the end
  for (let i = paints.length - 1; i >= 0; i--) {
    const paint = paints[i];
    const opacity = paint.opacity ?? 1;
    if (paint.visible === false || opacity === 0) continue;
    // A gradient, image, or semi-transparent fill hides what's below, so the color is unknown
    return paint.type === "SOLID" && opacity === 1 ? toRgb(paint.color) : null;
  }
  return undefined; // no visible fill here, keep walking up
}

// Walks up the parents to find the color behind the text.
// This doesn't detect siblings that sit behind the text, only parents.
function findBackground(node: SceneNode): RGB | null {
  let current = node.parent;
  while (current) {
    if (current.type === "PAGE") return opaqueSolidOrNull(current.backgrounds) ?? null;
    if ("fills" in current) {
      if (current.fills === figma.mixed) return null;
      const result = opaqueSolidOrNull(current.fills);
      if (result !== undefined) return result;
    }
    current = current.parent;
  }
  return null;
}

function collectText(node: TextNode): TextInfo {
  const isMixed =
    node.fills === figma.mixed ||
    node.fontName === figma.mixed ||
    node.fontSize === figma.mixed ||
    node.fontWeight === figma.mixed ||
    node.textStyleId === figma.mixed;
  if (isMixed) {
    return { fontFamily: "", fontSize: 0, fontWeight: 0, hasTextStyle: false, isMixed: true, background: null };
  }
  return {
    fontFamily: (node.fontName as FontName).family,
    fontSize: node.fontSize as number,
    fontWeight: node.fontWeight as number,
    hasTextStyle: hasStyle(node.textStyleId),
    isMixed: false,
    background: findBackground(node),
  };
}

// ---- Snapshot ----

function toSnapshot(node: SceneNode): Snapshot {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    paints: collectPaints(node),
    layout: collectLayout(node),
    text: node.type === "TEXT" ? collectText(node) : null,
  };
}

// Runs after each batch with how many nodes are done. It can throw to stop the scan.
export type AfterBatch = (done: number, total: number) => Promise<void>;

const SNAPSHOT_BATCH_SIZE = 500;

// Converts nodes in batches so the caller can yield to Figma and report progress between them
export async function buildSnapshots(nodes: SceneNode[], afterBatch: AfterBatch): Promise<Snapshot[]> {
  const snapshots: Snapshot[] = [];
  for (let start = 0; start < nodes.length; start += SNAPSHOT_BATCH_SIZE) {
    const end = Math.min(start + SNAPSHOT_BATCH_SIZE, nodes.length);
    for (let i = start; i < end; i++) {
      const node = nodes[i];
      // The file can change while the scan yields, and reading a deleted node throws
      if (!node.removed && isVisible(node)) snapshots.push(toSnapshot(node));
    }
    await afterBatch(end, nodes.length);
  }
  return snapshots;
}
