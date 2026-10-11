import { expect, it } from "vitest";
import { getSvgFrame } from "./svg-frame";

it("pads diagram bounds and translates off-origin content", () => {
  expect(getSvgFrame({ x: -20, y: 10, width: 80, height: 40 })).toEqual({
    width: 116,
    height: 76,
    offsetX: 38,
    offsetY: 8,
  });
});
