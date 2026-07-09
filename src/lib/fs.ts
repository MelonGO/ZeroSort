/**
 * Filesystem helpers backed by the desktop host (`fs/*` commands).
 *
 * All file paths are absolute paths on the user's machine.
 */

import { invoke, isDesktop } from "@/lib/desktop-adapter";

interface ReadDirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

interface FsStat {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  birthtimeMs: number;
  mtimeMs: number;
  atimeMs: number;
}

interface ImportedFileInfo {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  birthtime: Date | null;
  mtime: Date | null;
  atime: Date | null;
}

function ensureDesktop(): void {
  if (!isDesktop()) {
    throw new Error("Desktop API not available");
  }
}

/** Returns true if `path` exists on disk. */
export async function exists(path: string): Promise<boolean> {
  ensureDesktop();
  const result = await invoke<{ exists: boolean } | boolean>("fs:exists", {
    path,
  });
  return typeof result === "boolean" ? result : result.exists;
}

/** Creates a directory. */
export async function mkdir(
  path: string,
  options?: { recursive?: boolean },
): Promise<void> {
  ensureDesktop();
  await invoke("fs:mkdir", { path, options: options ?? {} });
}

/** Reads a directory */
export async function readDir(path: string): Promise<ReadDirEntry[]> {
  ensureDesktop();
  const result = await invoke<{ entries: ReadDirEntry[] }>("fs:read_dir", {
    path,
  });
  return result.entries;
}

/** Reads a UTF-8 text file. */
export async function readTextFile(path: string): Promise<string> {
  ensureDesktop();
  const result = await invoke<{ content: string } | string>(
    "fs:read_text_file",
    { path },
  );
  return typeof result === "string" ? result : result.content;
}

/** Reads a binary file. */
export async function readFile(path: string): Promise<Uint8Array> {
  ensureDesktop();
  const result = await invoke<{ data: number[] | Uint8Array } | number[]>(
    "fs:read_file",
    { path },
  );
  const data = Array.isArray(result) ? result : result.data;
  return data instanceof Uint8Array ? data : Uint8Array.from(data);
}

/** Stats a file or directory. */
export async function stat(path: string): Promise<ImportedFileInfo> {
  ensureDesktop();
  const result = await invoke<{ stat: FsStat }>("fs:stat", { path });
  const s = result.stat;
  return {
    size: s.size,
    isFile: s.isFile,
    isDirectory: s.isDirectory,
    isSymlink: s.isSymlink,
    birthtime: Number.isFinite(s.birthtimeMs) ? new Date(s.birthtimeMs) : null,
    mtime: Number.isFinite(s.mtimeMs) ? new Date(s.mtimeMs) : null,
    atime: Number.isFinite(s.atimeMs) ? new Date(s.atimeMs) : null,
  };
}

/** Writes binary data to a file. */
export async function writeFile(path: string, data: Uint8Array): Promise<void> {
  ensureDesktop();
  await invoke("fs:write_file", { path, data: Array.from(data) });
}

/** Writes a UTF-8 text file. */
export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  ensureDesktop();
  await invoke("fs:write_text_file", { path, content });
}
