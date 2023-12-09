import { ComponentProps, memo, useEffect, useRef } from "react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import { InitVimModeResult, initVimMode } from "monaco-vim";
import { themes } from "../themes";

type MonacoMountHandler = ComponentProps<typeof MonacoEditor>["onMount"];
type IStandaloneCodeEditor = Parameters<Exclude<MonacoMountHandler, undefined>>[0];

const editorOptions: ComponentProps<typeof MonacoEditor>["options"] = {
  minimap: { enabled: false },
  renderLineHighlight: "none",
  fontSize: 15,
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
  },
};

export type EditorProps = {
  source: string;
  onChange: (source?: string) => void;
  theme?: keyof typeof themes;
  editingMode?: "default" | "vim";
};

export const Editor = memo(({ source, onChange, theme, editingMode }: EditorProps) => {
  const monaco = useMonaco();
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const vimModeRef = useRef<InitVimModeResult | null>(null);
  const vimStatusLineRef = useRef<HTMLDivElement>(null);

  const isVimMode = editingMode === "vim";

  useEffect(() => {
    if (!monaco) return;
    const themeConfig = themes[theme ?? "vsLight"] as Parameters<typeof monaco.editor.defineTheme>[1];
    monaco.editor.defineTheme("theme", themeConfig);
    monaco.editor.setTheme("theme");
  }, [monaco, theme]);

  const handleMount: MonacoMountHandler = (mountedEditor, mountedMonaco) => {
    editorRef.current = mountedEditor;

    const compilerOptions = mountedMonaco.languages.typescript.typescriptDefaults.getCompilerOptions();
    compilerOptions.target = mountedMonaco.languages.typescript.ScriptTarget.Latest;
    compilerOptions.lib = ["esnext"];
    mountedMonaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    mountedEditor.layout();

    if (isVimMode) {
      vimModeRef.current = initVimMode(mountedEditor, document.createElement("div"));
    }
  };

  useEffect(() => {
    if (isVimMode) {
      if (vimModeRef.current) return;
      if (!editorRef.current) throw new Error("Tried to initialize vim mode before the editor was mounted.");
      vimModeRef.current = initVimMode(editorRef.current, document.createElement("div"));
    } else {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    }
  }, [isVimMode]);

  return (
    <>
      <MonacoEditor
        defaultLanguage="typescript"
        options={editorOptions}
        value={source}
        onChange={onChange}
        onMount={handleMount}
      />
      {isVimMode && <div ref={vimStatusLineRef} />}
    </>
  );
});
