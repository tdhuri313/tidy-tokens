import { DEFAULT_DELTA_E_THRESHOLD, prepareTokens } from "../core/nearestToken";
import { RuleContext } from "../core/rules/context";
import { runRules } from "../core/runRules";
import { computeScore } from "../core/score";
import { Issue } from "../core/types";
import { applyFix } from "./applyFix";
import { collectSnapshots, Scope } from "./collect";
import { loadTokens } from "./tokens";

const SCOPES: Scope[] = ["selection", "page", "allPages"];
const GRID_SIZES = [4, 8];
const MIN_DELTA_E = 1;
const MAX_DELTA_E = 20;
const PREFS_KEY = "tidy-tokens-prefs";

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
  | { type: "select"; nodeId: unknown };

type FixSummary = { succeeded: number; failures: string[] };

// The latest scan, so a fix request can look up issues by id and rescan with the same scope and settings
let lastScan: Prefs | null = null;
let issuesById = new Map<string, Issue>();

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

// ---- Scan ----

async function scan(prefs: Prefs, fixes: FixSummary | null = null) {
  const start = Date.now();
  const tokens = await loadTokens();
  const snapshots = await collectSnapshots(prefs.scope);
  const context: RuleContext = {
    colorTokens: prepareTokens(tokens.colorTokens),
    textStyles: tokens.textStyles,
    gridSize: prefs.settings.gridSize,
    deltaEThreshold: prefs.settings.deltaEThreshold,
  };
  const issues = runRules(snapshots, context);
  const summary = computeScore(snapshots, issues);
  const ms = Date.now() - start;

  lastScan = prefs;
  issuesById = new Map(issues.map((issue) => [issue.id, issue]));
  figma.ui.postMessage({ type: "results", scope: prefs.scope, ms, summary, issues, fixes });
}

// ---- Fix ----

// Applies fixes in order. A failed fix is recorded and the rest still run.
async function fix(issueIds: unknown) {
  if (lastScan === null) throw new Error("Scan before applying fixes.");
  if (!Array.isArray(issueIds)) throw new Error("Fix request is missing issue ids.");
  const result: FixSummary = { succeeded: 0, failures: [] };
  for (const id of issueIds) {
    const issue = issuesById.get(String(id));
    if (!issue) {
      result.failures.push(`Issue ${id} is not in the latest scan.`);
      continue;
    }
    if (!issue.fix) continue;
    const outcome = await applyFix(issue.nodeId, issue.fix);
    if (outcome.ok) result.succeeded++;
    else result.failures.push(`${issue.nodeName}: ${outcome.reason}`);
  }
  // One click = one undo step
  figma.commitUndo();
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
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({ type: "error", message });
  }
};
