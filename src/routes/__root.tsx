/// <reference types="vite/client" />
import { AppCloseGuard } from "@/components/layout/AppCloseGuard";
import { DefaultCatchBoundary } from "@/components/layout/DefaultCatchBoundary";
import { NotFound } from "@/components/layout/NotFound";
import { TooltipProvider } from "@/components/ui/tooltip";
import { seo } from "@/lib/seo";
import { useThemeStore } from "@/store/useThemeStore";
import appCss from "@/styles/app.css?url";
import { createRootRoute, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";

/**
 * The root route configuration for the application.
 */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...seo({
        title: "ZeroSort - AI Organized Notes",
        description:
          "Leave the thinking to yourself, let AI handle the organization.",
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootDocument,
});

/**
 * The root document component that wraps the entire application.
 * Provides the base HTML structure and global components like Toaster.
 *
 * @returns The root layout of the application.
 */
function RootDocument() {
  const currentMode = useThemeStore((s) => s.themeState.currentMode);

  return (
    <TooltipProvider delayDuration={300}>
      <div>
        <Outlet />
        <AppCloseGuard />
        <Toaster
          closeButton
          position="bottom-center"
          theme={currentMode}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                "group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 pr-12 text-card-foreground shadow-lg",
              title: "text-sm font-semibold text-foreground",
              description: "text-sm text-muted-foreground",
              content: "flex min-w-0 flex-1 flex-col gap-1",
              icon: "flex size-4 shrink-0 items-center justify-center text-foreground",
              loader: "text-muted-foreground",
              closeButton:
                "absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-all hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-hidden dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
              actionButton:
                "inline-flex h-8 shrink-0 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-hidden",
              cancelButton:
                "inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-xs transition-all hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-hidden dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
              success: "border-primary/20 bg-card text-card-foreground",
              error: "border-destructive/30 bg-card text-card-foreground",
              info: "border-border bg-popover text-popover-foreground",
              warning: "border-accent bg-card text-card-foreground",
              loading: "border-border bg-card text-card-foreground",
            },
          }}
        />
        <Scripts />
      </div>
    </TooltipProvider>
  );
}
