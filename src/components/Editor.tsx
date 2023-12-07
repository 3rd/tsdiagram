import { ComponentProps, memo, useEffect } from "react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import { themes } from "../themes";

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
};

export const Editor = memo(({ source, onChange, theme }: EditorProps) => {
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme(
      "theme",
      themes[theme ?? "vsLight"] as Parameters<typeof monaco.editor.defineTheme>[1]
    );
    monaco.editor.setTheme("theme");

    const options = monaco.languages.typescript.typescriptDefaults.getCompilerOptions();
    options.target = monaco.languages.typescript.ScriptTarget.Latest;
    options.lib = ["esnext"];
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(options);
  }, [monaco, theme]);

  return (
    <MonacoEditor defaultLanguage="typescript" options={editorOptions} value={source} onChange={onChange} />
  );
});
