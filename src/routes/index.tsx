import { createFileRoute } from "@tanstack/react-router";
import { HomeMenu } from "@/components/menu/HomeMenu";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HomeMenu />;
}
