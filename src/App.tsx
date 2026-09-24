import { useCallback, useLayoutEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Editor } from "./components/Editor";
import { Header } from "./components/Header";
import { Panels } from "./components/Panels";
import { Preferences } from "./components/Preferences";
import { RendererWrapper } from "./components/Renderer";
import { Share } from "./components/Share";
import { Sidebar } from "./components/Sidebar";
import { useUserOptions } from "./stores/user-options";
import "./App.css";

function App() {
  const [showPreferences, setShowPreferences] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const options = useUserOptions();

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = options.renderer.theme;
    const canvasColor = getComputedStyle(document.documentElement).getPropertyValue("--color-canvas");
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    themeColorMeta?.setAttribute("content", canvasColor);
  }, [options.renderer.theme]);

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
        <main className="flex flex-1 overflow-hidden">
          {options.general.sidebarOpen && <Sidebar />}
          <Panels editorChildren={<Editor />} rendererChildren={<RendererWrapper />} />
        </main>
        <Preferences isOpen={showPreferences} onClose={handlePreferencesClick} />
        <Share isOpen={showShare} onClose={handleShareClick} />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
