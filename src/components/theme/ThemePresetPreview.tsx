import { cn } from "@/lib/utils";
import type { ThemeStyleProps, ThemeStyles } from "@/types/theme";
import { Moon, Sun } from "lucide-react";

interface ThemePresetPreviewProps {
  styles: ThemeStyles;
  className?: string;
}

interface ThemeModePreviewProps {
  mode: "light" | "dark";
  styles: ThemeStyleProps;
}

/** A compact dual-mode preview that exposes each preset's surfaces, accents, and contrast. */
function ThemePresetPreview({ styles, className }: ThemePresetPreviewProps) {
  return (
    <div
      className={cn(
        "grid h-14 w-full grid-cols-2 gap-1 rounded-md bg-black/5 p-1",
        className,
      )}
    >
      <ThemeModePreview mode="light" styles={styles.light} />
      <ThemeModePreview mode="dark" styles={styles.dark} />
    </div>
  );
}

/** A miniature interface preview for a single theme mode. */
function ThemeModePreview({ mode, styles }: ThemeModePreviewProps) {
  const ModeIcon = mode === "light" ? Sun : Moon;

  return (
    <div
      className="relative overflow-hidden rounded-[0.55rem] border p-1"
      style={{
        backgroundColor: styles.background,
        borderColor: styles.border,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: styles.sidebar }}
      />

      <div className="relative ml-2 flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <div
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full border"
            style={{
              backgroundColor: styles.card,
              borderColor: styles.border,
              color: styles.foreground,
            }}
          >
            <ModeIcon size={8} />
          </div>
          <div
            className="h-1.5 w-3 rounded-full"
            style={{ backgroundColor: styles.accent }}
          />
        </div>

        <div
          className="rounded-[0.45rem] border px-1 py-1"
          style={{
            backgroundColor: styles.card,
            borderColor: styles.border,
          }}
        >
          <div
            className="h-1 w-6 rounded-full"
            style={{
              backgroundColor: styles.foreground,
              opacity: 0.88,
            }}
          />
          <div
            className="mt-1 h-1 w-4 rounded-full"
            style={{
              backgroundColor: styles.foreground,
              opacity: 0.45,
            }}
          />
          <div className="mt-1.5 flex items-center gap-1">
            <div
              className="h-2.5 w-5 rounded-full"
              style={{ backgroundColor: styles.primary }}
            />
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: styles.accent }}
            />
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: styles.secondary }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export { ThemePresetPreview };
