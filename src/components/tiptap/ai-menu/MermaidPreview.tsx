import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Workflow } from "lucide-react";

import { PreviewFooter, PreviewHeader } from "./PreviewShared";

// ---------------------------------------------------------------------------
// MermaidPreview
// ---------------------------------------------------------------------------

interface MermaidPreviewProps {
  mermaidContent: string;
  isLoading: boolean;
  onDiscard: () => void;
  onInsertAtPosition: () => void;
  onInterrupt: () => void;
}

let previewRenderCounter = 0;

export const MermaidPreview: React.FC<MermaidPreviewProps> = ({
  mermaidContent,
  isLoading,
  onDiscard,
  onInsertAtPosition,
  onInterrupt,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mermaidContent || !containerRef.current) return;

    const handler = setTimeout(async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("dark")
            ? "dark"
            : "default",
          securityLevel: "strict",
          suppressErrorRendering: true,
        });

        const id = `mermaid-preview-${++previewRenderCounter}`;
        const { svg } = await mermaid.render(id, mermaidContent);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
        setError(e instanceof Error ? e.message : "Invalid mermaid syntax");
      }
    }, 150);

    return () => clearTimeout(handler);
  }, [mermaidContent]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewHeader
        icon={<Workflow size={12} />}
        iconColor="text-teal-500"
        label={t("aiMenu.mermaidPreview")}
        isLoading={isLoading}
        onClose={onDiscard}
        onInterrupt={onInterrupt}
      />
      <div className="h-52 overflow-hidden">
        {error ? (
          <div className="flex h-full items-center justify-center p-4">
            <pre className="max-w-full overflow-auto text-xs text-destructive">
              {error}
            </pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="flex h-full w-full items-center justify-center overflow-auto [&>svg]:max-h-full [&>svg]:max-w-full"
          />
        )}
      </div>
      <PreviewFooter
        onDiscard={onDiscard}
        onInsertAtPosition={onInsertAtPosition}
        isLoading={isLoading}
      />
    </div>
  );
};
