declare module "monaco-vim" {
  export type InitVimModeResult = {
    dispose: () => void;
  };
  export function initVimMode(
    editor: monaco.editor.IStandaloneCodeEditor,
    container: HTMLElement
  ): InitVimModeResult;
}
