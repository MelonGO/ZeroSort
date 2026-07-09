/**
 * License verification store slice.
 *
 * Manages the license state including activation, status checking, and deactivation.
 * All cryptographic verification runs in the Tauri host via commands.
 */

import {
  activateLicense as invokeActivateLicense,
  deactivateLicense as invokeDeactivateLicense,
  getLicenseStatus as invokeGetLicenseStatus,
} from "@/lib/license";
import type { LicenseInfo, LicenseStatus, ZeroSortState } from "@/types";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

/**
 * Derives the license status enum from a LicenseInfo result.
 */
function deriveLicenseStatus(info: LicenseInfo): LicenseStatus {
  if (info.isValid) return "valid";
  if (!info.error) return "none";
  return "invalid";
}

/**
 * Creates the license slice of the store.
 * Manages license verification state and actions.
 */
export const createLicenseSlice = (set: SetState, _get: GetState) => ({
  // --- Initial State ---
  licenseStatus: "none" as LicenseStatus,
  licenseInfo: null as LicenseInfo | null,

  /**
   * Activates a license by sending the JWT key to the Rust backend.
   * Updates the store with the verification result.
   *
   * @param key - The JWT license key string
   * @returns The verification result
   */
  activateLicense: async (key: string): Promise<LicenseInfo> => {
    try {
      const info = await invokeActivateLicense(key);
      const status = deriveLicenseStatus(info);
      set({ licenseStatus: status, licenseInfo: info });
      return info;
    } catch (error) {
      const errorInfo: LicenseInfo = {
        isValid: false,
        user: null,
        error:
          error instanceof Error ? error.message : "License activation failed",
      };
      set({ licenseStatus: "invalid", licenseInfo: errorInfo });
      return errorInfo;
    }
  },

  /**
   * Checks the current license status by re-verifying the stored key.
   * Called during app initialization and periodically.
   */
  checkLicense: async (): Promise<void> => {
    try {
      const info = await invokeGetLicenseStatus();
      const status = deriveLicenseStatus(info);
      set({ licenseStatus: status, licenseInfo: info });
    } catch (error) {
      console.error("Failed to check license status:", error);
      set({ licenseStatus: "none", licenseInfo: null });
    }
  },

  /**
   * Deactivates the current license and resets the store state.
   */
  deactivateLicense: async (): Promise<void> => {
    try {
      await invokeDeactivateLicense();
      set({ licenseStatus: "none", licenseInfo: null });
    } catch (error) {
      console.error("Failed to deactivate license:", error);
    }
  },
});
