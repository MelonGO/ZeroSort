import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * Default error boundary component for catching and displaying route-level errors.
 *
 * @param props - Component properties.
 * @param props.error - The error object caught by the boundary.
 * @returns A fallback UI with error details and recovery options.
 */
export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  console.error("DefaultCatchBoundary Error:", error);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            router.invalidate();
          }}
          className={`rounded-sm bg-muted px-2 py-1 font-extrabold text-muted-foreground uppercase`}
        >
          {t("common.tryAgain")}
        </button>
        {isRoot ? (
          <Link
            to="/"
            className={`rounded-sm bg-muted px-2 py-1 font-extrabold text-muted-foreground uppercase`}
          >
            {t("common.home")}
          </Link>
        ) : (
          <Link
            to="/"
            className={`rounded-sm bg-muted px-2 py-1 font-extrabold text-muted-foreground uppercase`}
            onClick={(e) => {
              e.preventDefault();
              window.history.back();
            }}
          >
            {t("common.goBack")}
          </Link>
        )}
      </div>
    </div>
  );
}
