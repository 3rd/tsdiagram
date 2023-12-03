import { useEffect, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import tomorrowTheme from "./theme.json";
import { Renderer } from "./components/Renderer";
import { ReactFlowProvider } from "reactflow";
import "./App.css";
import { Header } from "./components/Header";

const defaultValue = `
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

function App() {
  const monaco = useMonaco();
  const [source, setSource] = useState(defaultValue);

  const handleSourceChange = (value: string | undefined) => {
    setSource(value ?? "");
  };

  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme("tomorrow", tomorrowTheme as Parameters<typeof monaco.editor.defineTheme>[1]);
    monaco.editor.setTheme("tomorrow");
  }, [monaco]);

  return (
    <ReactFlowProvider>
      <div className="flex overflow-hidden flex-col w-full h-full rounded bg-stone-700 text-stone-50">
        <Header />
        <main className="flex flex-1">
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
              onChange={handleSourceChange}
            />
          </div>
          <div className="flex flex-1 p-2 border-l bg-stone-50 text-stone-900">
            {/* <BasicRenderer source={source} /> */}
            <Renderer source={source} />
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}

export default App;
