import { TextStyleToken } from "../types";
import { LabToken } from "../nearestToken";

export type RuleContext = {
  colorTokens: LabToken[];
  textStyles: TextStyleToken[];
  gridSize: number;
  deltaEThreshold: number;
};
