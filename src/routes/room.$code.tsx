import { createFileRoute } from "@tanstack/react-router";
import { Lobby } from "@/components/lobby/Lobby";

export const Route = createFileRoute("/room/$code")({
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  return <Lobby code={code} />;
}
