import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Signal } from "lucide-react";
import { useP2PRoom } from "@/lib/multiplayer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
const KINDS: { id: SlotKind; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "human", label: "Human" },
  { id: "cpu", label: "Computer" },
  { id: "closed", label: "Closed" },
];

export function markRoomLeader(code: string) {
  try {
    sessionStorage.setItem(`rift-host-${code}`, "1");
  } catch {
    /* private mode */
  }
}

function isRoomLeader(code: string) {
  try {
    return sessionStorage.getItem(`rift-host-${code}`) === "1";
  } catch {
    return false;
  }
}

function emptySlots(leaderName: string, lead: boolean): SlotConfig[] {
  return Array.from({ length: 6 }, (_, i) => ({
    kind: i === 0 ? (lead ? "human" : "open") : i === 1 ? "cpu" : "closed",
    name: i === 0 ? (lead ? leaderName : "Host") : i === 1 ? "CPU 2" : "",
    race: (["aegis", "striker", "foundry"] as RaceId[])[i % 3],
    difficulty: "standard" as Difficulty,
    team: 0,
  }));
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-2 text-[13px] font-medium",
        active ? "border-accent bg-accent/20 text-fg" : "border-border bg-elevated text-muted",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function Lobby({ code }: { code: string }) {
  const nav = useNavigate();
  const lead = useMemo(() => isRoomLeader(code), [code]);
  const [name] = useState(
    () => localStorage.getItem("rift-name") || `Cmdr ${Math.floor(Math.random() * 90 + 10)}`,
  );
  const p2p = useP2PRoom({ room: code, name });
  const [lobby, setLobby] = useState<LobbyState>(() => ({
    hostId: lead ? "local" : "",
    mapId: "bastion",
    gameType: "ffa",
    slots: emptySlots(name, lead),
    started: false,
  }));
  const [setup, setSetup] = useState<MatchSetup | null>(null);
  const [isHost, setIsHost] = useState(lead);
  const sessionRef = useRef<Session | null>(null);
  const hostRef = useRef(lead);
  const announced = useRef(false);
  const snapTimer = useRef<number>(0);

  const map = MAP_META.find((m) => m.id === lobby.mapId)!;
  const liveCount = lobby.slots.filter((s) => s.kind === "human" || s.kind === "cpu").length;

  useEffect(() => {
    localStorage.setItem("rift-name", name);
  }, [name]);

  useEffect(() => {
    return p2p.onMessage((from, data) => {
      const msg = data as { t: string; [k: string]: unknown };
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "lobby") {
        const next = msg.lobby as LobbyState;
        setLobby(next);
        hostRef.current = next.hostId === p2p.selfId || lead;
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
      if (msg.t === "cmd" && hostRef.current && sessionRef.current) {
        const owner = sessionRef.current.world.players.findIndex((p) => p.peerId === from);
        if (owner >= 0) sessionRef.current.applyRemote(msg.c as Command, owner);
      }
      if (msg.t === "snap" && !hostRef.current && sessionRef.current) {
        sessionRef.current.world.applySnapshot(
          msg.s as ReturnType<NonNullable<typeof sessionRef.current>["world"]["snapshot"]>,
        );
      }
      if (msg.t === "start" && msg.slots && !setup) {
        const slots = msg.slots as SlotConfig[];
        const localOwner = Math.max(
          0,
          slots.findIndex((s) => s.peerId === p2p.selfId),
        );
        setSetup({
          mapId: (msg.mapId as MapId) ?? "bastion",
          gameType: (msg.gameType as GameType) ?? "ffa",
          slots,
          localOwner,
          hostPeer: msg.hostPeer as string | undefined,
        });
      }
    });
  }, [p2p, setup, lead]);

  useEffect(() => {
    if (!p2p.joined) return;
    if (hostRef.current) {
      if (announced.current) return;
      announced.current = true;
      setLobby((prev) => {
        const slots = prev.slots.map((s, i) =>
          i === 0 ? { ...s, kind: "human" as const, name, peerId: p2p.selfId } : s,
        );
        const next = { ...prev, hostId: p2p.selfId, slots };
        p2p.send({ t: "lobby", lobby: next });
        return next;
      });
      return;
    }
    p2p.send({ t: "hello", name, race: "aegis" });
  }, [p2p.joined, p2p.peers.length, p2p, name]);

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
    const root = import.meta.env.BASE_URL || "/";
    const path = `${root}room/${code}`.replace(/\/{2,}/g, "/");
    return `${window.location.origin}${path}`;
  }, [code]);

  const patch = (next: LobbyState) => {
    setLobby(next);
    if (p2p.joined) p2p.send({ t: "lobby", lobby: next });
  };

  const setSlot = (i: number, patchSlot: Partial<SlotConfig>) => {
    const slots = lobby.slots.map((s, j) => (j === i ? { ...s, ...patchSlot } : s));
    patch({ ...lobby, slots });
  };

  const launch = () => {
    const live = lobby.slots
      .filter((s) => s.kind === "human" || s.kind === "cpu")
      .slice(0, map.maxPlayers)
      .map((s, i) =>
        i === 0 && isHost ? { ...s, kind: "human" as const, name, peerId: p2p.selfId } : s,
      );
    if (live.length < 2) return;
    const payload = {
      t: "start" as const,
      mapId: lobby.mapId,
      gameType: lobby.gameType,
      slots: live,
      hostPeer: p2p.selfId,
    };
    if (p2p.joined) p2p.send(payload);
    setSetup({
      mapId: lobby.mapId,
      gameType: lobby.gameType,
      slots: live,
      localOwner: Math.max(
        0,
        live.findIndex((s) => s.peerId === p2p.selfId || (isHost && s.kind === "human")),
      ),
      hostPeer: p2p.selfId,
    });
  };

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

  const locked = !isHost;

  return (
    <div className="min-h-dvh bg-bg px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] text-fg">
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
          {isHost
            ? "You lead this room. Tap a map, mode, and seats — you can start vs computers while friends link."
            : "Waiting on the host to set the field."}
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
              disabled={locked}
              onClick={() => patch({ ...lobby, mapId: m.id })}
              className={cn(
                "overflow-hidden rounded-[var(--radius-md)] border text-left",
                lobby.mapId === m.id ? "border-accent" : "border-border",
                locked && "pointer-events-none opacity-50",
              )}
            >
              <img src={m.thumb} alt="" className="pointer-events-none aspect-square w-full object-cover" />
              <span className="block px-2 py-1.5 text-[11px] leading-tight">{m.name}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{map.blurb}</p>

        <Label>Game type</Label>
        <div className="flex gap-2">
          {(["ffa", "teams"] as GameType[]).map((g) => (
            <Chip
              key={g}
              disabled={locked}
              active={lobby.gameType === g}
              onClick={() => patch({ ...lobby, gameType: g })}
            >
              {g === "ffa" ? "Free for all" : "Teams"}
            </Chip>
          ))}
        </div>

        <Label>Seats</Label>
        {lobby.slots.slice(0, map.maxPlayers).map((slot, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge>{i + 1}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm">{slot.name || "Empty"}</span>
            </div>
            <div className="flex gap-1.5">
              {(i === 0 && isHost ? KINDS.filter((k) => k.id === "human") : KINDS).map((k) => (
                <Chip
                  key={k.id}
                  disabled={locked}
                  active={slot.kind === k.id}
                  onClick={() =>
                    setSlot(i, {
                      kind: k.id,
                      name:
                        k.id === "cpu"
                          ? `CPU ${i + 1}`
                          : k.id === "human"
                            ? i === 0
                              ? name
                              : slot.name || "Seat"
                            : "",
                      peerId: k.id === "human" ? slot.peerId ?? (i === 0 ? p2p.selfId : undefined) : undefined,
                    })
                  }
                >
                  {i === 0 && k.id === "human" ? "You" : k.label}
                </Chip>
              ))}
            </div>
            {slot.kind !== "closed" && slot.kind !== "open" && (
              <div className="flex gap-1.5">
                {Object.values(RACES).map((r) => (
                  <Chip
                    key={r.id}
                    disabled={locked && slot.peerId !== p2p.selfId}
                    active={slot.race === r.id}
                    onClick={() => setSlot(i, { race: r.id })}
                  >
                    {r.name}
                  </Chip>
                ))}
              </div>
            )}
            {slot.kind === "cpu" && (
              <div className="flex flex-wrap gap-1.5">
                {DIFFS.map((d) => (
                  <Chip
                    key={d}
                    disabled={locked}
                    active={slot.difficulty === d}
                    onClick={() => setSlot(i, { difficulty: d })}
                  >
                    {d}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        ))}

        {p2p.peers.some((p) => p.connectionState === "failed") ? (
          <p className="text-xs text-danger">
            One seat could not punch through. Keep them as a computer, or retry on Wi-Fi.
          </p>
        ) : null}

        {isHost ? (
          <Button size="lg" disabled={liveCount < 2} onClick={launch}>
            Start match
          </Button>
        ) : (
          <p className="text-sm text-muted">The host starts the match.</p>
        )}
      </div>
    </div>
  );
}
