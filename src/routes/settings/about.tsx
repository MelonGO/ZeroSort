import { AboutPage } from "@/components/settings/AboutPage";
import { createFileRoute } from "@tanstack/react-router";

/**
 * The route configuration for the about settings page.
 */
export const Route = createFileRoute("/settings/about")({
  component: AboutPage,
});
