import Editor, { useMonaco } from "@monaco-editor/react";
import tomorrowTheme from "./theme.json";
import { useEffect, useState } from "react";
import "./App.css";
import { BasicRenderer } from "./components/BasicRenderer";
import { Renderer } from "./components/Renderer";
import { ReactFlowProvider } from "reactflow";

// https://www.npmjs.com/package/monaco-themes

const a = `
type Node = {
  id: string;
  name: string;
  children?: Node[];
  x: () => void;
};
`.trim();

const b = `
interface Node {
  id: string;
  path: string;
  source: string;
  get meta(): Record<string, unknown>;
  get title(): string;
  get links(): Node[];
  get backlinks(): Node[];
  get tasks(): Task[];
};

interface Task {
  title: string;
  children: Task[];
  status: "default" | "active" | "done" | "cancelled";
  schedule: TaskSchedule;
  sessions: TaskSession[];
  get isInProgress(): boolean;
}

interface TaskSchedule {
  start: Date;
  end: Date;
  get duration(): number;
  get isCurrent(): boolean;
}

interface TaskSession {
  start: Date;
  end?: Date;
  get duration(): number;
  get isCurrent(): boolean;
}
`.trim();

const defaultValue = b;

function App() {
  const monaco = useMonaco();
  const [source, setSource] = useState(defaultValue);

  const handleChange = (value: string | undefined) => {
    setSource(value ?? "");
  };

  useEffect(() => {
    if (!monaco) return;

    monaco.editor.defineTheme("tomorrow", tomorrowTheme as Parameters<typeof monaco.editor.defineTheme>[1]);
    monaco.editor.setTheme("tomorrow");

    // monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    //   jsx: monaco.languages.typescript.JsxEmit.React,
    // });
  }, [monaco]);

  return (
    <div className="flex overflow-hidden w-full h-full text-gray-800 bg-gray-100 rounded">
      <div className="w-1/2">
        <Editor
          defaultLanguage="typescript"
          options={{
            minimap: { enabled: false },
            renderLineHighlight: "none",
            fontSize: 15,
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
            },
          }}
          value={source}
          onChange={handleChange}
        />
      </div>
      <div className="flex flex-1 p-2 border-l">
        {/* <BasicRenderer source={source} /> */}
        <ReactFlowProvider>
          <Renderer source={source} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

export default App;
