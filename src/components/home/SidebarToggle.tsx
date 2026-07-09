import { cn } from "@/lib/utils";
import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImperativePanelHandle } from "react-resizable-panels";

interface SidebarToggleProps {
  isOpen: boolean;
  /** For mobile: directly toggles the sidebar state */
  onToggle?: () => void;
  /** For desktop: uses imperative panel handle to collapse/expand */
  panelRef?: React.RefObject<ImperativePanelHandle | null>;
}

/**
 * Toggle button for showing/hiding the sidebar.
 * On desktop, uses the panelRef to imperatively collapse/expand.
 * On mobile, uses the onToggle callback.
 */
export function SidebarToggle({
  isOpen,
  onToggle,
  panelRef,
}: SidebarToggleProps) {
  const { t } = useTranslation();

  const handleClick = () => {
    if (panelRef?.current) {
      // Desktop: use imperative panel control
      if (isOpen) {
        panelRef.current.collapse();
      } else {
        panelRef.current.expand();
      }
    } else if (onToggle) {
      // Mobile: use toggle callback
      onToggle();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "absolute left-1 z-20 rounded-md p-2 transition-all hover:bg-muted",
        onToggle
          ? "top-3 left-3 z-30 bg-background/90 shadow-sm backdrop-blur-sm"
          : "top-1",
      )}
      title={isOpen ? t("sidebar.hideSidebar") : t("sidebar.showSidebar")}
    >
      <PanelLeft
        size={20}
        className={cn("transition-colors", !isOpen && "text-primary")}
      />
    </button>
  );
}
