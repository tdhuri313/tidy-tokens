// Figma stores color channels as floats from 0 to 1
export type RGB = { r: number; g: number; b: number };

export type Paint = {
  kind: "fill" | "stroke";
  index: number; // position in the node's fills or strokes
  color: RGB | null; // null means not a solid color, like a gradient
  opacity: number;
  isBound: boolean; // true if it already uses a variable or style
};

export type LayoutInfo = {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  itemSpacing: number;
};

export type TextInfo = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  hasTextStyle: boolean;
  isMixed: boolean; // true if one text layer has mixed formatting
  background: RGB | null; // nearest solid background behind the text
};

// A plain copy of a Figma layer, so rules never touch the Figma API
export type Snapshot = {
  id: string;
  name: string;
  type: string;
  paints: Paint[];
  layout: LayoutInfo | null; // null if not an auto-layout frame
  text: TextInfo | null; // null if not a text layer
};

export type ColorToken = {
  id: string;
  name: string;
  rgb: RGB;
};

export type TextStyleToken = {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
};

export type SpacingProperty = keyof LayoutInfo;

export type Fix =
  | { type: "bindColor"; paintKind: Paint["kind"]; paintIndex: number; tokenId: string }
  | { type: "setSpacing"; property: SpacingProperty; value: number }
  | { type: "applyTextStyle"; styleId: string };

export type RuleName =
  | "hardcodedColor"
  | "offGridSpacing"
  | "lowContrast"
  | "textStyle";

export type Issue = {
  id: string;
  nodeId: string;
  nodeName: string;
  rule: RuleName;
  message: string;
  severity: "error" | "warning";
  fix: Fix | null; // null means nothing can be auto-applied
  suggestion: string | null; // used for contrast, where the designer decides
};
