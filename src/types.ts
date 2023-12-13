import { XYPosition } from "reactflow";

export enum Direction {
  None = 0,
  Top = 1,
  Right = 2,
  Bottom = 3,
  Left = 4,
}

export type PathSegment = { start: XYPosition; end: XYPosition; direction: Direction };
