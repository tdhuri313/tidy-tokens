// Development-only plugin: fills a "Stress <size>" page with copies of the
// Tidy Tokens seed frame so the scanner can be timed on large files.
// Plain JavaScript, no build step. Run Tidy Tokens Test Seed first.

const SEED_FRAME_NAME = "Tidy Tokens Seed";
const GAP = 64;

async function getOrCreatePage(name) {
  const existing = figma.root.children.find((page) => page.name === name);
  if (existing) {
    await existing.loadAsync();
    return existing;
  }
  const page = figma.createPage();
  page.name = name;
  return page;
}

function clearPage(page) {
  // Copy the list first: removing while iterating page.children skips nodes
  for (const node of [...page.children]) node.remove();
}

async function main() {
  const target = Number(figma.command);
  if (!Number.isFinite(target) || target <= 0) {
    figma.closePlugin(`Unknown size: ${figma.command}`);
    return;
  }

  const seed = figma.currentPage.children.find(
    (node) => node.type === "FRAME" && node.name === SEED_FRAME_NAME,
  );
  if (!seed) {
    figma.notify("No seed frame found. Run Tidy Tokens Test Seed on this page first.");
    figma.closePlugin();
    return;
  }

  const pageName = `Stress ${target}`;
  const page = await getOrCreatePage(pageName);
  if (page === figma.currentPage) {
    figma.notify(`Run this from the page with the seed frame, not "${pageName}".`);
    figma.closePlugin();
    return;
  }
  clearPage(page);

  // findAll returns descendants only, so add 1 for the seed frame itself
  const layersPerCopy = seed.findAll().length + 1;
  const copies = Math.ceil(target / layersPerCopy);
  const columns = Math.ceil(Math.sqrt(copies));
  const cellWidth = seed.width + GAP;
  const cellHeight = seed.height + GAP;

  for (let i = 0; i < copies; i++) {
    const copy = seed.clone();
    copy.name = `${SEED_FRAME_NAME} ${i + 1}`;
    page.appendChild(copy);
    copy.x = (i % columns) * cellWidth;
    copy.y = Math.floor(i / columns) * cellHeight;
  }

  await figma.setCurrentPageAsync(page);
  figma.viewport.scrollAndZoomIntoView(page.children);
  const total = copies * layersPerCopy;
  figma.notify(`${pageName}: ${total.toLocaleString()} layers (${copies} copies of ${layersPerCopy})`);
  figma.closePlugin();
}

main().catch((error) => {
  figma.closePlugin(`Stress test failed: ${error && error.message ? error.message : error}`);
});
