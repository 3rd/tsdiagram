import { createStore, useStore } from "statelift";
import { z } from "zod";

const userOptionsSchema = z.object({
  general: z.object({
    sidebarOpen: z.boolean().default(true),
  }),
  panels: z.object({
    splitDirection: z.enum(["horizontal", "vertical"]).default("horizontal"),
  }),
  editor: z.object({
    editingMode: z.enum(["default", "vim"]).default("default"),
  }),
  renderer: z.object({
    direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
    autoFitView: z.boolean().default(true),
    theme: z.enum(["light", "dark"]).default("light"),
    enableMinimap: z.boolean().default(true),
    badgeHubs: z.boolean().default(true),
    compactLayout: z.boolean().default(true),
    colorizeEdges: z.boolean().default(true),
  }),
});

export type UserOptions = z.infer<typeof userOptionsSchema> & {
  load: () => void;
  save: () => void;
};
export const optionsStore = createStore<UserOptions>({
  general: {
    sidebarOpen: false,
  },
  panels: {
    splitDirection: "horizontal",
  },
  editor: {
    editingMode: "default",
  },
  renderer: {
    direction: "horizontal",
    autoFitView: true,
    theme: "light",
    enableMinimap: true,
    badgeHubs: true,
    compactLayout: true,
    colorizeEdges: true,
  },
  load() {
    try {
      const data = JSON.parse(localStorage.getItem("options") ?? "");
      const parsedData = userOptionsSchema.parse(data);
      parsedData.renderer.autoFitView = true;
      Object.assign(this, parsedData);
    } catch {}
  },
  save() {
    localStorage.setItem(
      "options",
      JSON.stringify({
        general: this.general,
        panels: this.panels,
        editor: this.editor,
        renderer: this.renderer,
      })
    );
  },
});
optionsStore.state.load();
export const useUserOptions = () => useStore(optionsStore);
