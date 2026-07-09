import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The route configuration for the settings index page.
 * Redirects to general settings on large screens before rendering.
 */
export const Route = createFileRoute("/settings/")(
  typeof window !== "undefined"
    ? {
        beforeLoad: () => {
          if (window.innerWidth >= 768) {
            throw redirect({ to: "/settings/general" });
          }
        },
        component: () => null,
      }
    : {
        component: () => null,
      },
);
