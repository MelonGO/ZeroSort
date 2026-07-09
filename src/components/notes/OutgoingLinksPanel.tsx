import { NoteLink } from "@/types";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

interface OutgoingLinksPanelProps {
  /** Outgoing links to display */
  links: NoteLink[];
  /** Callback when a link is clicked */
  onLinkClick: (noteId: string) => void;
  /** Whether the panel is loading */
  isLoading?: boolean;
}

/**
 * Displays outgoing links from the current note.
 */
export function OutgoingLinksPanel({
  links,
  onLinkClick,
  isLoading = false,
}: OutgoingLinksPanelProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm text-muted-foreground">
            {t("outgoingLinks.loading", "Loading links...")}
          </span>
        </div>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <ExternalLink className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">
          {t("outgoingLinks.empty", "No outgoing links")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("outgoingLinks.hint", "Use [[Note Title]] to link to other notes")}
        </p>
      </div>
    );
  }

  const brokenLinks = links.filter((link) => link.isBroken);
  const validLinks = links.filter(
    (link): link is NoteLink & { targetNoteId: string } =>
      !link.isBroken && !!link.targetNoteId,
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t("outgoingLinks.title", "Outgoing Links")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {links.length}{" "}
          {links.length === 1
            ? t("outgoingLinks.link", "link")
            : t("outgoingLinks.links", "links")}
        </span>
      </div>

      {/* Broken Links Section */}
      {brokenLinks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              {t("outgoingLinks.broken", "Broken Links")} ({brokenLinks.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {brokenLinks.map((link, index) => (
              <div
                key={`${link.targetNoteId}-${index}`}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-destructive truncate line-through">
                    {link.linkText}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Valid Links Section */}
      {validLinks.length > 0 && (
        <div className="space-y-2">
          {brokenLinks.length > 0 && (
            <div className="text-xs font-medium text-muted-foreground">
              {t("outgoingLinks.valid", "Valid Links")}
            </div>
          )}
          <div className="space-y-1.5">
            {validLinks.map((link, index) => (
              <button
                key={`${link.targetNoteId}-${index}`}
                onClick={() => onLinkClick(link.targetNoteId)}
                className="w-full rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:bg-accent/50 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {link.targetTitle}
                    </div>
                    {link.targetSummary && (
                      <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {link.targetSummary}
                      </div>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
