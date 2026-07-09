import { invoke } from "@/lib/desktop-adapter";

export const STORE_PATH = "store.json";

/**
 * Store interface that mirrors the host key-value store API.
 */
interface Store {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  delete: (key: string) => Promise<void>;
  has: (key: string) => Promise<boolean>;
  clear: () => Promise<void>;
  save: () => Promise<void>;
  keys: () => Promise<string[]>;
}

/**
 * Loads the host store instance.
 *
 * @returns A promise that resolves to the Store instance.
 */
export const loadStore = async (): Promise<Store> => {
  return {
    get: async (key: string) => {
      return await invoke("store:get", { key });
    },
    set: async (key: string, value: any) => {
      await invoke("store:set", { key, value });
    },
    delete: async (key: string) => {
      await invoke("store:delete", { key });
    },
    has: async (key: string) => {
      return await invoke("store:has", { key });
    },
    clear: async () => {
      await invoke("store:clear");
    },
    save: async () => {
      // Host store persists automatically on set
    },
    keys: async () => {
      return await invoke("store:keys");
    },
  };
};
