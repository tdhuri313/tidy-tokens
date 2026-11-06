// Development-only plugin: builds the Tidy Tokens test file on the current page.
// Plain JavaScript, no build step. Safe to run again: it reuses the token
// collection and text style, and rebuilds the seed frame from scratch.

const COLLECTION_NAME = "Tidy Test Tokens";
const TEXT_STYLE_NAME = "Body";
const SEED_FRAME_NAME = "Tidy Tokens Seed";
const FONT = { family: "Inter", style: "Regular" };

const TOKEN_HEX = {
  Purple: "#635BFF",
  Navy: "#1B1F5E",
  Lavender: "#E6E3FF",
  White: "#FFFFFF",
};

const GAP = 32;
const SWATCH = 96;
const CHILD = 48;

function hexToRgb(hex) {
  const value = parseInt(hex.replace("#", ""), 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

function solid(hex) {
  return { type: "SOLID", color: hexToRgb(hex) };
}

// The color value is a placeholder; the variable binding is what Figma uses
function boundSolid(variable) {
  return figma.variables.setBoundVariableForPaint(solid("#000000"), "color", variable);
}

// ---- Tokens and styles (reused if they already exist) ----

async function getOrCreateCollection() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = collections.find((c) => c.name === COLLECTION_NAME);
  return existing || figma.variables.createVariableCollection(COLLECTION_NAME);
}

async function getOrCreateColorVariables(collection) {
  const locals = await figma.variables.getLocalVariablesAsync("COLOR");
  const inCollection = locals.filter((v) => v.variableCollectionId === collection.id);
  const variables = {};
  for (const name of Object.keys(TOKEN_HEX)) {
    const variable =
      inCollection.find((v) => v.name === name) ||
      figma.variables.createVariable(name, collection, "COLOR");
    variable.setValueForMode(collection.defaultModeId, hexToRgb(TOKEN_HEX[name]));
    variables[name] = variable;
  }
  return variables;
}

async function getOrCreateBodyStyle() {
  const styles = await figma.getLocalTextStylesAsync();
  const style = styles.find((s) => s.name === TEXT_STYLE_NAME) || figma.createTextStyle();
  style.name = TEXT_STYLE_NAME;
  style.fontName = FONT;
  style.fontSize = 16;
  return style;
}

// ---- Layer builders ----

function removeOldSeedFrames() {
  for (const node of figma.currentPage.children) {
    if (node.type === "FRAME" && node.name === SEED_FRAME_NAME) node.remove();
  }
}

function rectangle(name, size, fill) {
  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(size, size);
  rect.fills = [fill];
  return rect;
}

function autoLayoutFrame(name, padding, lavender) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.fills = [];
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.paddingTop = padding.top;
  frame.paddingRight = padding.right;
  frame.paddingBottom = padding.bottom;
  frame.paddingLeft = padding.left;
  frame.itemSpacing = 8;
  frame.appendChild(rectangle("Item 1", CHILD, boundSolid(lavender)));
  frame.appendChild(rectangle("Item 2", CHILD, boundSolid(lavender)));
  return frame;
}

async function text(name, characters, fill, style) {
  const node = figma.createText();
  node.name = name;
  node.fontName = FONT;
  node.fontSize = 16;
  node.characters = characters;
  node.fills = [fill];
  if (style) await node.setTextStyleIdAsync(style.id);
  return node;
}

function place(node, parent, x, y) {
  parent.appendChild(node);
  node.x = x;
  node.y = y;
}

// ---- Main ----

async function buildSeedFrame(tokens, body) {
  const seed = figma.createFrame();
  seed.name = SEED_FRAME_NAME;
  seed.fills = [];

  // Row 1: color swatches
  let y = GAP;
  place(rectangle("Color close", SWATCH, solid("#665EFF")), seed, GAP, y);
  place(rectangle("Color far", SWATCH, solid("#00C853")), seed, GAP + (SWATCH + GAP), y);
  place(rectangle("Color bound", SWATCH, boundSolid(tokens.Purple)), seed, GAP + 2 * (SWATCH + GAP), y);

  // Row 2: auto-layout spacing frames
  y += SWATCH + GAP;
  const bad = autoLayoutFrame("Spacing bad", { top: 13, right: 22, bottom: 13, left: 22 }, tokens.Lavender);
  const good = autoLayoutFrame("Spacing good", { top: 16, right: 16, bottom: 16, left: 16 }, tokens.Lavender);
  place(bad, seed, GAP, y);
  place(good, seed, GAP + bad.width + GAP, y);

  // Row 3: text on a white background
  y += Math.max(bad.height, good.height) + GAP;
  const background = figma.createFrame();
  background.name = "Text background";
  background.fills = [boundSolid(tokens.White)];
  background.resize(360, 136);
  place(background, seed, GAP, y);
  place(await text("Text low contrast", "Low contrast text", boundSolid(tokens.Lavender), body), background, 16, 16);
  place(await text("Text no style", "Text with no style", boundSolid(tokens.Navy), null), background, 16, 56);
  place(await text("Text clean", "Clean text", boundSolid(tokens.Navy), body), background, 16, 96);

  const width = Math.max(GAP + 3 * SWATCH + 3 * GAP, GAP + bad.width + GAP + good.width + GAP, GAP + 360 + GAP);
  seed.resize(width, y + background.height + GAP);
  seed.x = Math.round(figma.viewport.center.x - width / 2);
  seed.y = Math.round(figma.viewport.center.y - seed.height / 2);
  return seed;
}

async function main() {
  await figma.loadFontAsync(FONT);
  const collection = await getOrCreateCollection();
  const tokens = await getOrCreateColorVariables(collection);
  const body = await getOrCreateBodyStyle();

  removeOldSeedFrames();
  const seed = await buildSeedFrame(tokens, body);

  figma.currentPage.selection = [seed];
  figma.viewport.scrollAndZoomIntoView([seed]);
  figma.notify("Tidy Tokens seed file created");
  figma.closePlugin();
}

main().catch((error) => {
  figma.closePlugin(`Seed failed: ${error && error.message ? error.message : error}`);
});
