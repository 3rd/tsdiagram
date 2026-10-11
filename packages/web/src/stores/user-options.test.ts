import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("loads existing preferences and persists renderer patches in the same storage shape", async () => {
  const savedOptions = {
    general: { sidebarOpen: true },
    panels: { splitDirection: "vertical" },
    editor: { editingMode: "vim" },
    renderer: {
      direction: "vertical",
      autoFitView: false,
      theme: "dark",
      enableMinimap: false,
      badgeHubs: false,
      compactLayout: false,
      colorizeEdges: false,
    },
  };
  const storage = new Map([["options", JSON.stringify(savedOptions)]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });

  const { optionsStore, updateRendererOptions } = await import("./user-options");
  expect(optionsStore.state.renderer).toEqual({ ...savedOptions.renderer, autoFitView: true });

  updateRendererOptions({ direction: "horizontal", badgeHubs: true });

  const persisted = storage.get("options");
  expect(persisted).toBe(
    JSON.stringify({
      ...savedOptions,
      renderer: {
        ...savedOptions.renderer,
        direction: "horizontal",
        autoFitView: true,
        badgeHubs: true,
      },
    })
  );
});
