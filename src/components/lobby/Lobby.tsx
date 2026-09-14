import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Signal } from "lucide-react";
import { useP2PRoom } from "@/lib/multiplayer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MAP_META } from "@/game/maps";
import { RACES } from "@/game/config";
import { MatchView } from "@/components/game/MatchView";
import { Session } from "@/game/session";
import type {
  Command,
  Difficulty,
  GameType,
  LobbyState,
  MapId,
  MatchSetup,
  RaceId,
  SlotConfig,
  SlotKind,
} from "@/game/types";

const DIFFS: Difficulty[] = ["idle", "easy", "standard", "hard", "insane"];

function emptySlots(): SlotConfig[] {
  return Array.from({ length: 6 }, (_, i) => ({
    kind: i === 0 ? "open" : i === 1 ? "cpu" : "closed",
    name: i === 0 ? "Host" : i === 1 ? "CPU 2" : "",
    race: (["aegis", "striker", "foundry"] as RaceId[])[i % 3],
    difficulty: "standard",
    team: 0,
  }));
}

export function Lobby({ code }: { code: string }) {
  const nav = useNavigate();
  const [name] = useState(
    () => localStorage.getItem("rift-name") || `Cmdr ${Math.floor(Math.random() * 90 + 10)}`,
  );
  const p2p = useP2PRoom({ room: code, name });
  const [lobby, setLobby] = useState<LobbyState>(() => ({
    hostId: "",
    mapId: "bastion",
    gameType: "ffa",
    slots: emptySlots(),
    started: false,
  }));
  const [setup, setSetup] = useState<MatchSetup | null>(null);
  const [isHost, setIsHost] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const hostRef = useRef(false);
  const snapTimer = useRef<number>(0);

  const map = MAP_META.find((m) => m.id === lobby.mapId)!;

  useEffect(() => {
    localStorage.setItem("rift-name", name);
  }, [name]);

  useEffect(() => {
    return p2p.onMessage((from, data) => {
      const msg = data as { t: string; [k: string]: unknown };
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "lobby") {
        setLobby(msg.lobby as LobbyState);
        hostRef.current = (msg.lobby as LobbyState).hostId === p2p.selfId;
        setIsHost(hostRef.current);
      }
      if (msg.t === "hello" && hostRef.current) {
        setLobby((prev) => {
          const slots = prev.slots.map((s) => ({ ...s }));
          const open = slots.findIndex((s) => s.kind === "open");
          if (open >= 0) {
            slots[open] = {
              ...slots[open],
              kind: "human",
              name: String(msg.name || "Guest"),
              race: (msg.race as RaceId) || "aegis",
              peerId: from,
            };
          }
          const next = { ...prev, slots };
          p2p.send({ t: "lobby", lobby: next });
          return next;
        });
      }
      if (msg.t === "start") {
        const st = msg.setup as MatchSetup;
        setSetup(st);
      }
      if (msg.t === "cmd" && hostRef.current && sessionRef.current) {
        const owner = sessionRef.current.world.players.findIndex((p) => p.peerId === from);
        if (owner >= 0) sessionRef.current.applyRemote(msg.c as Command, owner);
      }
      if (msg.t === "snap" && !hostRef.current && sessionRef.current) {
        sessionRef.current.world.applySnapshot(
          msg.s as ReturnType<NonNullable<typeof sessionRef.current>["world"]["snapshot"]>,
        );
      }
    });
  }, [p2p]);

  useEffect(() => {
    if (!p2p.joined) return;
    if (!lobby.hostId) {
      // First successful join: claim host if we appear first in roster.
      const ids = [p2p.selfId, ...p2p.peers.map((p) => p.id)].sort();
      const host = ids[0];
      if (host === p2p.selfId && !hostRef.current) {
        hostRef.current = true;
        setIsHost(true);
        setLobby((prev) => {
          const slots = emptySlots();
          slots[0] = {
            kind: "human",
            name,
            race: "aegis",
            difficulty: "standard",
            peerId: p2p.selfId,
            team: 0,
          };
          slots[1] = { ...slots[1], kind: "cpu", name: "CPU 2" };
          const next = { ...prev, hostId: p2p.selfId, slots };
          p2p.send({ t: "lobby", lobby: next });
          return next;
        });
      } else if (host !== p2p.selfId) {
        p2p.send({ t: "hello", name, race: "aegis" });
      }
    }
  }, [p2p.joined, p2p.peers, p2p.selfId, lobby.hostId, name, p2p]);

  useEffect(() => {
    if (!setup || !isHost) return;
    snapTimer.current = window.setInterval(() => {
      const s = sessionRef.current;
      if (!s) return;
      p2p.broadcast({ t: "snap", s: s.world.snapshot() });
    }, 80);
    return () => clearInterval(snapTimer.current);
  }, [setup, isHost, p2p]);

  const share = useMemo(() => {
    if (typeof window === "undefined") return code;
    return `${window.location.origin}/room/${code}`;
  }, [code]);

  const patch = (next: LobbyState) => {
    setLobby(next);
    p2p.send({ t: "lobby", lobby: next });
  };

  const launch = () => {
    const live = lobby.slots
      .filter((s) => s.kind === "human" || s.kind === "cpu")
      .slice(0, map.maxPlayers);
    if (live.length < 2) return;
    const payload = {
      t: "start" as const,
      mapId: lobby.mapId,
      gameType: lobby.gameType,
      slots: live,
      hostPeer: p2p.selfId,
    };
    p2p.send(payload);
    const localOwner = Math.max(
      0,
      live.findIndex((s) => s.peerId === p2p.selfId),
    );
    setSetup({
      mapId: lobby.mapId,
      gameType: lobby.gameType,
      slots: live,
      localOwner,
      hostPeer: p2p.selfId,
    });
  };

  useEffect(() => {
    return p2p.onMessage((_from, data) => {
      const msg = data as { t?: string; mapId?: MapId; gameType?: GameType; slots?: SlotConfig[]; hostPeer?: string };
      if (msg?.t === "start" && msg.slots && !setup) {
        const localOwner = Math.max(
          0,
          msg.slots.findIndex((s) => s.peerId === p2p.selfId),
        );
        setSetup({
          mapId: msg.mapId ?? "bastion",
          gameType: msg.gameType ?? "ffa",
          slots: msg.slots,
          localOwner,
          hostPeer: msg.hostPeer,
        });
      }
    });
  }, [p2p, setup]);

  if (setup) {
    return (
      <MatchView
        setup={setup}
        isHost={isHost}
        sessionRef={sessionRef}
        onExit={() => nav({ to: "/" })}
        onCommand={(c) => p2p.send({ t: "cmd", c })}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-bg px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))] text-fg">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Room</p>
            <h1 className="font-display text-4xl font-semibold tracking-tight">{code}</h1>
          </div>
          <Badge tone={p2p.joined ? "ok" : "default"}>
            <Signal className="mr-1 inline size-3" />
            {p2p.joined ? `${p2p.peers.length + 1} linked` : "linking"}
          </Badge>
        </div>
        <p className="text-sm text-muted">
          {isHost ? "You lead the table. Pick map, mode, and who sits where." : "Waiting on the host to set the field."}
        </p>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(share)}
          >
            <Copy className="size-4" />
            Copy link
          </Button>
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/" })}>
            Leave
          </Button>
        </div>

        <Label>Map</Label>
        <div className="grid grid-cols-3 gap-2">
          {MAP_META.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={!isHost}
              onClick={() => patch({ ...lobby, mapId: m.id })}
              className={`overflow-hidden rounded-[var(--radius-md)] border text-left disabled:opacity-70 ${
                lobby.mapId === m.id ? "border-accent" : "border-border"
              }`}
            >
              <img src={m.thumb} alt="" className="aspect-square w-full object-cover" />
              <span className="block px-2 py-1 text-[11px]">{m.name}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(["ffa", "teams"] as GameType[]).map((g) => (
            <Button
              key={g}
              size="sm"
              disabled={!isHost}
              variant={lobby.gameType === g ? "default" : "secondary"}
              onClick={() => patch({ ...lobby, gameType: g })}
            >
              {g === "ffa" ? "Free for all" : "Teams"}
            </Button>
          ))}
        </div>

        <Label>Seats — host assigns computers and difficulty</Label>
        {lobby.slots.slice(0, map.maxPlayers).map((slot, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-2"
          >
            <Badge>{i + 1}</Badge>
            {isHost ? (
              <select
                className="h-10 rounded-[var(--radius-sm)] border border-border bg-elevated px-2 text-sm"
                value={slot.kind}
                onChange={(e) => {
                  const kind = e.target.value as SlotKind;
                  const slots = lobby.slots.map((s, j) =>
                    j === i
                      ? {
                          ...s,
                          kind,
                          name:
                            kind === "cpu"
                              ? `CPU ${i + 1}`
                              : kind === "human"
                                ? s.name || "Seat"
                                : "",
                          peerId: kind === "human" ? s.peerId : undefined,
                        }
                      : s,
                  );
                  patch({ ...lobby, slots });
                }}
              >
                <option value="open">Open</option>
                <option value="human">Human</option>
                <option value="cpu">Computer</option>
                <option value="closed">Closed</option>
              </select>
            ) : (
              <span className="text-sm">{slot.kind}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{slot.name || "—"}</span>
            <select
              className="h-10 rounded-[var(--radius-sm)] border border-border bg-elevated px-2 text-sm"
              value={slot.race}
              disabled={!isHost && slot.peerId !== p2p.selfId}
              onChange={(e) => {
                const slots = lobby.slots.map((s, j) =>
                  j === i ? { ...s, race: e.target.value as RaceId } : s,
                );
                patch({ ...lobby, slots });
              }}
            >
              {Object.values(RACES).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {slot.kind === "cpu" && isHost && (
              <select
                className="h-10 rounded-[var(--radius-sm)] border border-border bg-elevated px-2 text-sm"
                value={slot.difficulty}
                onChange={(e) => {
                  const slots = lobby.slots.map((s, j) =>
                    j === i ? { ...s, difficulty: e.target.value as Difficulty } : s,
                  );
                  patch({ ...lobby, slots });
                }}
              >
                {DIFFS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}

        {p2p.peers.some((p) => p.connectionState === "failed") && (
          <p className="text-xs text-danger">
            A peer could not connect (strict network). They can still spectate the lobby; try a new room if the mesh fails.
          </p>
        )}

        {isHost && (
          <Button size="lg" onClick={launch}>
            Start match
          </Button>
        )}
        {!isHost && <p className="text-sm text-muted">The host starts the match.</p>}
      </div>
    </div>
  );
}
