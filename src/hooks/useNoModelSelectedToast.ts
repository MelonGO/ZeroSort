import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/**
 * Returns a router-aware toast helper for missing AI model configuration.
 *
 * @returns A callback that shows the missing-model toast and links to model settings.
 */
export function useNoModelSelectedToast() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return useCallback(() => {
    toast.error(t("ai.noModelSelected"), {
      action: {
        label: t("settings.ai.models"),
        onClick: () => {
          void navigate({ to: "/settings/models" });
        },
      },
    });
  }, [navigate, t]);
}
