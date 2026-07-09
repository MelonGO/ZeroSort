import { memo } from "react";
import { useTranslation } from "react-i18next";

export const BoardSummary = memo(function BoardSummary({
  columnCount,
  totalCards,
}: {
  columnCount: number;
  totalCards: number;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "kanban" });

  return (
    <dl className="kanban-summary" aria-label={t("summary.ariaLabel")}>
      <div>
        <dt>{t("summary.columns")}</dt>
        <dd>{columnCount}</dd>
      </div>
      <div>
        <dt>{t("summary.cards")}</dt>
        <dd>{totalCards}</dd>
      </div>
    </dl>
  );
});
