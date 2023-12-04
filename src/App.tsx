import { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import classNames from "classnames";
import { Header } from "./components/Header";
import { Editor } from "./components/Editor";
import { Renderer } from "./components/Renderer";
import { Preferences } from "./components/Preferences";
import { useDocuments, useOptions } from "./store";
import type { themes } from "./themes";
import "./App.css";

function App() {
  const documents = useDocuments();
  const options = useOptions();
  const [showPreferences, setShowPreferences] = useState(false);

  const handleSourceChange = (value: string | undefined) => {
    documents.currentDocument.source = value ?? "";
    documents.save();
  };

  const handlePreferencesClick = () => {
    setShowPreferences((value) => !value);
  };

  return (
    <ReactFlowProvider>
      <div className="flex overflow-hidden flex-col w-full h-full rounded bg-stone-700 text-stone-50">
        <Header onPreferencesClick={handlePreferencesClick} />
        <main className="flex flex-1">
          <PanelGroup autoSaveId="example" direction="horizontal">
            <Panel defaultSizePercentage={50} id="editor">
              <Editor
                source={documents.currentDocument.source}
                theme={options.editor.theme as keyof typeof themes}
                onChange={handleSourceChange}
              />
            </Panel>
            <PanelResizeHandle
              className={classNames(
                "w-1.5",
                { "bg-stone-600": options.renderer.theme === "dark" },
                { "bg-stone-200": options.renderer.theme === "light" }
              )}
            />
            <Panel id="renderer">
              <Renderer source={documents.currentDocument.source} />
            </Panel>
          </PanelGroup>
          ;
        </main>
        <Preferences isOpen={showPreferences} onClose={handlePreferencesClick} />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
