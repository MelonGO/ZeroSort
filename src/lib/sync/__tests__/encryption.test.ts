/**
 * Tests for the sync encryption module - AES-256-GCM encryption with PBKDF2 key derivation.
 *
 * Uses real Web Crypto API (no mocking) for high-confidence round-trip validation.
 */

import { describe, expect, it } from "vitest";

import {
  decryptSyncBytes,
  decryptSyncContent,
  encryptSyncBytes,
  encryptSyncContent,
  getEncryptedSyncByteSize,
  verifyEncryptionPassword,
} from "../encryption";

const TEST_PASSWORD = "test-password-2024";

describe("Encryption - String Content Round-Trip", () => {
  it("Should encrypt and decrypt a simple string", async () => {
    const plaintext = "Hello, World!";
    const encrypted = await encryptSyncContent(plaintext, TEST_PASSWORD);
    const decrypted = await decryptSyncContent(encrypted, TEST_PASSWORD);

    expect(decrypted).toBe(plaintext);
  });

  it("Should encrypt and decrypt an empty string", async () => {
    const plaintext = "";
    const encrypted = await encryptSyncContent(plaintext, TEST_PASSWORD);
    const decrypted = await decryptSyncContent(encrypted, TEST_PASSWORD);

    expect(decrypted).toBe(plaintext);
  });

  it("Should encrypt and decrypt unicode and emoji content", async () => {
    const plaintext = "你好世界 🌍🔐 Ñoño — straße café";
    const encrypted = await encryptSyncContent(plaintext, TEST_PASSWORD);
    const decrypted = await decryptSyncContent(encrypted, TEST_PASSWORD);

    expect(decrypted).toBe(plaintext);
  });

  it("Should encrypt and decrypt a large string payload", async () => {
    const plaintext = "A".repeat(100_000);
    const encrypted = await encryptSyncContent(plaintext, TEST_PASSWORD);
    const decrypted = await decryptSyncContent(encrypted, TEST_PASSWORD);

    expect(decrypted).toBe(plaintext);
  });

  it("Should encrypt and decrypt JSON note content", async () => {
    const noteContent = JSON.stringify({
      id: "note-1",
      title: "Test Note",
      content: "<p>Rich text with <strong>bold</strong></p>",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    const encrypted = await encryptSyncContent(noteContent, TEST_PASSWORD);
    const decrypted = await decryptSyncContent(encrypted, TEST_PASSWORD);

    expect(JSON.parse(decrypted)).toEqual(JSON.parse(noteContent));
  });
});

describe("Encryption - Binary Bytes Round-Trip", () => {
  it("Should encrypt and decrypt binary bytes", async () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);
    const decrypted = await decryptSyncBytes(encrypted, TEST_PASSWORD);

    expect(decrypted).toEqual(original);
  });

  it("Should encrypt and decrypt an empty byte array", async () => {
    const original = new Uint8Array(0);
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);
    const decrypted = await decryptSyncBytes(encrypted, TEST_PASSWORD);

    expect(decrypted).toEqual(original);
  });

  it("Should encrypt and decrypt a large byte array", async () => {
    const original = new Uint8Array(50_000);
    for (let i = 0; i < original.length; i++) {
      original[i] = i % 256;
    }
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);
    const decrypted = await decryptSyncBytes(encrypted, TEST_PASSWORD);

    expect(decrypted).toEqual(original);
  });
});

describe("Encryption - Uniqueness (Random Salt/IV)", () => {
  it("Should produce different ciphertext for the same plaintext", async () => {
    const plaintext = "identical content";
    const encrypted1 = await encryptSyncContent(plaintext, TEST_PASSWORD);
    const encrypted2 = await encryptSyncContent(plaintext, TEST_PASSWORD);

    expect(encrypted1).not.toBe(encrypted2);

    // Both should decrypt to the same value
    expect(await decryptSyncContent(encrypted1, TEST_PASSWORD)).toBe(plaintext);
    expect(await decryptSyncContent(encrypted2, TEST_PASSWORD)).toBe(plaintext);
  });

  it("Should produce different encrypted bytes for the same input", async () => {
    const original = new Uint8Array([10, 20, 30]);
    const encrypted1 = await encryptSyncBytes(original, TEST_PASSWORD);
    const encrypted2 = await encryptSyncBytes(original, TEST_PASSWORD);

    // Salt/IV should differ (bytes 1-28 contain salt + IV)
    const salt1 = encrypted1.slice(1, 17);
    const salt2 = encrypted2.slice(1, 17);
    expect(salt1).not.toEqual(salt2);
  });
});

