import { DEFAULT_DELTA_E_THRESHOLD, prepareTokens } from "../core/nearestToken";
import { RuleContext } from "../core/rules/context";
import { runRules } from "../core/runRules";
import { computeScore } from "../core/score";
import { Issue, Snapshot } from "../core/types";
import { applyFix } from "./applyFix";
import { buildSnapshots, findNodes, Scope } from "./collect";
import { loadTokens } from "./tokens";

const SCOPES: Scope[] = ["selection", "page", "allPages"];
const GRID_SIZES = [4, 8];
const MIN_DELTA_E = 1;
const MAX_DELTA_E = 20;
const PREFS_KEY = "tidy-tokens-prefs";
const RULE_BATCH_SIZE = 1000;
const FIX_BATCH_SIZE = 200;

type Settings = { gridSize: number; deltaEThreshold: number };
type Prefs = { scope: Scope; settings: Settings };

const DEFAULT_PREFS: Prefs = {
  scope: "page",
  settings: { gridSize: 8, deltaEThreshold: DEFAULT_DELTA_E_THRESHOLD },
};

type UiMessage =
  | { type: "ready" }
  | { type: "savePrefs"; scope: unknown; settings: unknown }
  | { type: "scan"; scope: unknown; settings: unknown }
  | { type: "fix"; issueIds: unknown }
  | { type: "select"; nodeId: unknown }
  | { type: "cancel" };

type FixSummary = { succeeded: number; failures: string[] };
type Phase = "collect" | "rules" | "fix";

// Thrown between batches to stop a scan. Caught in scan(), so it never reaches the UI as an error.
class ScanCancelled extends Error {}

// The latest scan, so a fix request can look up issues by id and rescan with the same scope and settings
let lastScan: Prefs | null = null;
let issuesById = new Map<string, Issue>();
// Set by a cancel message, checked between scan batches, and reset when a scan starts
let cancelRequested = false;

figma.showUI(__html__, { width: 360, height: 560 });

// ---- Validation ----
// Values come from the UI or from storage, so neither is trusted. Anything invalid falls back to the default.

function validScope(value: unknown): Scope {
  return SCOPES.includes(value as Scope) ? (value as Scope) : DEFAULT_PREFS.scope;
}

function validSettings(value: unknown): Settings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof Settings, unknown>>;
  const grid = raw.gridSize;
  const delta = raw.deltaEThreshold;
  return {
    gridSize: typeof grid === "number" && GRID_SIZES.includes(grid) ? grid : DEFAULT_PREFS.settings.gridSize,
    deltaEThreshold:
      typeof delta === "number" && Number.isFinite(delta) && delta >= MIN_DELTA_E && delta <= MAX_DELTA_E
        ? delta
        : DEFAULT_PREFS.settings.deltaEThreshold,
  };
}

function validPrefs(scope: unknown, settings: unknown): Prefs {
  return { scope: validScope(scope), settings: validSettings(settings) };
}

// ---- Stored preferences ----

async function loadPrefs(): Promise<Prefs> {
  try {
    const stored = await figma.clientStorage.getAsync(PREFS_KEY);
    return validPrefs(stored?.scope, stored?.settings);
  } catch {
    return DEFAULT_PREFS;
  }
}

async function savePrefs(prefs: Prefs) {
  await figma.clientStorage.setAsync(PREFS_KEY, prefs);
}

// ---- Batching ----

// Reports progress, then gives Figma a turn so the UI repaints and new messages (like cancel) arrive
async function afterBatch(phase: Phase, done: number, total: number) {
  figma.ui.postMessage({ type: "progress", phase, done, total });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function afterScanBatch(phase: Phase, done: number, total: number) {
  await afterBatch(phase, done, total);
  if (cancelRequested) throw new ScanCancelled();
}

// runRules handles each snapshot on its own, so running it on slices gives the same issues in the same order
async function runRulesInBatches(snapshots: Snapshot[], context: RuleContext): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (let start = 0; start < snapshots.length; start += RULE_BATCH_SIZE) {
    const batch = snapshots.slice(start, start + RULE_BATCH_SIZE);
    for (const issue of runRules(batch, context)) issues.push(issue);
    await afterScanBatch("rules", Math.min(start + RULE_BATCH_SIZE, snapshots.length), snapshots.length);
  }
  return issues;
}

// ---- Scan ----

