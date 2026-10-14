import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { parseModels } from "@tsdiagram/core";
import { Diagram, type DiagramProps } from "./Diagram";
import { DiagramProvider } from "../DiagramProvider";
import { DEFAULT_DIAGRAM_OPTIONS } from "../diagram-options";

const renderDiagram = (props: Pick<DiagramProps, "models" | "processingStatus" | "isSourceEmpty">) =>
  renderToStaticMarkup(
    <DiagramProvider>
      <Diagram
        {...props}
        documentId="test-document"
        options={DEFAULT_DIAGRAM_OPTIONS}
        onOptionsChange={() => {}}
      />
    </DiagramProvider>
  );

it("reports a failed parse instead of a successful empty result", () => {
  const html = renderDiagram({
    models: [],
    processingStatus: { status: "error", message: "Could not parse source" },
  });

  expect(html).toContain('role="alert"');
  expect(html).toContain("Could not parse source");
  expect(html).not.toContain("No supported declarations found");
  expect(html).not.toContain("This document is empty");
});

it("labels a retained graph as the last successful diagram when parsing fails", () => {
  const html = renderDiagram({
    models: parseModels("interface Entry { id: string }"),
    processingStatus: { status: "error", message: "Could not parse source" },
  });

  expect(html).toContain("Showing the last successful diagram.");
  expect(html).toContain("Could not parse source");
});

it.each([
  { isSourceEmpty: true, title: "This document is empty" },
  { isSourceEmpty: false, title: "No supported declarations found" },
])("shows '$title' for a successful empty graph", ({ isSourceEmpty, title }) => {
  const html = renderDiagram({ models: [], processingStatus: { status: "ready" }, isSourceEmpty });

  expect(html).toContain(title);
  expect(html).toContain("Declare an interface, type alias, class, enum, or function in the editor.");
  expect(html).not.toContain('role="alert"');
});

it("shows only loading while an empty source is still being parsed", () => {
  const html = renderDiagram({ models: [], processingStatus: { status: "pending" }, isSourceEmpty: true });

  expect(html).toContain("Loading diagram…");
  expect(html).not.toContain("This document is empty");
  expect(html).not.toContain("No supported declarations found");
  expect(html).not.toContain('role="alert"');
});

it("has no settled notice for a successful graph", () => {
  const html = renderDiagram({
    models: parseModels("interface Entry { id: string }"),
    processingStatus: { status: "ready" },
  });

  expect(html).not.toContain('role="status"');
  expect(html).not.toContain('role="alert"');
});
