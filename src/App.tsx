import { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { Header } from "./components/Header";
import { Editor } from "./components/Editor";
import { Renderer } from "./components/Renderer";
import { Preferences } from "./components/Preferences";
import { useDocuments, useOptions } from "./store";
import type { themes } from "./themes";
import "./App.css";
import { Panels } from "./components/Panels";
import { useIsMobile } from "./hooks/useIsMobile";

function App() {
  const [showPreferences, setShowPreferences] = useState(false);
  const documents = useDocuments();
  const options = useOptions();
  const isMobile = useIsMobile();

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
          <Panels
            editorChildren={
              <Editor
                source={documents.currentDocument.source}
                theme={options.editor.theme as keyof typeof themes}
                onChange={handleSourceChange}
              />
            }
            options={options}
            rendererChildren={
              <Renderer disableMiniMap={isMobile} source={documents.currentDocument.source} />
            }
          />
        </main>
        <Preferences isOpen={showPreferences} onClose={handlePreferencesClick} />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
