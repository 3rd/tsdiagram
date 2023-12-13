import { ComponentProps, memo, useCallback, useEffect, useRef } from "react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import { InitVimModeResult, initVimMode } from "monaco-vim";
import { themes } from "../themes";
import { useDocuments } from "../stores/documents";

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
  theme?: keyof typeof themes;
  editingMode?: "default" | "vim";
};

export const Editor = memo(({ theme, editingMode }: EditorProps) => {
  const documents = useDocuments();
  const monaco = useMonaco();
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const vimModeRef = useRef<InitVimModeResult | null>(null);
  const vimStatusLineRef = useRef<HTMLDivElement>(null);

  const isVimMode = editingMode === "vim";

  const handleSourceChange = useCallback(
    (value: string | undefined) => {
      documents.currentDocument.source = value ?? "";
      documents.save();
    },
    [documents]
  );

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
    mountedEditor.updateOptions({ tabSize: 2, cursorStyle: isVimMode ? "block" : "line" });

    if (isVimMode) {
      if (!vimStatusLineRef.current) throw new Error("vimStatusLineRef.current is null");
      vimModeRef.current = initVimMode(mountedEditor, vimStatusLineRef.current);
      vimModeRef.current.on("vim-mode-change", ({ mode }) => {
        if (!editorRef.current) return;
        mountedEditor.updateOptions({ cursorStyle: mode === "insert" ? "line" : "block" });
      });
    }
  };

  useEffect(() => {
    if (isVimMode) {
      if (vimModeRef.current) return;
      if (!editorRef.current) return;
      if (!vimStatusLineRef.current) return;
      vimModeRef.current = initVimMode(editorRef.current, vimStatusLineRef.current);
      editorRef.current.updateOptions({ cursorStyle: "block" });
    } else {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
      editorRef.current?.updateOptions({ cursorStyle: "line" });
    }
  }, [isVimMode]);

  return (
    <div className="flex flex-col h-full">
      <MonacoEditor
        defaultLanguage="typescript"
        options={editorOptions}
        value={documents.currentDocument.source}
        onChange={handleSourceChange}
        onMount={handleMount}
      />
      {isVimMode && <div ref={vimStatusLineRef} className="text-sm text-gray-900 bg-gray-100 vim-status" />}
    </div>
  );
});
