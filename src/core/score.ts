import { Issue, RuleName, Snapshot } from "./types";

export type ScoreSummary = {
  score: number | null; // null when nothing was checkable, so the UI doesn't show a false 100%
  checkedLayers: number;
  cleanLayers: number;
  issueCount: number;
  countsByRule: Record<RuleName, number>;
};

function isCheckable(snapshot: Snapshot): boolean {
  return snapshot.paints.length > 0 || snapshot.layout !== null || snapshot.text !== null;
}

function countByRule(issues: Issue[]): Record<RuleName, number> {
  const counts: Record<RuleName, number> = {
    hardcodedColor: 0,
    offGridSpacing: 0,
    lowContrast: 0,
    textStyle: 0,
  };
  for (const issue of issues) counts[issue.rule]++;
  return counts;
}

export function computeScore(snapshots: Snapshot[], issues: Issue[]): ScoreSummary {
  // A Set, so a layer with several issues is only counted once
  const flaggedIds = new Set(issues.map((issue) => issue.nodeId));
  const checkable = snapshots.filter(isCheckable);
  const cleanLayers = checkable.filter((snapshot) => !flaggedIds.has(snapshot.id)).length;
  const checkedLayers = checkable.length;
  return {
    // Floor so any issue keeps the score below 100. Multiply before dividing:
    // 29 / 100 * 100 is 28.999... in floating point, but 29 * 100 / 100 is exactly 29.
    score: checkedLayers === 0 ? null : Math.floor((cleanLayers * 100) / checkedLayers),
    checkedLayers,
    cleanLayers,
    issueCount: issues.length,
    countsByRule: countByRule(issues),
  };
}
