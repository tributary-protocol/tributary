import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { I18nProvider } from "./lib/i18n";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <I18nProvider>
          <App />
        </I18nProvider>
      </MotionConfig>
    </StrictMode>
  </ErrorBoundary>,
);
