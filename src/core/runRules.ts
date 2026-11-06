import { Issue, Snapshot } from "./types";
import { RuleContext } from "./rules/context";
import { hardcodedColor } from "./rules/hardcodedColor";
import { offGridSpacing } from "./rules/offGridSpacing";
import { lowContrast } from "./rules/lowContrast";
import { textStyle } from "./rules/textStyle";

type Rule = (snapshot: Snapshot, context: RuleContext) => Issue[];

// Issues come out in this order for each snapshot
const RULES: Rule[] = [hardcodedColor, offGridSpacing, lowContrast, textStyle];

export function runRules(snapshots: Snapshot[], context: RuleContext): Issue[] {
  const issues: Issue[] = [];
  for (const snapshot of snapshots) {
    for (const rule of RULES) {
      issues.push(...rule(snapshot, context));
    }
  }
  return issues;
}
