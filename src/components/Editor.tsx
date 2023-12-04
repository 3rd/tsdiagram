import { ComponentProps, useEffect } from "react";
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

export const Editor = ({ source, onChange, theme }: EditorProps) => {
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme(
      "theme",
      themes[theme ?? "vsLight"] as Parameters<typeof monaco.editor.defineTheme>[1]
    );
    monaco.editor.setTheme("theme");
  }, [monaco, theme]);

  return (
    <MonacoEditor defaultLanguage="typescript" options={editorOptions} value={source} onChange={onChange} />
  );
};
