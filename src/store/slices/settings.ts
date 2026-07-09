import i18n, { isSupportedLanguage } from "@/i18n";
import { deleteAIApiKey, getAIApiKey, saveAIApiKey } from "@/lib/credentials";
import { loadStore } from "@/lib/persistence";
import {
  AiMenuMode,
  ContentScale,
  Language,
  Theme,
  ZeroSortState,
} from "@/types";
import type { ProviderConfig, StoredProviderConfig } from "@/types/model";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

/**
 * Creates the settings slice of the store.
 * Manages user preferences, AI model configurations, and persistence to the host store.
 */
export const createSettingsSlice = (set: SetState, get: GetState) => ({
  // --- Initial State ---
  modelConfigs: [] as ProviderConfig[],
  activeConfigId: null as string | null,
  selectedModelId: null as string | null,
  showSummary: true,
  theme: "system" as Theme,
  language: "en" as Language,
  interfaceScale: 100,
  contentScale: "base" as ContentScale,
  codeWrapEnabled: false,
  aiMenuMode: "selection" as AiMenuMode,
  showFolderNoteCount: true,
  showCharacterCount: true,
  toolbarGroups: {
    history: true,
    headings: true,
    formatting: true,
    lists: true,
    block: true,
    insert: true,
    tools: true,
  },
  isSettingsLoaded: false,
  includeExistingDirs: false,
  sortBy: "createdAt" as const,
  syncConcurrency: 10,
  batchConcurrency: 1,
  themePreset: "default" as string,

  /**
   * Initializes settings from the host store, with migration from localStorage.
   */
  initSettings: async () => {
    if (get().isSettingsLoaded) return;

    try {
      const store = await loadStore();

      // Define keys to migrate and their default values
      const settingsMap: Record<string, any> = {
        modelConfigs: [],
        activeConfigId: null,
        selectedModelId: null,
        showSummary: true,
        theme: "system",
        language: "en",
        interfaceScale: 100,
        contentScale: "base",
        codeWrapEnabled: false,
        aiMenuMode: "selection",
        includeExistingDirs: false,
        sortBy: "createdAt",
        showFolderNoteCount: true,
        showCharacterCount: true,
        toolbarGroups: {
          history: true,
          headings: true,
          formatting: true,
          lists: true,
          block: true,
          insert: true,
          tools: true,
        },
        syncConcurrency: 10,
        batchConcurrency: 1,
        themePreset: "default",
        openNoteIds: [],
        selectedNoteId: null,
        expandedPaths: ["root"],
      };

      const loadedSettings: Partial<ZeroSortState> = {};

      for (const [key, defaultValue] of Object.entries(settingsMap)) {
        let value = await store.get(key);
        (loadedSettings as any)[key] = value ?? defaultValue;
      }

      const persistedExpandedPaths = (loadedSettings as any).expandedPaths;
      const normalizedExpandedPaths = Array.isArray(persistedExpandedPaths)
        ? persistedExpandedPaths.filter(
            (path): path is string => typeof path === "string",
          )
        : ["root"];
      loadedSettings.expandedPaths = new Set([
        "root",
        ...normalizedExpandedPaths,
      ]);

      // Migrate legacy isAiMenuEnabled boolean to aiMenuMode
      if (
        !(loadedSettings as any).aiMenuMode &&
        (loadedSettings as any).isAiMenuEnabled !== undefined
      ) {
        (loadedSettings as any).aiMenuMode = (loadedSettings as any)
          .isAiMenuEnabled
          ? "selection"
          : "off";
      }
      delete (loadedSettings as any).isAiMenuEnabled;

      // Load API keys from encrypted storage and merge with model configs
      // Also handles migration of old plaintext API keys to encrypted storage
      if (
        loadedSettings.modelConfigs &&
        Array.isArray(loadedSettings.modelConfigs)
      ) {
        const storedConfigs =
          loadedSettings.modelConfigs as (StoredProviderConfig & {
            apiKey?: string;
          })[];

        const fullConfigs: ProviderConfig[] = await Promise.all(
          storedConfigs.map(async (config) => {
            try {
              // Check if old plaintext API key exists in stored config
              if (config.apiKey && config.apiKey.length > 0) {
                // Migrate to encrypted storage
                await saveAIApiKey(config.id, config.apiKey);
                return {
                  ...config,
                  apiKey: config.apiKey,
                };
              }

              // Load from encrypted storage
              const apiKey = await getAIApiKey(config.id);
              return {
                ...config,
                apiKey: apiKey ?? "", // Default to empty string if not found
              };
            } catch (error) {
              console.error(
                `Failed to hydrate API key for model config ${config.id}:`,
                error,
              );
              return {
                ...config,
                apiKey: "",
              };
            }
          }),
        );

        loadedSettings.modelConfigs = fullConfigs;
      }

      await store.save();

      // Sync language with i18n
      if (
        loadedSettings.language &&
        isSupportedLanguage(loadedSettings.language)
      ) {
        i18n.changeLanguage(loadedSettings.language);
      } else {
        loadedSettings.language = "en";
      }

      set({ ...loadedSettings, isSettingsLoaded: true });
    } catch (error) {
      console.error("Failed to initialize settings:", error);
      set({ isSettingsLoaded: true }); // Mark as loaded anyway to avoid infinite retries
    }
  },

  /**
   * Updates the list of AI provider configurations.
   * API keys are stored separately in encrypted storage.
   */
  setModelConfigs: async (configs: ProviderConfig[]) => {
    const store = await loadStore();

    // Save API keys to encrypted storage and strip from stored config
    const storedConfigs: StoredProviderConfig[] = await Promise.all(
      configs.map(async (config) => {
        // Save API key to encrypted storage if present
        if (config.apiKey) {
          await saveAIApiKey(config.id, config.apiKey);
        }
        // Return config without apiKey for plaintext storage
        const { apiKey, ...storedConfig } = config;
        return storedConfig;
      }),
    );

    await store.set("modelConfigs", storedConfigs);
    await store.save();
    set({ modelConfigs: configs });
  },

  /**
   * Sets the active provider configuration ID.
   */
  setActiveConfigId: async (id: string | null) => {
    const store = await loadStore();
    await store.set("activeConfigId", id);
    await store.save();
    set({ activeConfigId: id });
  },

  /**
   * Sets the selected model ID.
   */
  setSelectedModelId: async (id: string | null) => {
    const store = await loadStore();
    await store.set("selectedModelId", id);
    await store.save();
    set({ selectedModelId: id });
  },

  /**
   * Adds a new provider configuration.
   * For openai-compatible providers, allows multiple instances.
   * For other providers, prevents duplicate provider templates.
   */
  addProviderConfig: (config: ProviderConfig) => {
    // Allow multiple openai-compatible providers, prevent duplicates for others
    if (
      config.templateId !== "openai-compatible" &&
      get().modelConfigs.some((c) => c.templateId === config.templateId)
    ) {
      return;
    }
    const newConfigs = [...get().modelConfigs, config];
    get().setModelConfigs(newConfigs);
    get().setActiveConfigId(config.id);
  },

  /**
   * Updates an existing provider configuration.
   */
  updateProviderConfig: (id: string, updates: Partial<ProviderConfig>) => {
    const {
      modelConfigs,
      selectedModelId,
      setSelectedModelId,
      setModelConfigs,
    } = get();
    const existingConfig = modelConfigs.find((c) => c.id === id);
    const newConfigs = modelConfigs.map((c) =>
      c.id === id ? { ...c, ...updates } : c,
    );

    // Use the functional setter to ensure we persist and update state
    setModelConfigs(newConfigs);

    // If a provider is disabled, clear the selected model if it belongs to that provider
    if (updates.enabled === false) {
      const isSelectedModelInConfig = existingConfig?.models.some(
        (m) => m.id === selectedModelId,
      );
      if (isSelectedModelInConfig) {
        setSelectedModelId(null);
      }
    }

    // If models are updated (e.g. a model is deleted), check if the selected model still exists
    if (updates.models) {
      const isSelectedModelStillExists = updates.models.some(
        (m) => m.id === selectedModelId,
      );
      // Only clear if the selected model was originally in this config
      const wasInThisConfig = existingConfig?.models.some(
        (m) => m.id === selectedModelId,
      );
      if (wasInThisConfig && !isSelectedModelStillExists) {
        setSelectedModelId(null);
      }
    }
  },

  /**
   * Deletes a provider configuration and its encrypted API key.
   */
  deleteProviderConfig: async (id: string) => {
    const {
      modelConfigs,
      activeConfigId,
      selectedModelId,
      setSelectedModelId,
      setModelConfigs,
      setActiveConfigId,
    } = get();
    const configToDelete = modelConfigs.find((c) => c.id === id);
    const newConfigs = modelConfigs.filter((c) => c.id !== id);

    // Delete the encrypted API key
    await deleteAIApiKey(id);

    setModelConfigs(newConfigs);

    // If the deleted provider contained the selected model, clear it
    const isSelectedModelInConfig = configToDelete?.models.some(
      (m) => m.id === selectedModelId,
    );
    if (isSelectedModelInConfig) {
      setSelectedModelId(null);
    }

    if (activeConfigId === id) {
      setActiveConfigId(newConfigs.length > 0 ? newConfigs[0].id : null);
    }
  },

  /**
   * Updates and persists the application theme.
   */
  setTheme: async (theme: Theme) => {
    const store = await loadStore();
    await store.set("theme", theme);
    await store.save();
    set({ theme });
  },

  /**
   * Updates and persists the selected theme preset name.
   */
  setThemePreset: async (themePreset: string) => {
    const store = await loadStore();
    await store.set("themePreset", themePreset);
    await store.save();
    set({ themePreset });
  },

  /**
   * Updates and persists the application language.
   */
  setLanguage: async (language: Language) => {
    const store = await loadStore();
    await store.set("language", language);
    await store.save();
    i18n.changeLanguage(language);
    set({ language });
  },

  /**
   * Updates and persists the interface scaling factor.
   */
  setInterfaceScale: async (scale: number) => {
    const store = await loadStore();
    await store.set("interfaceScale", scale);
    await store.save();
    set({ interfaceScale: scale });
  },

  /**
   * Updates and persists the content/editor scaling factor.
   */
  setContentScale: async (scale: ContentScale) => {
    const store = await loadStore();
    await store.set("contentScale", scale);
    await store.save();
    set({ contentScale: scale });
  },

  setCodeWrapEnabled: async (enabled: boolean) => {
    const store = await loadStore();
    await store.set("codeWrapEnabled", enabled);
    await store.save();
    set({ codeWrapEnabled: enabled });
  },

  setAiMenuMode: async (mode: AiMenuMode) => {
    const store = await loadStore();
    await store.set("aiMenuMode", mode);
    await store.save();
    set({ aiMenuMode: mode });
  },

  setShowFolderNoteCount: async (show: boolean) => {
    const store = await loadStore();
    await store.set("showFolderNoteCount", show);
    await store.save();
    set({ showFolderNoteCount: show });
  },

  setShowCharacterCount: async (show: boolean) => {
    const store = await loadStore();
    await store.set("showCharacterCount", show);
    await store.save();
    set({ showCharacterCount: show });
  },

  /**
   * Updates and persists the visibility of editor toolbar button groups.
   */
  setToolbarGroups: async (groups: Partial<ZeroSortState["toolbarGroups"]>) => {
    const current = get().toolbarGroups;
    const updated = { ...current, ...groups };
    const store = await loadStore();
    await store.set("toolbarGroups", updated);
    await store.save();
    set({ toolbarGroups: updated });
  },

  /**
   * Toggles the display of the note summary.
   */
  toggleSummary: async () => {
    const newState = !get().showSummary;
    const store = await loadStore();
    await store.set("showSummary", newState);
    await store.save();
    set({ showSummary: newState });
  },

  /**
   * Updates and persists the preference for including existing directories in AI prompts.
   */
  setIncludeExistingDirs: async (include: boolean) => {
    const store = await loadStore();
    await store.set("includeExistingDirs", include);
    await store.save();
    set({ includeExistingDirs: include });
  },

  /**
   * Sets the sorting field for notes and persists it.
   */
  setSortBy: async (sortBy: ZeroSortState["sortBy"]) => {
    const store = await loadStore();
    await store.set("sortBy", sortBy);
    await store.save();
    set({ sortBy });
  },

  /**
   * Sets the sync concurrency level and persists it to the store.
   */
  setSyncConcurrency: async (concurrency: number) => {
    // Clamp value between 1 and 50
    const clamped = Math.max(1, Math.min(50, concurrency));
    const store = await loadStore();
    await store.set("syncConcurrency", clamped);
    await store.save();
    set({ syncConcurrency: clamped });
  },

  /**
   * Sets the batch regeneration concurrency level and persists it to the store.
   */
  setBatchConcurrency: async (concurrency: number) => {
    const clamped = Math.max(1, Math.min(10, concurrency));
    const store = await loadStore();
    await store.set("batchConcurrency", clamped);
    await store.save();
    set({ batchConcurrency: clamped });
  },
});
