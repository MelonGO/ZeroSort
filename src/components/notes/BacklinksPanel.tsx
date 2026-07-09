import { BacklinkGroup } from "@/types";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BacklinksPanelProps {
  /** Grouped backlinks to display */
  backlinkGroups: BacklinkGroup[];
  /** Callback when a backlink is clicked */
  onBacklinkClick: (noteId: string) => void;
  /** Whether the panel is loading */
  isLoading?: boolean;
}

/**
 * Displays backlinks (incoming links) to the current note.
 */
export function BacklinksPanel({
  backlinkGroups,
  onBacklinkClick,
  isLoading = false,
}: BacklinksPanelProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm text-muted-foreground">
            {t("backlinks.loading", "Loading backlinks...")}
          </span>
        </div>
      </div>
    );
  }

  const totalBacklinks = backlinkGroups.reduce(
    (sum, group) => sum + group.links.length,
    0,
  );

  if (totalBacklinks === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <FileText className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">
          {t("backlinks.empty", "No backlinks yet")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("backlinks.hint", "Links to this note will appear here")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t("backlinks.title", "Backlinks")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {totalBacklinks}{" "}
          {totalBacklinks === 1
            ? t("backlinks.link", "link")
            : t("backlinks.links", "links")}
        </span>
      </div>

      <div className="space-y-3">
        {backlinkGroups.map((group) => (
          <div
            key={group.sourceNote.id}
            className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
          >
            <button
              onClick={() => onBacklinkClick(group.sourceNote.id)}
              className="w-full text-left cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {group.sourceNote.title}
                  </div>
                  {group.sourceNote.summary && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {group.sourceNote.summary}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {group.links.length}{" "}
                  {group.links.length === 1
                    ? t("backlinks.mention", "mention")
                    : t("backlinks.mentions", "mentions")}
                </div>
              </div>

              {group.context && (
                <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                  {group.context}
                </div>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
