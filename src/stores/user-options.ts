// import { createStore, useStore } from "statelift";
import { z } from "zod";
import { proxy, useSnapshot } from "valtio";
import { themes } from "../themes";

const userOptionsSchema = z.object({
  general: z.object({
    sidebarOpen: z.boolean().default(true),
  }),
  panels: z.object({
    splitDirection: z.enum(["horizontal", "vertical"]).default("horizontal"),
  }),
  editor: z.object({
    theme: z.enum(Object.keys(themes) as [string, ...string[]]).default("vsLight"),
    editingMode: z.enum(["default", "vim"]).default("default"),
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
export const optionsStore = proxy<UserOptions>({
  general: {
    sidebarOpen: false,
  },
  panels: {
    splitDirection: "horizontal",
  },
  editor: {
    theme: "vsLight",
    editingMode: "default",
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
      Object.assign(optionsStore, parsedData);
    } catch {}
  },
  save() {
    localStorage.setItem(
      "options",
      JSON.stringify({
        general: optionsStore.general,
        panels: optionsStore.panels,
        editor: optionsStore.editor,
        renderer: optionsStore.renderer,
      })
    );
  },
});
optionsStore.load();

export const useUserOptions = () => useSnapshot(optionsStore);
