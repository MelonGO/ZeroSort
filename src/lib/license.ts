/**
 * Frontend helpers for invoking license verification via the Tauri command bridge.
 *
 * Provides TypeScript wrappers around the host license module.
 * All verification logic runs in the Rust backend using Ed25519 JWT verification.
 */

import { invoke } from "@/lib/desktop-adapter";

import type { LicenseInfo } from "@/types";

/**
 * Activates a license by sending the JWT key to the Rust backend for verification.
 *
 * The backend will:
 * 1. Verify the Ed25519 signature
 * 2. Check expiration
 * 3. Validate hardware ID binding (if present)
 * 4. Check for clock tampering
 * 5. Persist the key on success
 *
 * @param licenseKey - The JWT license key string
 * @returns Verification result with decoded claims
 */
export async function activateLicense(
  licenseKey: string,
): Promise<LicenseInfo> {
  const result = await invoke<{
    is_valid: boolean;
    user: string | null;
    error: string | null;
  }>("activate_license", { licenseKey });

  return mapLicenseInfo(result);
}

/**
 * Gets the current license status by re-verifying the stored key.
 *
 * @returns Current license verification state
 */
export async function getLicenseStatus(): Promise<LicenseInfo> {
  const result = await invoke<{
    is_valid: boolean;
    user: string | null;
    error: string | null;
  }>("get_license_status");

  return mapLicenseInfo(result);
}

/**
 * Deactivates the current license, removing it from storage.
 */
export async function deactivateLicense(): Promise<void> {
  await invoke("deactivate_license");
}

/**
 * Gets the machine's unique hardware ID for license binding.
 *
 * Users can provide this to the license server when purchasing
 * a hardware-bound license.
 *
 * @returns The machine's hardware UID
 */
export async function getMachineId(): Promise<string> {
  return invoke<string>("get_machine_id");
}

/**
 * Maps the snake_case Rust response to camelCase TypeScript interface.
 */
function mapLicenseInfo(raw: {
  is_valid: boolean;
  user: string | null;
  error: string | null;
}): LicenseInfo {
  return {
    isValid: raw.is_valid,
    user: raw.user,
    error: raw.error,
  };
}
