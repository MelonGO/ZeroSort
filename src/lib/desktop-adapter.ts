/**
 * Tauri command bridge for the desktop host.
 *
 * Preserves legacy `invoke("save_credential")`-style command names used by the
 * renderer. Maps colon channels to underscore Tauri command names and calls
 * `@tauri-apps/api/core` invoke.
 */

/** Maps legacy / colon command names to Tauri-safe underscore command names. */
const TAURI_COMMAND_MAP: Record<string, string> = {
  save_credential: "save_credential",
  get_credential: "get_credential",
  delete_credential: "delete_credential",
  has_credential: "has_credential",
  list_credential_keys: "list_credential_keys",
  clear_all_credentials: "clear_all_credentials",
  connect_s3_sync: "connect_s3_sync",
  disconnect_s3_sync: "disconnect_s3_sync",
  list_sync_objects: "list_sync_objects",
  get_sync_object_metadata: "get_sync_object_metadata",
  upload_sync_object: "upload_sync_object",
  upload_sync_binary: "upload_sync_binary",
  download_sync_object: "download_sync_object",
  download_sync_binary: "download_sync_binary",
  delete_sync_objects_batch: "delete_sync_objects_batch",
  "store:get": "store_get",
  "store:set": "store_set",
  "store:delete": "store_delete",
  "store:has": "store_has",
  save_s3_config: "save_s3_config",
  get_s3_config: "get_s3_config",
  delete_s3_config: "delete_s3_config",
  has_s3_config: "has_s3_config",
  activate_license: "activate_license",
  get_license_status: "get_license_status",
  deactivate_license: "deactivate_license",
  get_machine_id: "get_machine_id",
  save_image_file: "save_image_file",
  write_managed_image_file: "write_managed_image_file",
  read_managed_image_file: "read_managed_image_file",
  delete_image_file: "delete_image_file",
  get_managed_image_metadata: "get_managed_image_metadata",
  "db:select": "db_select",
  "db:execute": "db_execute",
  "fs:exists": "fs_exists",
  "fs:mkdir": "fs_mkdir",
  "fs:read_dir": "fs_read_dir",
  "fs:read_text_file": "fs_read_text_file",
  "fs:read_file": "fs_read_file",
  "fs:stat": "fs_stat",
  "fs:write_file": "fs_write_file",
  "fs:write_text_file": "fs_write_text_file",
  "path:app_data_dir": "path_app_data_dir",
  "path:join": "path_join",
  "dialog:open": "dialog_open",
  "dialog:save": "dialog_save",
  "dialog:message": "dialog_message",
  "shell:open_external": "shell_open_external",
  "app:quit": "app_quit",
  "app:relaunch": "app_relaunch",
  "app:get_version": "app_get_version",
  "app:confirm_close": "app_confirm_close",
  "window:is_focused": "window_is_focused",
  "shortcut:register": "shortcut_register",
  "shortcut:unregister": "shortcut_unregister",
  "updater:check": "updater_check",
  "updater:download_and_install": "updater_download_and_install",
  "updater:quit_and_install": "updater_quit_and_install",
};

const OPTS_WRAPPED_COMMANDS = new Set([
  "list_sync_objects",
  "get_sync_object_metadata",
  "upload_sync_object",
  "upload_sync_binary",
  "download_sync_object",
  "download_sync_binary",
  "delete_sync_objects_batch",
]);

/** Returns whether the renderer is running inside Tauri. */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/** Returns whether the Tauri desktop host bridge is available. */
export function isDesktop(): boolean {
  return isTauri();
}

/**
 * Unwraps `{ success, … }` host responses into the payload field the renderer
 * expects.
 */
