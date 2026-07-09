import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Sparkles } from "lucide-react";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import "katex/dist/katex.min.css";
import { Streamdown } from "streamdown";

import { PreviewFooter, PreviewHeader } from "./PreviewShared";

// ---------------------------------------------------------------------------
// TextPreview
// ---------------------------------------------------------------------------

interface TextPreviewProps {
  generatedText: string;
  streamedText: string;
  isLoading: boolean;
  onCopy: () => void;
  onDiscard: () => void;
  onInsertAtPosition: () => void;
  onInterrupt: () => void;
}

export const TextPreview: React.FC<TextPreviewProps> = ({
  generatedText,
  streamedText,
  isLoading,
  onCopy,
  onDiscard,
  onInsertAtPosition,
  onInterrupt,
}) => {
  const { t } = useTranslation();

  const scrollContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && isLoading && streamedText) {
        node.scrollTop = node.scrollHeight;
      }
    },
    [isLoading, streamedText],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewHeader
        icon={<Sparkles size={12} />}
        iconColor="text-purple-500"
        label={t("aiMenu.preview")}
        isLoading={isLoading}
        onClose={onDiscard}
        onCopy={onCopy}
        onInterrupt={onInterrupt}
      />
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        <Streamdown plugins={{ code, math, cjk }} isAnimating={isLoading}>
          {generatedText || streamedText}
        </Streamdown>
      </div>
      <PreviewFooter
        onDiscard={onDiscard}
        onInsertAtPosition={onInsertAtPosition}
        isLoading={isLoading}
      />
    </div>
  );
};
