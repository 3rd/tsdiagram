import { createStore, useStore } from "statelift";
import { z } from "zod";
import {
  DEFAULT_DIAGRAM_OPTIONS,
  diagramOptionsSchema,
  type DiagramOptions,
} from "@tsdiagram/renderer/options";

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
  renderer: diagramOptionsSchema,
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
  renderer: { ...DEFAULT_DIAGRAM_OPTIONS },
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

export const updateRendererOptions = (change: Partial<DiagramOptions>) => {
  Object.assign(optionsStore.state.renderer, change);
  optionsStore.state.save();
};

export const useUserOptions = () => useStore(optionsStore);
