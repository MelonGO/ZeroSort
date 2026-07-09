import React from "react";
import { useTranslation } from "react-i18next";

import { GitBranch } from "lucide-react";

import { PreviewFooter, PreviewHeader } from "./PreviewShared";

// ---------------------------------------------------------------------------
// MarkmapPreview
// ---------------------------------------------------------------------------

interface MarkmapPreviewProps {
  markmapSvgRef: React.RefObject<SVGSVGElement | null>;
  isLoading: boolean;
  onDiscard: () => void;
  onInsertAtPosition: () => void;
  onInterrupt: () => void;
}

export const MarkmapPreview: React.FC<MarkmapPreviewProps> = ({
  markmapSvgRef,
  isLoading,
  onDiscard,
  onInsertAtPosition,
  onInterrupt,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewHeader
        icon={<GitBranch size={12} />}
        iconColor="text-blue-500"
        label={t("aiMenu.mindmapPreview")}
        isLoading={isLoading}
        onClose={onDiscard}
        onInterrupt={onInterrupt}
      />
      <div className="h-52 overflow-hidden">
        <svg ref={markmapSvgRef} className="h-full w-full" />
      </div>
      <PreviewFooter
        onDiscard={onDiscard}
        onInsertAtPosition={onInsertAtPosition}
        isLoading={isLoading}
      />
    </div>
  );
};
