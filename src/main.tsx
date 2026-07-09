import { SaveShortcutManager } from "@/components/layout/SaveShortcutManager";
import {
  createHashHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { DefaultCatchBoundary } from "./components/layout/DefaultCatchBoundary";
import { LoadingScreen } from "./components/layout/LoadingScreen";
import { NotFound } from "./components/layout/NotFound";
import { SettingsHandler } from "./components/layout/SettingsHandler";
import { initAllDatabases } from "./lib/db";
import { routeTree } from "./routeTree.gen";
import { useStore } from "./store/useStore";
import "./styles/app.css";

/**
 * The application's main router instance.
 * Configured with the route tree, default components, and scroll restoration.
 *
 * Uses hash history when loaded from a file:// URL (i.e. the packaged
 * desktop build) because the browser pathname is then the absolute path of
 * index.html on disk and would never match any route, leaving the window
 * blank.
 */
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: DefaultCatchBoundary,
  defaultNotFoundComponent: () => <NotFound />,
  scrollRestoration: true,
  history:
    window.location.protocol === "file:" ? createHashHistory() : undefined,
});

/**
 * Registers the router instance for global type safety.
 */
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

interface WindowWithReactScanToggle extends Window {
  __ZERO_SORT_ENABLE_SCAN__?: boolean;
}

/**
 * Renders the main application after initialization completes.
 * @param root - The React root instance
 */
function renderApp(root: ReactDOM.Root) {
  root.render(
    <>
      <SaveShortcutManager />
      <SettingsHandler />
      <RouterProvider router={router} />
    </>,
  );
}

/**
 * Updates the loading screen with progress and stage information.
 * @param root - The React root instance
 * @param progress - Progress percentage (0-100)
 * @param stage - The current loading stage
 */
function updateLoadingScreen(
  root: ReactDOM.Root,
  progress: number,
  stage: string,
) {
  root.render(<LoadingScreen progress={progress} stage={stage} />);
}

/**
 * Starts React Scan during development when explicitly enabled.
 * Opt-in via `window.__ZERO_SORT_ENABLE_SCAN__ = true` before page load.
 * React Scan runs a continuous requestAnimationFrame loop which causes
 * noticeable idle CPU consumption, so it is disabled by default.
 */
async function initializeReactScan() {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  if (!(window as WindowWithReactScanToggle).__ZERO_SORT_ENABLE_SCAN__) {
    return;
  }

  try {
    const { scan } = await import("react-scan");
    scan({
      enabled: true,
      log: false,
      showToolbar: true,
    });
  } catch (err) {
    console.warn("Failed to initialize react-scan:", err);
  }
}

/**
 * Main application entry point.
 * Shows a loading screen with progress during initialization,
 * then mounts the React application to the DOM.
 */
const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  /**
   * Initializes the application with staged progress updates.
   */
  async function initializeApp() {
    try {
      await initializeReactScan();

      // Stage 1: Starting
      updateLoadingScreen(root, 0, "Starting...");

      // Stage 2: Database initialization (0% -> 50%)
      updateLoadingScreen(root, 20, "Initializing...");
      await initAllDatabases();

      // Stage 3: Settings initialization (50% -> 80%)
      updateLoadingScreen(root, 60, "Loading settings...");
      await useStore.getState().initSettings();

      // Stage 4: License verification (80% -> 100%)
      updateLoadingScreen(root, 80, "Verifying license...");
      await useStore.getState().checkLicense();

      // Complete - render the main app
      updateLoadingScreen(root, 100, "Ready");

      renderApp(root);
    } catch (err) {
      console.error("Failed to initialize application:", err);
      // Still render to show error UI if any
      renderApp(root);
    }
  }

  initializeApp();
}
