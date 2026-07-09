import { ColorPicker } from "@/components/theme/ColorPicker";
import { ControlSection } from "@/components/theme/ControlSection";
import { HslAdjustmentControls } from "@/components/theme/HslAdjustmentControls";
import { ShadowControl } from "@/components/theme/ShadowControl";
import { SliderWithInput } from "@/components/theme/SliderWithInput";
import { ThemePresetPreview } from "@/components/theme/ThemePresetPreview";
import { applyThemeToElement } from "@/lib/theme/apply-theme";
import { COMMON_STYLES, defaultThemeState } from "@/lib/theme/config";
import { getPresetThemeStyles } from "@/lib/theme/preset-helper";
import { defaultPresets } from "@/lib/theme/presets";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { useThemeStore } from "@/store/useThemeStore";
import type { ThemeStyleProps, ThemeStyles } from "@/types/theme";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  Moon,
  Paintbrush,
  Palette,
  Sun,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type ThemeTab = "presets" | "colors" | "other";

/**
 * The route configuration for the theme settings page.
 */
export const Route = createFileRoute("/settings/theme")({
  component: ThemeSetting,
});

/**
 * The component for the theme settings page.
 * Displays root-level appearance settings with Presets, Colors, and Other tabs.
 */
function ThemeSetting() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ThemeTab>("presets");
  const themePreset = useStore((state) => state.themePreset);
  const setThemePreset = useStore((state) => state.setThemePreset);
  const applyThemePreset = useThemeStore((state) => state.applyThemePreset);
  const themeState = useThemeStore((state) => state.themeState);
  const setThemeState = useThemeStore((state) => state.setThemeState);

  const currentMode = themeState.currentMode;
  const [editingMode, setEditingMode] = useState<"light" | "dark">(currentMode);

  const currentStyles = useMemo(
    () => ({
      ...defaultThemeState.styles[editingMode],
      ...themeState.styles[editingMode],
    }),
    [editingMode, themeState.styles],
  );

  const markAsCustom = useCallback(() => {
    if (themePreset !== "custom") {
      setThemePreset("custom");
    }
  }, [themePreset, setThemePreset]);

  const updateStyle = useCallback(
    (key: keyof ThemeStyleProps, value: string) => {
      const styles = themeState.styles;

      let newStyles: ThemeStyles;
      if (COMMON_STYLES.includes(key)) {
        newStyles = {
          light: { ...styles.light, [key]: value },
          dark: { ...styles.dark, [key]: value },
        };
      } else {
        newStyles = {
          ...styles,
          [editingMode]: { ...currentStyles, [key]: value },
        };
      }

      const newState = { ...themeState, styles: newStyles };
      setThemeState(newState);
      applyThemeToElement(newState, document.documentElement);
      markAsCustom();
    },
    [themeState, editingMode, currentStyles, setThemeState, markAsCustom],
  );

  const tabs: { key: ThemeTab; label: string }[] = [
    { key: "presets", label: t("settings.theme.tabs.presets") },
    { key: "colors", label: t("settings.theme.tabs.colors") },
    { key: "other", label: t("settings.theme.tabs.other") },
  ];

  const presetEntries = useMemo(
    () =>
      Object.entries(defaultPresets).map(([key, preset]) => ({
        key,
        preset,
        styles: getPresetThemeStyles(key),
      })),
    [],
  );

  return (
    <div className="flex-1 animate-in space-y-6 overflow-y-auto pr-2 duration-500 fade-in slide-in-from-bottom-4">
      <div className="mb-4 flex items-center space-x-2 md:hidden">
        <Link
          to="/settings"
          className="flex items-center text-[1rem] font-medium transition-colors hover:text-accent"
        >
          <ChevronLeft size={20} className="mr-1" />
          {t("settings.back")}
        </Link>
      </div>
      <header>
        <div className="mb-2 flex items-center space-x-3">
          <div className="rounded-xl bg-muted p-2">
            <Palette className="text-foreground" size={24} />
          </div>
          <h1 className="text-2xl font-bold">
            {t("settings.general.interface.themePreset.title")}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("settings.general.interface.themePreset.description")}
        </p>
      </header>

      <section className="space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Presets tab */}
        {activeTab === "presets" && (
          <section>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                <button
                  onClick={() => {
                    applyThemePreset("default");
                    setThemePreset("default");
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all hover:shadow-md",
                    themePreset === "default"
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <ThemePresetPreview styles={defaultThemeState.styles} />
                  <span className="truncate text-[10px] font-medium">
                    {t("settings.general.interface.themePreset.default")}
                  </span>
                  {themePreset === "default" && (
                    <div className="absolute -top-1 -right-1 rounded-full bg-primary p-0.5">
                      <Check size={10} className="text-primary-foreground" />
                    </div>
                  )}
                </button>

                {themePreset === "custom" && (
                  <button className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-primary bg-primary/5 p-2 shadow-sm transition-all hover:shadow-md">
                    <div className="relative w-full">
                      <ThemePresetPreview styles={themeState.styles} />
                      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/10 backdrop-blur-[1px]">
                        <div className="rounded-full border border-border bg-background/90 p-1 shadow-sm">
                          <Paintbrush
                            size={12}
                            className="text-muted-foreground"
                          />
                        </div>
                      </div>
                    </div>
                    <span className="truncate text-[10px] font-medium">
                      {t("settings.general.interface.themePreset.custom")}
                    </span>
                    <div className="absolute -top-1 -right-1 rounded-full bg-primary p-0.5">
                      <Check size={10} className="text-primary-foreground" />
                    </div>
                  </button>
                )}

                {presetEntries.map(({ key, preset, styles }) => {
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        applyThemePreset(key);
                        setThemePreset(key);
                      }}
                      className={cn(
                        "group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all hover:shadow-md",
                        themePreset === key
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <ThemePresetPreview styles={styles} />
                      <span className="truncate text-[10px] font-medium">
                        {preset.label ?? key}
                      </span>
                      {themePreset === key && (
                        <div className="absolute -top-1 -right-1 rounded-full bg-primary p-0.5">
                          <Check
                            size={10}
                            className="text-primary-foreground"
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Colors tab */}
        {activeTab === "colors" && (
          <section className="space-y-2">
            {/* Light / Dark mode toggle for editing */}
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t("settings.theme.editingMode.label")}
              </span>
              <div className="flex gap-1 rounded-md bg-background p-0.5">
                <button
                  onClick={() => setEditingMode("light")}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all",
                    editingMode === "light"
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Sun size={11} />
                  {t("settings.theme.editingMode.light")}
                </button>
                <button
                  onClick={() => setEditingMode("dark")}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all",
                    editingMode === "dark"
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Moon size={11} />
                  {t("settings.theme.editingMode.dark")}
                </button>
              </div>
            </div>
            <ControlSection
              title={t("settings.theme.sections.primaryColors")}
              expanded
            >
              <ColorPicker
                color={currentStyles.primary}
                onChange={(c) => updateStyle("primary", c)}
                label="Primary"
              />
              <ColorPicker
                color={currentStyles["primary-foreground"]}
                onChange={(c) => updateStyle("primary-foreground", c)}
                label="Primary Foreground"
              />
            </ControlSection>

            <ControlSection
              title={t("settings.theme.sections.secondaryColors")}
              expanded
            >
              <ColorPicker
                color={currentStyles.secondary}
                onChange={(c) => updateStyle("secondary", c)}
                label="Secondary"
              />
              <ColorPicker
                color={currentStyles["secondary-foreground"]}
                onChange={(c) => updateStyle("secondary-foreground", c)}
                label="Secondary Foreground"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.accentColors")}>
              <ColorPicker
                color={currentStyles.accent}
                onChange={(c) => updateStyle("accent", c)}
                label="Accent"
              />
              <ColorPicker
                color={currentStyles["accent-foreground"]}
                onChange={(c) => updateStyle("accent-foreground", c)}
                label="Accent Foreground"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.baseColors")}>
              <ColorPicker
                color={currentStyles.background}
                onChange={(c) => updateStyle("background", c)}
                label="Background"
              />
              <ColorPicker
                color={currentStyles.foreground}
                onChange={(c) => updateStyle("foreground", c)}
                label="Foreground"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.cardColors")}>
              <ColorPicker
                color={currentStyles.card}
                onChange={(c) => updateStyle("card", c)}
                label="Card Background"
              />
              <ColorPicker
                color={currentStyles["card-foreground"]}
                onChange={(c) => updateStyle("card-foreground", c)}
                label="Card Foreground"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.popoverColors")}>
              <ColorPicker
                color={currentStyles.popover}
                onChange={(c) => updateStyle("popover", c)}
                label="Popover Background"
              />
              <ColorPicker
                color={currentStyles["popover-foreground"]}
                onChange={(c) => updateStyle("popover-foreground", c)}
                label="Popover Foreground"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.mutedColors")}>
              <ColorPicker
                color={currentStyles.muted}
                onChange={(c) => updateStyle("muted", c)}
                label="Muted"
              />
              <ColorPicker
                color={currentStyles["muted-foreground"]}
                onChange={(c) => updateStyle("muted-foreground", c)}
                label="Muted Foreground"
              />
            </ControlSection>

            <ControlSection
              title={t("settings.theme.sections.destructiveColors")}
            >
              <ColorPicker
                color={currentStyles.destructive}
                onChange={(c) => updateStyle("destructive", c)}
                label="Destructive"
              />
              <ColorPicker
                color={currentStyles["destructive-foreground"]}
                onChange={(c) => updateStyle("destructive-foreground", c)}
                label="Destructive Foreground"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.borderColors")}>
              <ColorPicker
                color={currentStyles.border}
                onChange={(c) => updateStyle("border", c)}
                label="Border"
              />
              <ColorPicker
                color={currentStyles.input}
                onChange={(c) => updateStyle("input", c)}
                label="Input"
              />
              <ColorPicker
                color={currentStyles.ring}
                onChange={(c) => updateStyle("ring", c)}
                label="Ring"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.chartColors")}>
              <ColorPicker
                color={currentStyles["chart-1"]}
                onChange={(c) => updateStyle("chart-1", c)}
                label="Chart 1"
              />
              <ColorPicker
                color={currentStyles["chart-2"]}
                onChange={(c) => updateStyle("chart-2", c)}
                label="Chart 2"
              />
              <ColorPicker
                color={currentStyles["chart-3"]}
                onChange={(c) => updateStyle("chart-3", c)}
                label="Chart 3"
              />
              <ColorPicker
                color={currentStyles["chart-4"]}
                onChange={(c) => updateStyle("chart-4", c)}
                label="Chart 4"
              />
              <ColorPicker
                color={currentStyles["chart-5"]}
                onChange={(c) => updateStyle("chart-5", c)}
                label="Chart 5"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.sidebarColors")}>
              <ColorPicker
                color={currentStyles.sidebar}
                onChange={(c) => updateStyle("sidebar", c)}
                label="Sidebar Background"
              />
              <ColorPicker
                color={currentStyles["sidebar-foreground"]}
                onChange={(c) => updateStyle("sidebar-foreground", c)}
                label="Sidebar Foreground"
              />
              <ColorPicker
                color={currentStyles["sidebar-primary"]}
                onChange={(c) => updateStyle("sidebar-primary", c)}
                label="Sidebar Primary"
              />
              <ColorPicker
                color={currentStyles["sidebar-primary-foreground"]}
                onChange={(c) => updateStyle("sidebar-primary-foreground", c)}
                label="Sidebar Primary Foreground"
              />
              <ColorPicker
                color={currentStyles["sidebar-accent"]}
                onChange={(c) => updateStyle("sidebar-accent", c)}
                label="Sidebar Accent"
              />
              <ColorPicker
                color={currentStyles["sidebar-accent-foreground"]}
                onChange={(c) => updateStyle("sidebar-accent-foreground", c)}
                label="Sidebar Accent Foreground"
              />
              <ColorPicker
                color={currentStyles["sidebar-border"]}
                onChange={(c) => updateStyle("sidebar-border", c)}
                label="Sidebar Border"
              />
              <ColorPicker
                color={currentStyles["sidebar-ring"]}
                onChange={(c) => updateStyle("sidebar-ring", c)}
                label="Sidebar Ring"
              />
            </ControlSection>
          </section>
        )}

        {/* Other tab */}
        {activeTab === "other" && (
          <section className="space-y-2">
            <ControlSection
              title={t("settings.theme.sections.hslAdjustments")}
              expanded
            >
              <HslAdjustmentControls onCustomChange={markAsCustom} />
            </ControlSection>

            <ControlSection
              title={t("settings.theme.sections.radius")}
              expanded
            >
              <SliderWithInput
                value={parseFloat(
                  currentStyles.radius?.replace("rem", "") || "0.625",
                )}
                onChange={(value) => updateStyle("radius", `${value}rem`)}
                min={0}
                max={5}
                step={0.025}
                unit="rem"
                label="Radius"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.spacing")}>
              <SliderWithInput
                value={parseFloat(
                  currentStyles.spacing?.replace("rem", "") || "0.25",
                )}
                onChange={(value) => updateStyle("spacing", `${value}rem`)}
                min={0.15}
                max={0.35}
                step={0.01}
                unit="rem"
                label="Spacing"
              />
            </ControlSection>

            <ControlSection title={t("settings.theme.sections.shadow")}>
              <ShadowControl
                shadowColor={currentStyles["shadow-color"]}
                shadowOpacity={parseFloat(currentStyles["shadow-opacity"])}
                shadowBlur={parseFloat(
                  currentStyles["shadow-blur"]?.replace("px", ""),
                )}
                shadowSpread={parseFloat(
                  currentStyles["shadow-spread"]?.replace("px", ""),
                )}
                shadowOffsetX={parseFloat(
                  currentStyles["shadow-offset-x"]?.replace("px", ""),
                )}
                shadowOffsetY={parseFloat(
                  currentStyles["shadow-offset-y"]?.replace("px", ""),
                )}
                onChange={(key, value) => {
                  if (key === "shadow-color") {
                    updateStyle(key as keyof ThemeStyleProps, value as string);
                  } else if (key === "shadow-opacity") {
                    updateStyle(key as keyof ThemeStyleProps, value.toString());
                  } else {
                    updateStyle(key as keyof ThemeStyleProps, `${value}px`);
                  }
                }}
              />
            </ControlSection>
          </section>
        )}
      </section>
    </div>
  );
}
