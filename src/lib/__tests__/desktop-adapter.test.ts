// @vitest-environment jsdom

/**
 * Tests for the Tauri desktop adapter: host result unwrapping and runtime
 * detection.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

describe("desktop-adapter unwrapHostResult", () => {
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  it("Should unwrap success payloads by field name", async () => {
    const { unwrapHostResult } = await import("@/lib/desktop-adapter");
    expect(unwrapHostResult({ success: true, value: "secret" })).toBe("secret");
    expect(unwrapHostResult({ success: true, rows: [{ id: 1 }] })).toEqual([
      { id: 1 },
    ]);
    expect(unwrapHostResult({ success: true, exists: true })).toBe(true);
  });

  it("Should throw when success is false", async () => {
    const { unwrapHostResult } = await import("@/lib/desktop-adapter");
    expect(() => unwrapHostResult({ success: false, error: "boom" })).toThrow(
      "boom",
    );
  });

  it("Should detect Tauri runtime as desktop", async () => {
    vi.resetModules();
    (window as any).__TAURI_INTERNALS__ = {};
    const tauriMod = await import("@/lib/desktop-adapter");
    expect(tauriMod.isTauri()).toBe(true);
    expect(tauriMod.isDesktop()).toBe(true);
  });

  it("Should report non-desktop when Tauri is absent", async () => {
    vi.resetModules();
    const mod = await import("@/lib/desktop-adapter");
    expect(mod.isTauri()).toBe(false);
    expect(mod.isDesktop()).toBe(false);
  });
});
