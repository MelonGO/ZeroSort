import i18n from "@/i18n";
import { useStore } from "@/store/useStore";
import { toast } from "sonner";

/** Returns whether the current user can access licensed pro features. */
export function hasActiveLicense(): boolean {
  return useStore.getState().licenseStatus === "valid";
}

/** Shows a consistent locked-feature toast for pro-only editor features. */
export function showProFeatureLockedToast(
  featureName: string,
  onOpenLicenseSettings?: () => void,
): void {
  const message = i18n.t("proFeatures.licenseGate.featureLocked", {
    feature: featureName,
  });

  if (!onOpenLicenseSettings) {
    toast.error(message);
    return;
  }

  toast.error(message, {
    action: {
      label: i18n.t("proFeatures.licenseGate.activateButton"),
      onClick: onOpenLicenseSettings,
    },
  });
}
