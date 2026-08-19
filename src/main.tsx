import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { SettingsProvider } from "./utils/SettingsContext";
import { PasswordGate } from "./components/PasswordGate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PasswordGate>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </PasswordGate>
  </StrictMode>,
);

// PWA: service worker registrujeme jen v produkčním buildu (v dev by cache
// překážela hot-reloadu). Chyby ignorujeme – appka funguje i bez SW.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
