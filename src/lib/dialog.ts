/**
 * Native dialog helpers backed by the Tauri dialog commands.
 */

import { invoke, isDesktop } from "@/lib/desktop-adapter";

interface OpenDialogOptions {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
}

interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface MessageOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
}

function ensureDesktop(): void {
  if (!isDesktop()) {
    throw new Error("Desktop API not available");
  }
}

/**
 * Opens a system file or directory picker. Returns the selected path,
 * an array of paths if `multiple` is true, or `null` if the user cancels.
 */
export async function open(
  options: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  ensureDesktop();

  const result = await invoke<{ canceled: boolean; filePaths: string[] }>(
    "dialog:open",
    {
      title: options.title,
      directory: options.directory,
      multiple: options.multiple,
      filters: options.filters,
      defaultPath: options.defaultPath,
    },
  );

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  if (options.multiple) {
    return result.filePaths;
  }

  return result.filePaths[0] ?? null;
}

/**
 * Opens a system "save file" dialog. Returns the chosen path or `null`.
 */
export async function save(
  options: SaveDialogOptions = {},
): Promise<string | null> {
  ensureDesktop();
  const result = await invoke<{
    canceled: boolean;
    filePath?: string;
  }>("dialog:save", {
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
  });

  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
}

/**
 * Shows a native message box.
 */
export async function message(
  text: string,
  options: MessageOptions = {},
): Promise<void> {
  ensureDesktop();
  await invoke("dialog:message", { message: text, options });
}
