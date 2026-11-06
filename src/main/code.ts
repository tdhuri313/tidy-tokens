import { DEFAULT_DELTA_E_THRESHOLD, prepareTokens } from "../core/nearestToken";
import { RuleContext } from "../core/rules/context";
import { runRules } from "../core/runRules";
import { computeScore } from "../core/score";
import { Issue } from "../core/types";
import { applyFix } from "./applyFix";
import { collectSnapshots, Scope } from "./collect";
import { loadTokens } from "./tokens";

const GRID_SIZE = 8;
const SCOPES: Scope[] = ["selection", "page", "allPages"];

type UiMessage = { type: "scan"; scope: Scope } | { type: "fix"; issueIds: string[] };

type FixSummary = { succeeded: number; failures: string[] };

// The latest scan, so a fix request can look up issues by id and rescan the same scope
let lastScope: Scope | null = null;
let issuesById = new Map<string, Issue>();

figma.showUI(__html__, { width: 360, height: 520 });

async function scan(scope: Scope, fixes: FixSummary | null = null) {
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

  lastScope = scope;
  issuesById = new Map(issues.map((issue) => [issue.id, issue]));
  figma.ui.postMessage({ type: "results", scope, ms, summary, issues, fixes });
}

// Applies fixes in order. A failed fix is recorded and the rest still run.
async function fix(issueIds: string[]) {
  if (lastScope === null) throw new Error("Scan before applying fixes.");
  const result: FixSummary = { succeeded: 0, failures: [] };
  for (const id of issueIds) {
    const issue = issuesById.get(id);
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
  await scan(lastScope, result);
}

figma.ui.onmessage = async (msg: UiMessage) => {
  try {
    if (msg.type === "scan") {
      if (!SCOPES.includes(msg.scope)) throw new Error(`Unknown scan scope: ${msg.scope}`);
      await scan(msg.scope);
    } else if (msg.type === "fix") {
      await fix(msg.issueIds);
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({ type: "error", message });
  }
};
