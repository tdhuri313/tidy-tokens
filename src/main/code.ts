import { DEFAULT_DELTA_E_THRESHOLD, prepareTokens } from "../core/nearestToken";
import { RuleContext } from "../core/rules/context";
import { runRules } from "../core/runRules";
import { computeScore } from "../core/score";
import { collectSnapshots, Scope } from "./collect";
import { loadTokens } from "./tokens";

const GRID_SIZE = 8;
const SCOPES: Scope[] = ["selection", "page", "allPages"];

type ScanMessage = { type: "scan"; scope: Scope };

figma.showUI(__html__, { width: 360, height: 520 });

async function scan(scope: Scope) {
  const start = Date.now();
  const tokens = await loadTokens();
  const snapshots = await collectSnapshots(scope);
  const context: RuleContext = {
    colorTokens: prepareTokens(tokens.colorTokens),
    textStyles: tokens.textStyles,
    gridSize: GRID_SIZE,
    deltaEThreshold: DEFAULT_DELTA_E_THRESHOLD,
  };
  const issues = runRules(snapshots, context);
  const summary = computeScore(snapshots, issues);
  const ms = Date.now() - start;

  console.log(`Tidy Tokens: scanned ${snapshots.length} layers in ${ms}ms`);
  console.log("Score summary", summary);
  for (const issue of issues) console.log(issue);

  figma.ui.postMessage({ type: "results", scope, ms, summary, issues });
}

figma.ui.onmessage = async (msg: ScanMessage) => {
  if (msg.type !== "scan") return;
  try {
    if (!SCOPES.includes(msg.scope)) throw new Error(`Unknown scan scope: ${msg.scope}`);
    await scan(msg.scope);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({ type: "error", message });
  }
};
