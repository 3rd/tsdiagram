declare module "monaco-vim" {
  export type InitVimModeResult = {
    dispose: () => void;
    on: (event: "vim-mode-change", callback: (args: { mode: string }) => void) => void;
  };
  export function initVimMode(
    editor: monaco.editor.IStandaloneCodeEditor,
    container: HTMLElement
  ): InitVimModeResult;
}
