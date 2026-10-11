import { renderToStaticMarkup } from "react-dom/server";
import { assert, expect, it } from "vitest";
import { parseModels } from "@tsdiagram/core";
import { ModelCard } from "./index";

it("renders parameter initializers beside model references and primitive types", () => {
  const models = parseModels(`
    interface Item { id: string }
    function use(item: Item = { id: "new" }, count: number, label = "ready"): void {}
  `);
  const model = models.find((candidate) => candidate.name === "use");
  assert.exists(model);

  const html = renderToStaticMarkup(<ModelCard model={model} badgeHubIds={new Set()} />);
  const text = html.replace(/<[^>]*>/g, "");

  expect(text).toContain(
    "(item: Item = { id: &quot;new&quot; }, count: number, label?: string = &quot;ready&quot;)"
  );
});

it("renders rich card text and badge references without a diagram provider", () => {
  const models = parseModels(`
    type Id = string;
    interface Parent { parent: number }
    interface Box<T extends Parent = Parent> extends Parent {
      optional?: Id;
      readonly list: readonly Id[];
      options: Id | null;
      map: Map<string, Id>;
      call<U extends Parent>(value?: Id, ...others: Id[]): readonly Id[];
    }
  `);
  const model = models.find((candidate) => candidate.name === "Box");
  assert.exists(model);

  const html = renderToStaticMarkup(<ModelCard model={model} badgeHubIds={new Set(["Id"])} />);
  const text = html.replace(/<[^>]*>/g, "");

  expect(html).toContain("<table><tbody>");
  expect(html.match(/<tr /g)).toHaveLength(model.schema.length);
  expect(text).toContain("Box&lt;T extends Parent = Parent&gt; extends Parent");
  expect(text).toContain("optional?string");
  expect(text).toContain("readonly listreadonly Id[]");
  expect(text).toContain("optionsstring | null");
  expect(text).toContain("mapMap&lt;string, Id&gt;");
  expect(text).toContain(
    "call&lt;U extends Parent&gt;(value?: string | undefined, ...others: Id[])readonly Id[]"
  );
  expect(html).toContain('<span class="text-text-faint">parent</span>');
  expect(html).toContain("bg-inset text-accent");
  expect(html).toContain('data-port-id="Box-source"');
});

it("places one shared overload port on the first row and removes it for a badge hub", () => {
  const models = parseModels(`
    type Id = string;
    class Reader {
      read(): void;
      read(id: Id): Id;
      read(id?: Id) { return id; }
    }
  `);
  const model = models.find((candidate) => candidate.name === "Reader");
  assert.exists(model);

  const html = renderToStaticMarkup(<ModelCard model={model} badgeHubIds={new Set()} />);
  const rows = html.match(/<tr .*?<\/tr>/g);
  assert.exists(rows);

  expect(rows).toHaveLength(2);
  expect(rows[0]).toContain('data-port-id="Reader-source-read"');
  expect(rows[1]).not.toContain("data-port-id");

  const badgeHtml = renderToStaticMarkup(<ModelCard model={model} badgeHubIds={new Set(["Id"])} />);

  expect(badgeHtml).not.toContain('data-port-id="Reader-source-read"');
  expect(badgeHtml).toContain("bg-inset text-accent");
});

it.each([
  ["none", "bg-pane border-border", "bg-brand"],
  ["selected", "bg-node-selected border-accent", "bg-brand-strong"],
  ["highlighted", "bg-pane border-accent", "bg-brand"],
  ["dimmed", "bg-pane border-border opacity-50", "bg-brand"],
] as const)("styles an empty card for the %s decoration", (decoration, cardClass, headerClass) => {
  const [model] = parseModels("interface Empty {}");
  const html = renderToStaticMarkup(
    <ModelCard model={model} badgeHubIds={new Set()} decoration={decoration} />
  );

  expect(html).toContain(cardClass);
  expect(html).toContain(`${headerClass} -mb-px rounded-b-lg`);
  expect(html).not.toContain("<table>");
});
