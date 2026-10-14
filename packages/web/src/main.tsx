import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { RecoveryBoundary } from "./components/RecoveryBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RecoveryBoundary region="application">
      <App />
    </RecoveryBoundary>
  </React.StrictMode>
);

if (import.meta.env.PROD) {
  document.addEventListener("DOMContentLoaded", () => {
    const umamiScript = document.createElement("script");
    umamiScript.src = "https://umami.dev.pet/script.js";
    umamiScript.dataset.websiteId = "4c0a2abe-8e94-4a06-89b4-0915ffd69018";
    umamiScript.dataset.excludeHash = "true";
    umamiScript.defer = true;
    document.head.append(umamiScript);
  });
}
