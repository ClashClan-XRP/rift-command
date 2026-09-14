import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "./__root";

/** Unknown paths (Home Screen launching /__grok/, stale room links) go home. */
export const Route = createFileRoute("/$")({
  component: NotFound,
});
