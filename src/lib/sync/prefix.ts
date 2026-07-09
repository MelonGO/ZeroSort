/**
 * Canonical S3 namespace used by ZeroSort sync objects.
 */
export const DEFAULT_SYNC_PREFIX = "zerosort/";

/**
 * Normalizes a sync prefix, falling back to the canonical ZeroSort namespace.
 */
export function normalizeSyncPrefix(prefix?: string | null): string {
  const trimmed = prefix?.trim();

  if (!trimmed) {
    return DEFAULT_SYNC_PREFIX;
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
