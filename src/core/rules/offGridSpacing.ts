import { Issue, LayoutInfo, Snapshot, SpacingProperty } from "../types";
import { RuleContext } from "./context";

// Tolerance so tiny decimal errors (like 16.0000001) aren't flagged
const EPSILON = 0.001;

const PROPERTY_LABELS: Record<SpacingProperty, string> = {
  paddingTop: "Padding top",
  paddingRight: "Padding right",
  paddingBottom: "Padding bottom",
  paddingLeft: "Padding left",
  itemSpacing: "Item spacing",
};

const PROPERTIES = Object.keys(PROPERTY_LABELS) as SpacingProperty[];

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function isOnGrid(value: number, gridSize: number): boolean {
  return Math.abs(value - snapToGrid(value, gridSize)) <= EPSILON;
}

function makeIssue(
  snapshot: Snapshot,
  layout: LayoutInfo,
  property: SpacingProperty,
  gridSize: number,
): Issue {
  const value = layout[property];
  const fixedValue = snapToGrid(value, gridSize);
  return {
    id: `${snapshot.id}:offGridSpacing:${property}`,
    nodeId: snapshot.id,
    nodeName: snapshot.name,
    rule: "offGridSpacing",
    message: `${PROPERTY_LABELS[property]} is ${value}, which is off the ${gridSize}px grid. Round to ${fixedValue}.`,
    severity: "warning",
    fix: { type: "setSpacing", property, value: fixedValue },
    suggestion: null,
  };
}

export function offGridSpacing(snapshot: Snapshot, context: RuleContext): Issue[] {
  const layout = snapshot.layout;
  const gridSize = context.gridSize;
  if (layout === null || !(gridSize > 0)) return [];
  return PROPERTIES.filter((property) => !isOnGrid(layout[property], gridSize)).map(
    (property) => makeIssue(snapshot, layout, property, gridSize),
  );
}
