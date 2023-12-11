import { createStore, useStore } from "statelift";
import { z } from "zod";
import { themes } from "../themes";

const userOptionsSchema = z.object({
  panels: z.object({
    splitDirection: z.enum(["horizontal", "vertical"]).default("horizontal"),
  }),
  editor: z.object({
    theme: z.enum(Object.keys(themes) as [string, ...string[]]).default("vsLight"),
  }),
  renderer: z.object({
    direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
    autoFitView: z.boolean().default(true),
    theme: z.enum(["light", "dark"]).default("light"),
    enableMinimap: z.boolean().default(true),
  }),
});

export type UserOptions = z.infer<typeof userOptionsSchema> & {
  load: () => void;
  save: () => void;
};
export const optionsStore = createStore<UserOptions>({
  panels: {
    splitDirection: "horizontal",
  },
  editor: {
    theme: "vsLight",
  },
  renderer: {
    direction: "horizontal",
    autoFitView: true,
    theme: "light",
    enableMinimap: true,
  },
  load() {
    try {
      const data = JSON.parse(localStorage.getItem("options") ?? "");
      const parsedData = userOptionsSchema.parse(data);
      parsedData.renderer.autoFitView = true;
      this.panels = parsedData.panels;
      this.editor = parsedData.editor;
      this.renderer = parsedData.renderer;
    } catch {}
  },
  save() {
    localStorage.setItem(
      "options",
      JSON.stringify({
        panels: this.panels,
        editor: this.editor,
        renderer: this.renderer,
      })
    );
  },
});
optionsStore.state.load();
export const useUserOptions = () => useStore(optionsStore);
