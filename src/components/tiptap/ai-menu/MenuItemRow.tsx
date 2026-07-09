import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AiActionType } from "@/lib/ai/prompts";
import { cn } from "@/lib/utils";

import { ChevronRight } from "lucide-react";

import type { MenuItem } from "./constants";

// ---------------------------------------------------------------------------
// MenuItemRow
// ---------------------------------------------------------------------------

interface MenuItemRowProps {
  item: MenuItem;
  isSubmenuActive: boolean;
  isLoading: boolean;
  onMouseEnter: (submenuType: MenuItem["submenuType"]) => void;
  onMouseLeave: () => void;
  onAction: (id: AiActionType, option?: string) => void;
  submenuContent: React.ReactNode;
}

export const MenuItemRow: React.FC<MenuItemRowProps> = ({
  item,
  isSubmenuActive,
  isLoading,
  onMouseEnter,
  onMouseLeave,
  onAction,
  submenuContent,
}) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [submenuStyle, setSubmenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (isSubmenuActive && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setSubmenuStyle({
        position: "fixed",
        top: rect.top,
        left: rect.right + 4,
        zIndex: 9999,
      });
    }
  }, [isSubmenuActive]);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={() => item.hasSubmenu && onMouseEnter(item.submenuType)}
      onMouseLeave={() => item.hasSubmenu && onMouseLeave()}
    >
      <button
        type="button"
        onClick={() => {
          if (item.hasSubmenu) return;
          onAction(item.id);
        }}
        disabled={isLoading}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <span className={item.iconColor}>{item.icon}</span>
        <span className="flex-1 text-left">{item.labelKey}</span>
        {item.hasSubmenu && (
          <ChevronRight size={14} className="text-muted-foreground" />
        )}
      </button>

      {item.hasSubmenu &&
        isSubmenuActive &&
        createPortal(
          <div
            style={submenuStyle}
            className="min-w-32 rounded-md border bg-popover p-1 shadow-lg"
            onMouseEnter={() => onMouseEnter(item.submenuType)}
            onMouseLeave={onMouseLeave}
          >
            {submenuContent}
          </div>,
          document.body,
        )}
    </div>
  );
};
