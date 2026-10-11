import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ModelCardHandle } from "./ModelCardHandle";

it("marks a source handle with its port id and side around the default port graphic", () => {
  const html = renderToStaticMarkup(<ModelCardHandle id="Item-source" type="source" />);

  expect(html).toContain('class="react-flow__handle react-flow__handle-right"');
  expect(html).toContain('data-port-id="Item-source"');
  expect(html).toContain('data-port-type="source"');
  expect(html).toContain('class="fill-pane"');
  expect(html).toContain('stroke="var(--color-accent)"');
});
