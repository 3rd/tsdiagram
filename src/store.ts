import { createStore, useStore } from "statelift";

export type UserOptions = {
  renderer: {
    direction: "horizontal" | "vertical";
    autoFitView: boolean;
  };
};
export const optionsStore = createStore<UserOptions>({
  renderer: {
    direction: "horizontal",
    autoFitView: true,
  },
});
export const useOptions = () => useStore(optionsStore);
