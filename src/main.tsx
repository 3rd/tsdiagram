import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (process.env.NODE_ENV !== "development") {
  document.addEventListener("DOMContentLoaded", () => {
    const umamiScript = document.createElement("script");
    umamiScript.src = "https://umami.dev.pet/script.js";
    umamiScript.dataset.websiteId = "4c0a2abe-8e94-4a06-89b4-0915ffd69018";
    umamiScript.defer = true;
    document.head.append(umamiScript);
  });
}