// fixes is the summary of a fix that ran just before this rescan, passed through so the UI can show it
async function scan(prefs: Prefs, fixes: FixSummary | null = null) {
  cancelRequested = false;
  if (prefs.scope === "selection" && figma.currentPage.selection.length === 0) {
    figma.ui.postMessage({ type: "emptySelection", fixes });
    return;
  }

  try {
    const start = Date.now();
    const tokens = await loadTokens();
    const findStart = Date.now();
    const nodes = await findNodes(prefs.scope);
    const snapshotStart = Date.now();
    const snapshots = await buildSnapshots(nodes, (done, total) => afterScanBatch("collect", done, total));
    const rulesStart = Date.now();
    const context: RuleContext = {
      colorTokens: prepareTokens(tokens.colorTokens),
      textStyles: tokens.textStyles,
      gridSize: prefs.settings.gridSize,
      deltaEThreshold: prefs.settings.deltaEThreshold,
    };
    const issues = await runRulesInBatches(snapshots, context);
    const summary = computeScore(snapshots, issues);
    const end = Date.now();
    const ms = end - start;

    console.log(
      `Tidy Tokens scan: find nodes ${snapshotStart - findStart}ms, build snapshots ${rulesStart - snapshotStart}ms, ` +
        `run rules ${end - rulesStart}ms, total ${ms}ms ` +
        `(${nodes.length} nodes, ${snapshots.length} snapshots, ${issues.length} issues)`,
    );

    lastScan = prefs;
    issuesById = new Map(issues.map((issue) => [issue.id, issue]));
    figma.ui.postMessage({
      type: "results",
      scope: prefs.scope,
      ms,
      summary,
      issues,
      fixes,
      colorTokenCount: tokens.colorTokens.length,
    });
  } catch (error) {
    if (!(error instanceof ScanCancelled)) throw error;
    // The previous results (and lastScan) are kept, so they stay usable after a cancel
    figma.ui.postMessage({ type: "cancelled", fixes });
  }
}

// ---- Fix ----

async function fixOne(id: string, result: FixSummary) {
  const issue = issuesById.get(id);
  if (!issue) {
    result.failures.push(`Issue ${id} is not in the latest scan.`);
    return;
  }
  if (!issue.fix) return;
  const outcome = await applyFix(issue.nodeId, issue.fix);
  if (outcome.ok) result.succeeded++;
  else result.failures.push(`${issue.nodeName}: ${outcome.reason}`);
}

// Applies fixes in order and in batches. A failed fix is recorded and the rest still run.
async function fix(issueIds: unknown) {
  if (lastScan === null) throw new Error("Scan before applying fixes.");
  if (!Array.isArray(issueIds)) throw new Error("Fix request is missing issue ids.");
  const ids = issueIds.map(String);
  const result: FixSummary = { succeeded: 0, failures: [] };
  try {
    for (let start = 0; start < ids.length; start += FIX_BATCH_SIZE) {
      const end = Math.min(start + FIX_BATCH_SIZE, ids.length);
      for (let i = start; i < end; i++) await fixOne(ids[i], result);
      await afterBatch("fix", end, ids.length);
    }
  } finally {
    // One click = one undo step, even if something above threw partway through
    figma.commitUndo();
  }
  await scan(lastScan, result);
}

// ---- Select and zoom ----

function pageOf(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE") current = current.parent;
  return current;
}

async function select(nodeId: unknown) {
  const node = typeof nodeId === "string" ? await figma.getNodeByIdAsync(nodeId) : null;
  const page = node ? pageOf(node) : null;
  // A removed node can still be returned briefly with no page, so treat that as missing too
  if (!node || !page || node.type === "PAGE" || node.type === "DOCUMENT") {
    figma.ui.postMessage({ type: "selectError", message: "That layer no longer exists. Scan again to refresh." });
    return;
  }
  if (page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

// ---- Messages ----

figma.ui.onmessage = async (msg: UiMessage) => {
  try {
    if (msg.type === "ready") {
      figma.ui.postMessage({ type: "prefs", ...(await loadPrefs()) });
    } else if (msg.type === "savePrefs") {
      await savePrefs(validPrefs(msg.scope, msg.settings));
    } else if (msg.type === "scan") {
      const prefs = validPrefs(msg.scope, msg.settings);
      await savePrefs(prefs);
      await scan(prefs);
    } else if (msg.type === "fix") {
      await fix(msg.issueIds);
    } else if (msg.type === "select") {
      await select(msg.nodeId);
    } else if (msg.type === "cancel") {
      cancelRequested = true;
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({ type: "error", message });
  }
};
