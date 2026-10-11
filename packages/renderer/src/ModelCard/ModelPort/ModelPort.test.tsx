import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ModelPort } from "./ModelPort";

it("renders resolved port colors independently of the surrounding stylesheet", () => {
  const source = renderToStaticMarkup(<ModelPort type="source" color="#2468ac" paneColor="#ffffff" />);
  const target = renderToStaticMarkup(<ModelPort type="target" color="#2468ac" paneColor="#ffffff" />);

  expect(source.match(/fill="#ffffff"/g)).toHaveLength(2);
  expect(source).toContain('stroke="#2468ac"');
  expect(target).toContain('fill="#ffffff"');
  expect(target).toContain('fill="#2468ac"');
  expect(source + target).not.toContain("fill-pane");
  expect(source + target).not.toContain("var(");
});