export function unwrapHostResult<T = any>(result: any): T {
  if (result && typeof result === "object" && "success" in result) {
    if (!result.success) {
      throw new Error(result.error || "Operation failed");
    }

    if ("value" in result) return result.value;
    if ("connection" in result) return result.connection;
    if ("objects" in result) return result.objects;
    if ("metadata" in result) return result.metadata;
    if ("content" in result) return result.content;
    if ("data" in result) return result.data;
    if ("result" in result) return result.result;
    if ("config" in result) return result.config;
    if ("exists" in result) return result.exists;
    if ("keys" in result) return result.keys;
    if ("info" in result) return result.info;
    if ("machineId" in result) return result.machineId;
    if ("path" in result) return result.path;
    if ("rows" in result) return result.rows;
    if ("changes" in result) return result.changes;
    if ("update" in result) return result.update;
    if ("version" in result) return result.version;
    if ("focused" in result) return result as T;
    if ("canceled" in result) return result as T;
    if ("entries" in result) return result as T;
    if ("stat" in result) return result as T;

    return result as T;
  }

  return result;
}

function buildTauriInvokeArgs(
  cmd: string,
  args: any,
): Record<string, unknown> | undefined {
  if (args === undefined || args === null) {
    return undefined;
  }

  if (
    cmd === "save_credential" ||
    cmd === "get_credential" ||
    cmd === "delete_credential" ||
    cmd === "has_credential"
  ) {
    return { key: args.key, value: args.value };
  }
  if (cmd === "connect_s3_sync") {
    return { args: args.config ? args : { config: args } };
  }
  if (cmd === "disconnect_s3_sync") {
    return {
      connectionId:
        typeof args === "string"
          ? args
          : (args.connectionId ?? args.connection_id),
    };
  }
  if (OPTS_WRAPPED_COMMANDS.has(cmd)) {
    return { args: args.opts ? args : { opts: args } };
  }
  if (cmd === "store:get" || cmd === "store:delete" || cmd === "store:has") {
    return { key: args.key ?? args };
  }
  if (cmd === "store:set") {
    return { key: args.key, value: args.value };
  }
  if (cmd === "save_s3_config") {
    return { config: args.config ?? args };
  }
  if (cmd === "activate_license") {
    return {
      licenseKey: typeof args === "string" ? args : args.licenseKey,
    };
  }
  if (
    cmd === "save_image_file" ||
    cmd === "write_managed_image_file" ||
    cmd === "read_managed_image_file" ||
    cmd === "delete_image_file" ||
    cmd === "get_managed_image_metadata"
  ) {
    return { payload: args };
  }
  if (cmd === "db:select" || cmd === "db:execute") {
    return { query: args };
  }
  if (cmd === "shortcut:register" || cmd === "shortcut:unregister") {
    return {
      accelerator: typeof args === "string" ? args : args.accelerator,
    };
  }
  if (cmd === "app:confirm_close") {
    return { args };
  }
  if (cmd === "shell:open_external") {
    return { url: typeof args === "string" ? args : args.url };
  }
  if (cmd === "path:join") {
    return {
      segments: Array.isArray(args) ? args : (args.segments ?? []),
    };
  }
  if (
    cmd === "fs:exists" ||
    cmd === "fs:read_dir" ||
    cmd === "fs:read_text_file" ||
    cmd === "fs:read_file" ||
    cmd === "fs:stat"
  ) {
    return { path: typeof args === "string" ? args : args.path };
  }
  if (cmd === "fs:mkdir") {
    if (typeof args === "string") {
      return { path: args };
    }
    return { path: args.path ?? args[0], options: args.options ?? args[1] };
  }
  if (cmd === "fs:write_file") {
    return {
      path: args.path ?? args[0],
      data: args.data ?? args[1],
    };
  }
  if (cmd === "fs:write_text_file") {
    return {
      path: args.path ?? args[0],
      content: args.content ?? args[1],
    };
  }
  if (cmd === "dialog:open" || cmd === "dialog:save") {
    return { options: args };
  }
  if (cmd === "dialog:message") {
    if (typeof args === "string") {
      return { message: args };
    }
    return {
      message: args.message ?? args[0],
      options: args.options ?? args[1],
    };
  }

  return typeof args === "object" && !Array.isArray(args)
    ? args
    : { value: args };
}

/**
 * Invokes a Tauri host command.
 */
