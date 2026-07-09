/**
 * License settings page for managing software license activation and status.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import type { LicenseStatus } from "@/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle,
  ChevronLeft,
  KeyRound,
  Shield,
  ShieldOff,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/**
 * The route configuration for the license settings page.
 */
export const Route = createFileRoute("/settings/license")({
  component: LicensePage,
});

/**
 * Returns the status icon, label, and color class for the current license status.
 */
function getStatusDisplay(
  status: LicenseStatus,
  t: (key: string) => string,
): { icon: React.ElementType; label: string; className: string } {
  switch (status) {
    case "valid":
      return {
        icon: CheckCircle,
        label: t("license.active"),
        className: "text-green-600 dark:text-green-400",
      };
    case "invalid":
      return {
        icon: XCircle,
        label: t("license.invalid"),
        className: "text-red-600 dark:text-red-400",
      };
    default:
      return {
        icon: ShieldOff,
        label: t("license.inactive"),
        className: "text-muted-foreground",
      };
  }
}

/**
 * License settings page component.
 * Displays license status, activation form, machine ID, and deactivation controls.
 */
function LicensePage() {
  const { t } = useTranslation();
  const licenseStatus = useStore((state) => state.licenseStatus);
  const licenseInfo = useStore((state) => state.licenseInfo);
  const activateLicense = useStore((state) => state.activateLicense);
  const deactivateLicense = useStore((state) => state.deactivateLicense);

  const [licenseKey, setLicenseKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;

    setIsActivating(true);
    try {
      const result = await activateLicense(licenseKey.trim());
      if (result.isValid) {
        toast.success(t("license.activateSuccess"));
        setLicenseKey("");
      } else {
        toast.error(result.error || t("license.errors.activationFailed"));
      }
    } catch {
      toast.error(t("license.errors.activationFailed"));
    } finally {
      setIsActivating(false);
    }
  };

  const handleDeactivate = async () => {
    await deactivateLicense();
    setShowDeactivateConfirm(false);
    toast.success(t("license.deactivateSuccess"));
  };

  const statusDisplay = getStatusDisplay(licenseStatus, t);
  const StatusIcon = statusDisplay.icon;
  const hasActiveLicense = licenseStatus !== "none";

  return (
    <div className="flex-1 animate-in space-y-8 overflow-y-auto pr-2 duration-500 fade-in slide-in-from-bottom-4">
      {/* Header */}
      <header>
        <div className="mb-4 flex items-center space-x-2 md:hidden">
          <Link
            to="/settings"
            className="flex items-center text-[1rem] font-medium transition-colors hover:text-accent"
          >
            <ChevronLeft size={20} className="mr-1" />
            {t("settings.back")}
          </Link>
        </div>
        <div className="mb-2 flex items-center space-x-3">
          <div className="rounded-xl bg-muted p-2">
            <KeyRound className="text-foreground" size={24} />
          </div>
          <h1 className="text-2xl font-bold">{t("license.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("license.description")}
        </p>
      </header>

      {/* License Status */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {t("license.status")}
        </h3>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center space-x-3">
            <div
              className={cn("rounded-lg bg-muted p-2", statusDisplay.className)}
            >
              <StatusIcon size={20} />
            </div>
            <div>
              <h4
                className={cn("text-sm font-semibold", statusDisplay.className)}
              >
                {statusDisplay.label}
              </h4>
              {licenseInfo?.error && licenseStatus !== "none" && (
                <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">
                  {licenseInfo.error}
                </p>
              )}
            </div>
          </div>

          {/* License details when active */}
          {hasActiveLicense && licenseInfo && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              {licenseInfo.user && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("license.status")}
                  </span>
                  <span className="font-medium">{t("license.active")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Activate License */}
      {!hasActiveLicense || licenseStatus !== "valid" ? (
        <section>
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            {t("license.activate")}
          </h3>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                <Shield size={20} />
              </div>
              <div className="flex-1 space-y-3">
                <Input
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder={t("license.activatePlaceholder")}
                  maxLength={50}
                  className="font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleActivate();
                  }}
                />
                <Button
                  onClick={handleActivate}
                  disabled={!licenseKey.trim() || isActivating}
                  className="w-full sm:w-auto"
                >
                  {isActivating ? (
                    <span className="flex items-center space-x-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>{t("license.activateButton")}...</span>
                    </span>
                  ) : (
                    t("license.activateButton")
                  )}
                </Button>
                {licenseStatus === "none" && (
                  <p>
                    <a
                      href="https://zerosort.app/pro"
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
                    >
                      {t("license.purchaseLink")}
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Deactivate License */}
      {hasActiveLicense && (
        <section>
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            {t("license.deactivate")}
          </h3>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            {showDeactivateConfirm ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("license.deactivateConfirm")}
                </p>
                <div className="flex space-x-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeactivate}
                  >
                    {t("common.delete")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeactivateConfirm(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowDeactivateConfirm(true)}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
              >
                {t("license.deactivate")}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
