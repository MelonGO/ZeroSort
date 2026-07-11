import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { cn } from "@/lib/utils";
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import {
  ChevronLeft,
  Cloud,
  Cpu,
  Database,
  Info,
  Palette,
  PenLine,
  Settings as SettingsIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * The route configuration for the settings layout.
 */
export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

/**
 * Layout component for the settings section.
 * Provides a sidebar navigation and a main content area for settings sub-routes.
 *
 * @returns The settings layout structure.
 */
function SettingsLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const isMobile = !useIsLargeScreen();

  const menuItems = useMemo(
    () => [
      { title: t("about.title"), icon: Info, path: "/settings/about" },
      {
        title: t("settings.general.title"),
        icon: SettingsIcon,
        path: "/settings/general",
      },
      {
        title: t("settings.editor.title"),
        icon: PenLine,
        path: "/settings/editor",
      },
      {
        title: t("settings.models.title"),
        icon: Cpu,
        path: "/settings/models",
      },
      {
        title: t("settings.general.data.title"),
        icon: Database,
        path: "/settings/data",
      },
      { type: "separator" },
      { title: t("sync.title"), icon: Cloud, path: "/settings/sync" },
      {
        title: t("settings.general.interface.themePreset.title"),
        icon: Palette,
        path: "/settings/theme",
      },
    ],
    [t],
  );

  const isSettingsRoot =
    location.pathname === "/settings" || location.pathname === "/settings/";

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Settings Sidebar */}
      <div
        className={cn(
          "flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar/50 transition-all duration-300 md:w-64",
          isMobile && !isSettingsRoot ? "hidden" : "flex",
        )}
      >
        <div className="flex items-center border-b border-sidebar-border p-4">
          <Link
            to="/"
            className="mr-2 rounded-md p-1 transition-colors hover:bg-sidebar-accent"
          >
            <ChevronLeft size={20} />
          </Link>
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            {t("settings.title")}
          </h2>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {menuItems.map((item, index) => {
            if (item.type === "separator") {
              return (
                <div
                  key={index}
                  className="mx-2 my-2 border-t border-sidebar-border"
                />
              );
            }

            const Icon = item.icon!;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon size={16} />
                <span className="flex-1">{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col bg-background transition-all duration-300",
          isMobile && isSettingsRoot ? "hidden" : "block",
        )}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
