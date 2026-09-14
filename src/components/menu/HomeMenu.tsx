import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, Swords, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MAP_META } from "@/game/maps";
import { RACES, assetUrl } from "@/game/config";
import type { Difficulty, GameType, MapId, RaceId, SlotConfig, SlotKind } from "@/game/types";
import { markRoomLeader } from "@/components/lobby/Lobby";
import { MatchView } from "@/components/game/MatchView";
import type { MatchSetup } from "@/game/types";

const DIFFS: Difficulty[] = ["idle", "easy", "standard", "hard", "insane"];

function roomCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += a[(Math.random() * a.length) | 0];
  return s;
}

function defaultSlots(n: number): SlotConfig[] {
  return Array.from({ length: 6 }, (_, i) => ({
    kind: i === 0 ? "human" : i < n ? "cpu" : "closed",
    name: i === 0 ? "You" : `CPU ${i}`,
    race: (["aegis", "striker", "foundry"] as RaceId[])[i % 3],
    difficulty: "standard" as Difficulty,
    team: 0,
  }));
}

export function HomeMenu() {
  const nav = useNavigate();
  const [view, setView] = useState<"home" | "skirmish" | "join" | "how">("home");
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [mapId, setMapId] = useState<MapId>("bastion");
  const [gameType, setGameType] = useState<GameType>("ffa");
  const [slots, setSlots] = useState<SlotConfig[]>(() => defaultSlots(2));
  const [join, setJoin] = useState("");
  const [name, setName] = useState("Commander");

  const map = MAP_META.find((m) => m.id === mapId)!;
  const filled = slots.filter((s) => s.kind === "human" || s.kind === "cpu");

  const startSkirmish = () => {
    const live = slots.filter((s) => s.kind === "human" || s.kind === "cpu").slice(0, map.maxPlayers);
    if (live.length < 2) return;
    live[0] = { ...live[0], kind: "human", name: name || "You" };
    setMatch({
      mapId,
      gameType,
      slots: live,
      localOwner: 0,
    });
  };

  if (match) {
    return <MatchView setup={match} isHost onExit={() => setMatch(null)} />;
  }

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      <img
        src={assetUrl("game/maps/menu-bg.jpg")}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/80 to-bg" />
      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-[max(20px,env(safe-area-inset-top))]">
        {view === "home" && (
          <div className="flex flex-1 flex-col justify-end gap-6 sm:justify-center">
            <header>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">Protected holds · six seats</p>
              <h1 className="font-display text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
                Rift Command
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
                Three similar factions. Unlimited ore and flux. Every spawn sits behind a choke — no
                instant openers.
              </p>
            </header>
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={() => setView("skirmish")}>
                <Swords className="size-4" />
                Skirmish vs AI
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  const code = roomCode();
                  markRoomLeader(code);
                  nav({ to: "/room/$code", params: { code } });
                }}
              >
                <Plus className="size-4" />
                Create room
              </Button>
              <Button size="lg" variant="outline" onClick={() => setView("join")}>
                <Users className="size-4" />
                Join room
              </Button>
              <button
                type="button"
                className="mt-2 text-left text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
                onClick={() => setView("how")}
              >
                How to play
              </button>
            </div>
          </div>
        )}

        {view === "join" && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Join a room</CardTitle>
              <CardDescription>Enter the five-character code from your host.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Label htmlFor="code">Room code</Label>
              <Input
                id="code"
                value={join}
                onChange={(e) => setJoin(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="K7M2Q"
                autoCapitalize="characters"
              />
              <Button
                disabled={join.trim().length < 4}
                onClick={() => nav({ to: "/room/$code", params: { code: join.trim().toUpperCase() } })}
              >
                Join
              </Button>
              <Button variant="ghost" onClick={() => setView("home")}>
                Back
              </Button>
            </CardContent>
          </Card>
        )}

        {view === "how" && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Field manual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-muted">
              <p>Each hold is gated. A spawn shield lasts 75 seconds — enemy units cannot enter.</p>
              <p>Ore and flux nodes never empty. Keep riggers harvesting.</p>
              <p>Aegis, Striker, and Foundry share the same roster with slight tilts in hull, speed, and production.</p>
              <p>Phone: drag to pan, pinch to zoom, tap to select and order. Use the command grid to build and train.</p>
              <p>Desktop: WASD pans, left-drag boxes, right-click moves, A then click attack-moves.</p>
              <Button className="mt-2" variant="secondary" onClick={() => setView("home")}>
                Back
              </Button>
            </CardContent>
          </Card>
        )}

        {view === "skirmish" && (
          <div className="flex flex-col gap-4 pb-6">
            <button
              type="button"
              className="text-left text-sm text-muted"
              onClick={() => setView("home")}
            >
              Back
            </button>
            <h2 className="font-display text-3xl font-semibold">Skirmish</h2>
            <Label htmlFor="cmdr">Callsign</Label>
            <Input id="cmdr" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />

            <Label>Map</Label>
            <div className="grid grid-cols-3 gap-2">
              {MAP_META.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMapId(m.id);
                    setSlots(defaultSlots(m.maxPlayers));
                  }}
                  className={`overflow-hidden rounded-[var(--radius-md)] border text-left ${
                    mapId === m.id ? "border-accent" : "border-border"
                  }`}
                >
                  <img src={m.thumb} alt="" className="aspect-square w-full object-cover" />
                  <span className="block px-2 py-1.5 text-[11px] leading-tight">{m.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{map.blurb}</p>

            <Label>Game type</Label>
            <div className="flex gap-2">
              {(["ffa", "teams"] as GameType[]).map((g) => (
                <Button
                  key={g}
                  variant={gameType === g ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setGameType(g)}
                >
                  {g === "ffa" ? "Free for all" : "Teams"}
                </Button>
              ))}
            </div>

            <Label>Seats</Label>
            <div className="flex flex-col gap-2">
              {slots.slice(0, map.maxPlayers).map((slot, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-elevated p-2"
                >
                  <Badge>{i + 1}</Badge>
                  <select
                    className="h-10 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-sm"
                    value={slot.kind}
                    onChange={(e) => {
                      const kind = e.target.value as SlotKind;
                      setSlots((prev) =>
                        prev.map((s, j) =>
                          j === i
                            ? { ...s, kind, name: kind === "human" ? name : kind === "cpu" ? `CPU ${i + 1}` : "" }
                            : s,
                        ),
                      );
                    }}
                  >
                    {i === 0 ? (
                      <option value="human">You</option>
                    ) : (
                      <>
                        <option value="cpu">Computer</option>
                        <option value="closed">Closed</option>
                      </>
                    )}
                  </select>
                  <select
                    className="h-10 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-sm"
                    value={slot.race}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((s, j) => (j === i ? { ...s, race: e.target.value as RaceId } : s)),
                      )
                    }
                  >
                    {Object.values(RACES).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {slot.kind === "cpu" && (
                    <select
                      className="h-10 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-sm"
                      value={slot.difficulty}
                      onChange={(e) =>
                        setSlots((prev) =>
                          prev.map((s, j) =>
                            j === i ? { ...s, difficulty: e.target.value as Difficulty } : s,
                          ),
                        )
                      }
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
            </div>

            <Button size="lg" disabled={filled.length < 2} onClick={startSkirmish}>
              Launch
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
