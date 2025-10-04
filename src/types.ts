import { XYPosition } from "reactflow";

export enum Direction {
  Bottom = 3,
  Left = 4,
  None = 0,
  Right = 2,
  Top = 1,
}

export type PathSegment = { start: XYPosition; end: XYPosition; direction: Direction };
