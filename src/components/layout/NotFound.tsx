import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * Component to display when a requested route or resource is not found.
 *
 * @param props - Component properties.
 * @param props.children - Optional custom content to display.
 * @returns A themed "Not Found" page with navigation options.
 */
export function NotFound({ children }: { children?: any }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 p-2">
      <div className="text-muted-foreground">
        {children || <p>{t("notFound.description")}</p>}
      </div>
      <p className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => window.history.back()}
          className="rounded-sm bg-primary px-2 py-1 text-sm font-black text-primary-foreground uppercase"
        >
          {t("common.goBack")}
        </button>
        <Link
          to="/"
          className="rounded-sm bg-secondary px-2 py-1 text-sm font-black text-secondary-foreground uppercase"
        >
          {t("notFound.startOver")}
        </Link>
      </p>
    </div>
  );
}