export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (!isTauri()) {
    throw new Error("Desktop API not available");
  }

  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  const tauriCmd = TAURI_COMMAND_MAP[cmd] || cmd.replace(/:/g, "_");
  const tauriArgs = buildTauriInvokeArgs(cmd, args);
  try {
    const result = await tauriInvoke(tauriCmd, tauriArgs);
    return unwrapHostResult<T>(result);
  } catch (error: any) {
    throw new Error(error?.message || `Failed to invoke ${cmd}`);
  }
}

export const core = { invoke };

let tauriConvertFileSrc:
  | ((filePath: string, protocol?: string) => string)
  | null
  | undefined;

/** Lazily loads Tauri's convertFileSrc helper. */
function getTauriConvertFileSrc(): typeof tauriConvertFileSrc {
  if (tauriConvertFileSrc !== undefined) {
    return tauriConvertFileSrc;
  }
  if (!isTauri()) {
    tauriConvertFileSrc = null;
    return null;
  }
  try {
    const internals = (window as any).__TAURI_INTERNALS__;
    if (internals?.convertFileSrc) {
      tauriConvertFileSrc = internals.convertFileSrc.bind(internals);
      return tauriConvertFileSrc;
    }
  } catch {
    // ignore
  }
  tauriConvertFileSrc = null;
  return null;
}

/**
 * Converts a local filesystem path into a URL usable by the renderer.
 */
export function convertFileSrc(filePath: string, _protocol = "asset"): string {
  if (!filePath) {
    return filePath;
  }
  if (/^[a-z]+:\/\//i.test(filePath)) {
    return filePath;
  }

  const tauriConvert = getTauriConvertFileSrc();
  if (tauriConvert) {
    return tauriConvert(filePath);
  }

  // Fallback when Tauri internals are not yet available.
  const normalized = filePath.replace(/\\/g, "/");
  const prefixed = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const encoded = prefixed
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `asset://localhost${encoded}`;
}

/** Async convertFileSrc that uses Tauri's official helper when available. */
export async function convertFileSrcAsync(filePath: string): Promise<string> {
  if (!filePath || /^[a-z]+:\/\//i.test(filePath)) {
    return filePath;
  }
  if (isTauri()) {
    const { convertFileSrc: tauriConvert } =
      await import("@tauri-apps/api/core");
    return tauriConvert(filePath);
  }
  return convertFileSrc(filePath);
}

/**
 * Subscribes to a Tauri host event.
 */
export function onIpcEvent<T = unknown>(
  channel: string,
  callback: (payload: T) => void,
): () => void {
  if (!isTauri()) {
    return () => {};
  }

  let unlisten: (() => void) | undefined;
  void import("@tauri-apps/api/event").then(({ listen }) => {
    void listen<T>(channel, (event) => {
      callback(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
  });
  return () => {
    unlisten?.();
  };
}

/** Returns the OS-specific application data directory. */
export async function appDataDir(): Promise<string> {
  return invoke<string>("path:app_data_dir");
}

/** Joins path segments using the host platform separator. */
export async function joinPath(...segments: string[]): Promise<string> {
  if (!isTauri()) {
    return segments.join("/");
  }
  return invoke<string>("path:join", { segments });
}

/** Returns the running application version. */
export async function getAppVersionFromMain(): Promise<string> {
  return invoke<string>("app:get_version");
}

/** Quits the app and relaunches it. */
export async function relaunchApp(): Promise<void> {
  await invoke("app:relaunch");
}

/** Opens an external URL in the user's default browser. */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    if (typeof globalThis !== "undefined" && (globalThis as any).open) {
      (globalThis as any).open(url, "_blank");
    }
    return;
  }
  await invoke("shell:open_external", { url });
}

/** Returns whether the main window is focused. */
export async function isWindowFocused(): Promise<boolean> {
  if (!isTauri()) {
    return typeof document !== "undefined" ? document.hasFocus() : false;
  }
  const result = await invoke<{ focused: boolean } | boolean>(
    "window:is_focused",
  );
  return typeof result === "boolean" ? result : !!result.focused;
}
