import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { shouldRetryQuery } from "./lib/api";
import { AuthProvider } from "./lib/auth";
import { listenForPreloadErrors, notifyUpdateReady, scheduleUpdateChecks } from "./lib/swUpdate";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

// registerType is "autoUpdate" (vite.config.ts): the SW checks for updates in
// the background and a new version activates by itself — safe because the app
// shell is versioned by build hash and API calls are always NetworkOnly. In
// that mode `onNeedRefresh` never fires and the library's default is to reload
// the page unannounced, which would discard unsaved typing; `onNeedReload`
// replaces that reload with a banner (lib/swUpdate.ts). A tab left open for
// days never re-checks on its own, so poll for a new SW, and treat a lazy
// chunk that vanished in a deploy as the same "reload" signal
// (docs/archive/plans/application-review-2026-10-22.md, F-40).
registerSW({
  immediate: true,
  onNeedReload: notifyUpdateReady,
  onRegisteredSW(_url, registration) {
    scheduleUpdateChecks(registration);
  },
});
listenForPreloadErrors(window);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetryQuery, refetchOnWindowFocus: false },
    // "always": a write attempted while the browser is offline fails at once
    // with a visible error instead of being paused silently and sent later
    // without the user knowing — the task drawer sat on "Saving…" for as
    // long as the network was down
    // (docs/archive/plans/application-review-2026-10-22.md, QA-01).
    mutations: { networkMode: "always" },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary scope="root">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
