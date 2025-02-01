import { useCallback, useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { Header } from "./components/Header";
import { Panels } from "./components/Panels";
import { Editor } from "./components/Editor";
import { RendererWrapper } from "./components/Renderer";
import { Preferences } from "./components/Preferences";
import { Share } from "./components/Share";
import { Sidebar } from "./components/Sidebar";
import { useUserOptions } from "./stores/user-options";
import "./App.css";
import { Toaster } from "react-hot-toast";

function App() {
  const [showPreferences, setShowPreferences] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const options = useUserOptions();

  const handlePreferencesClick = useCallback(() => {
    setShowPreferences((value) => !value);
  }, []);

  const handleShareClick = useCallback(() => {
    setShowShare((value) => !value);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="flex overflow-hidden flex-col w-full h-full">
        <Header onPreferencesClick={handlePreferencesClick} onShareClick={handleShareClick} />
        <main className="flex flex-1">
          {options.general.sidebarOpen && <Sidebar />}
          <Panels editorChildren={<Editor />} rendererChildren={<RendererWrapper />} />
        </main>
        <Toaster
          position="bottom-left"
          reverseOrder={false}
          gutter={8}
          toastOptions={{
            duration: 3000,
            style: {
              background: "#1e3a8a",
              color: "#fff",
            },
          }}
        />
        <Preferences isOpen={showPreferences} onClose={handlePreferencesClick} />
        <Share isOpen={showShare} onClose={handleShareClick} />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