describe("Encryption - Wrong Password", () => {
  it("Should fail to decrypt string content with wrong password", async () => {
    const encrypted = await encryptSyncContent("secret", TEST_PASSWORD);

    await expect(
      decryptSyncContent(encrypted, "wrong-password"),
    ).rejects.toThrow("Decryption failed: wrong password or corrupted data");
  });

  it("Should fail to decrypt binary content with wrong password", async () => {
    const original = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);

    await expect(decryptSyncBytes(encrypted, "wrong-password")).rejects.toThrow(
      "Decryption failed: wrong password or corrupted data",
    );
  });
});

describe("Encryption - Corrupted Payload", () => {
  it("Should reject payload that is too short", async () => {
    const shortPayload = new Uint8Array(44); // Minimum is 45
    shortPayload[0] = 0x01;

    await expect(decryptSyncBytes(shortPayload, TEST_PASSWORD)).rejects.toThrow(
      "Invalid encrypted payload: too short",
    );
  });

  it("Should reject payload with unsupported version", async () => {
    const original = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);

    // Tamper with version byte
    encrypted[0] = 0x99;

    await expect(decryptSyncBytes(encrypted, TEST_PASSWORD)).rejects.toThrow(
      "Unsupported encryption version: 153",
    );
  });

  it("Should reject payload with tampered ciphertext", async () => {
    const original = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);

    // Tamper with the ciphertext (last byte before auth tag)
    encrypted[encrypted.length - 20] ^= 0xff;

    await expect(decryptSyncBytes(encrypted, TEST_PASSWORD)).rejects.toThrow(
      "Decryption failed: wrong password or corrupted data",
    );
  });

  it("Should reject exactly 45-byte payload with correct version but invalid data", async () => {
    const payload = new Uint8Array(45);
    payload[0] = 0x01; // Correct version

    await expect(decryptSyncBytes(payload, TEST_PASSWORD)).rejects.toThrow(
      "Decryption failed: wrong password or corrupted data",
    );
  });
});

describe("Encryption - verifyEncryptionPassword", () => {
  it("Should return true for correct password", async () => {
    const encrypted = await encryptSyncContent("test data", TEST_PASSWORD);
    const result = await verifyEncryptionPassword(encrypted, TEST_PASSWORD);

    expect(result).toBe(true);
  });

  it("Should return false for wrong password", async () => {
    const encrypted = await encryptSyncContent("test data", TEST_PASSWORD);
    const result = await verifyEncryptionPassword(encrypted, "wrong-pass");

    expect(result).toBe(false);
  });
});

describe("Encryption - getEncryptedSyncByteSize", () => {
  it("Should return plaintext size plus 45 bytes overhead", () => {
    // Overhead = version(1) + salt(16) + IV(12) + auth_tag(16) = 45
    expect(getEncryptedSyncByteSize(0)).toBe(45);
    expect(getEncryptedSyncByteSize(100)).toBe(145);
    expect(getEncryptedSyncByteSize(1024)).toBe(1069);
  });

  it("Should match actual encrypted byte size", async () => {
    const plaintextSizes = [0, 1, 100, 1000, 10_000];

    for (const size of plaintextSizes) {
      const original = new Uint8Array(size);
      const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);

      expect(encrypted.byteLength).toBe(getEncryptedSyncByteSize(size));
    }
  });
});

describe("Encryption - Binary Format Structure", () => {
  it("Should produce a payload with correct version byte", async () => {
    const original = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);

    expect(encrypted[0]).toBe(0x01);
  });

  it("Should have minimum size of version + salt + IV + auth_tag + ciphertext", async () => {
    const original = new Uint8Array(0);
    const encrypted = await encryptSyncBytes(original, TEST_PASSWORD);

    // Empty plaintext: version(1) + salt(16) + IV(12) + auth_tag(16) = 45
    expect(encrypted.byteLength).toBe(45);
  });
});
