import { useStore } from "@/store/useStore";
import type { LicenseInfo, LicenseStatus } from "@/types";

interface LicenseGate {
  /** Whether the user has a valid, active license */
  isLicensed: boolean;
  /** Raw license verification status */
  licenseStatus: LicenseStatus;
  /** Decoded license information (null if no license) */
  licenseInfo: LicenseInfo | null;
}

/**
 * Hook for feature gating based on the global license status.
 * Returns whether the user holds a valid license, along with raw status and info
 * for more granular checks (e.g. license type, expiration).
 */
export function useLicenseGate(): LicenseGate {
  const licenseStatus = useStore((state) => state.licenseStatus);
  const licenseInfo = useStore((state) => state.licenseInfo);

  return {
    isLicensed: licenseStatus === "valid",
    licenseStatus,
    licenseInfo,
  };
}
