import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronUp,
  Crosshair,
  GripHorizontal,
  Home,
  LayoutGrid,
  Maximize2,
  MoreVertical,
  Pause,
  Route,
  Shield,
  Square,
  Swords,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUILDINGS, BUILDING_SPRITE, UNITS, UNIT_SPRITE } from "@/game/config";
import { drawMinimap, drawWorld, screenToWorld, type Cam } from "@/game/render";
import { Session } from "@/game/session";
import { setMuted, sfxLose, sfxWin, unlockAudio } from "@/game/audio";
import type { BuildingType, Command, MatchSetup, UnitType } from "@/game/types";

interface Props {
  setup: MatchSetup;
  isHost: boolean;
  onExit: () => void;
  onCommand?: (cmd: Command) => void;
  sessionRef?: { current: Session | null };
}

export function MatchView({ setup, isHost, onExit, onCommand, sessionRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sessRef = useRef<Session | null>(null);
  const dragRef = useRef({ x: 0, y: 0, dist: 0, wx: 0, wy: 0 });
  const endSound = useRef(false);
  const [hud, setHud] = useState(0);
  const [menu, setMenu] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [ready, setReady] = useState(false);
  const [help, setHelp] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("rift-touch-help") !== "1";
  });
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const s = new Session(setup, isHost);
    s.onCommand = onCommand;
    sessRef.current = s;
    if (sessionRef) sessionRef.current = s;
    let dead = false;
    void s.ready().then(() => {
      if (!dead) setReady(true);
    });
    return () => {
      dead = true;
      sessRef.current = null;
      if (sessionRef) sessionRef.current = null;
    };
  }, [setup, isHost, onCommand, sessionRef]);

  useEffect(() => {
    const onResize = () => setLandscape(window.innerWidth > window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const mini = miniRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mctx = mini?.getContext("2d") ?? null;
    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;

    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mini && mctx) {
        const mw = Math.max(1, mini.clientWidth);
        const mh = Math.max(1, mini.clientHeight);
        mini.width = mw * dpr;
        mini.height = mh * dpr;
        mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const loop = (now: number) => {
      const s = sessRef.current;
      if (!s) return;
      const dt = (now - last) / 1000;
      last = now;
      s.tick(dt);
      const r = wrap.getBoundingClientRect();
      const alpha = s.acc / TICK_SAFE;
      drawWorld(
        ctx,
        s.world,
        s.cam,
        r.width,
        r.height,
        Math.min(1, alpha),
        s.selUnits,
        s.selBuildings,
        s.ghost,
        s.localOwner,
      );
      if (s.box) {
        const a = worldToScreenLocal(s.cam, s.box.x0, s.box.y0, r.width, r.height);
        const b = worldToScreenLocal(s.cam, s.box.x1, s.box.y1, r.width, r.height);
        ctx.save();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = "rgba(212,216,224,0.8)";
        ctx.strokeRect(
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.abs(b.x - a.x),
          Math.abs(b.y - a.y),
        );
        ctx.restore();
      }
      if (s.mode === "rove" && s.roveDraft.length) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = "rgba(143,202,152,0.9)";
        ctx.fillStyle = "rgba(143,202,152,0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        s.roveDraft.forEach((p, i) => {
          const q = worldToScreenLocal(s.cam, p.x, p.y, r.width, r.height);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        ctx.stroke();
        s.roveDraft.forEach((p, i) => {
          const q = worldToScreenLocal(s.cam, p.x, p.y, r.width, r.height);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0a0a0b";
          ctx.font = "700 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), q.x, q.y);
          ctx.fillStyle = "rgba(143,202,152,0.95)";
        });
        ctx.restore();
      }
      if (mctx && mini) {
        drawMinimap(mctx, s.world, s.cam, r.width, r.height, mini.clientWidth, mini.clientHeight);
      }
      hudAcc += dt;
      if (hudAcc > 0.12) {
        hudAcc = 0;
        setHud((n) => n + 1);
        if (s.world.winner !== null && !endSound.current) {
          endSound.current = true;
          const me = s.world.players[s.localOwner];
          if (me && s.world.winner === me.team) sfxWin();
          else sfxLose();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ready]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = sessRef.current;
      if (!s) return;
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      s.keys.add(e.code);
      if (e.code === "Escape") {
        s.mode = "pan";
        s.buildType = null;
        setMenu((m) => !m);
      }
    };
    const up = (e: KeyboardEvent) => sessRef.current?.keys.delete(e.code);
    const blur = () => sessRef.current?.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const onPointer = (e: React.PointerEvent) => {
    const s = sessRef.current;
    const canvas = canvasRef.current;
    if (!s || !canvas) return;
    e.preventDefault();
    unlockAudio();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wpt = screenToWorld(s.cam, sx, sy, rect.width, rect.height);
    s.hover = wpt;
    const touch = e.pointerType !== "mouse";

    if (e.type === "pointerdown") {
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* iOS Safari can reject capture */
      }
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragRef.current = { x: e.clientX, y: e.clientY, dist: 0, wx: wpt.x, wy: wpt.y };
      if (s.mode === "select" || (!touch && e.button === 0 && s.mode !== "build" && s.mode !== "attack")) {
        s.box = { x0: wpt.x, y0: wpt.y, x1: wpt.x, y1: wpt.y };
      }
    }
    if (e.type === "pointermove") {
      const prev = s.pointers.get(e.pointerId);
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragRef.current.dist = Math.max(
        dragRef.current.dist,
        Math.hypot(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y),
      );
      if (s.pointers.size === 2) {
        const pts = [...s.pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (s.lastPinch) s.cam.z = Math.max(0.45, Math.min(1.8, s.cam.z * (d / s.lastPinch)));
        s.lastPinch = d;
        s.box = null;
        return;
      }
      if (s.mode === "build" && s.ghost?.held) {
        s.updateGhost(wpt.x, wpt.y, false);
        setHud((n) => n + 1);
        return;
      }
      if (s.box) {
        s.box.x1 = wpt.x;
        s.box.y1 = wpt.y;
      } else if (
        prev &&
        dragRef.current.dist > (touch ? 48 : 14) &&
        (touch || e.buttons === 2 || e.buttons === 4 || s.mode === "pan" || s.mode === "build" || s.mode === "rove")
      ) {
        s.cam.x -= (e.clientX - prev.x) / s.cam.z;
        s.cam.y -= (e.clientY - prev.y) / s.cam.z;
      }
    }
    if (e.type === "pointerup" || e.type === "pointercancel") {
      s.pointers.delete(e.pointerId);
      if (s.pointers.size < 2) s.lastPinch = 0;
      const slop = touch ? 48 : 14;
      const dragged = dragRef.current.dist > slop;
      if (s.mode === "build") {
        if (!dragged && s.hitGhost(dragRef.current.wx, dragRef.current.wy)) {
          if (s.ghost?.held) s.ghost.held = false;
          else s.grabGhost();
        }
        setHud((n) => n + 1);
        return;
      }
      if (s.box) {
        s.boxSelect(s.box.x0, s.box.y0, s.box.x1, s.box.y1, e.shiftKey || s.mode === "select");
        const tiny = Math.hypot(s.box.x1 - s.box.x0, s.box.y1 - s.box.y0) < 12;
        if (tiny) s.tapWorld(s.box.x0, s.box.y0, s.mode === "select" || e.shiftKey);
        s.box = null;
      } else if (!dragged || s.mode === "attack") {
        const tx = dragRef.current.wx;
        const ty = dragRef.current.wy;
        if (!touch && e.button === 2) s.tapWorld(tx, ty, false);
        else if (touch || e.button === 0) s.tapWorld(tx, ty, e.shiftKey);
      }
      setHud((n) => n + 1);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = sessRef.current;
    if (!s) return;
    s.cam.z = Math.max(0.45, Math.min(1.8, s.cam.z * (e.deltaY > 0 ? 0.92 : 1.08)));
  };

  const onMini = (e: React.PointerEvent) => {
    const s = sessRef.current;
    const mini = miniRef.current;
    if (!s || !mini) return;
    const r = mini.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    s.cam.x = nx * s.world.map.w * 32;
    s.cam.y = ny * s.world.map.h * 32;
  };

  const s = sessRef.current;
  const p = s?.world.players[s.localOwner];
  const selU = s ? s.world.units.filter((u) => s.selUnits.has(u.id)) : [];
  const selB = s ? s.world.buildings.filter((b) => s.selBuildings.has(b.id)) : [];
  const workerOn = selU.some((u) => u.type === "worker");
  const militaryOn = selU.some((u) => u.type !== "worker");
  const stanceOn = militaryOn
    ? selU.find((u) => u.type !== "worker")?.stance
    : undefined;
  const winner = s?.world.winner ?? null;
  const meTeam = p?.team ?? 0;
  void hud;

  return (
    <div className="fixed inset-0 flex flex-col bg-bg text-fg">
      <div
        className={
          landscape
            ? "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-3 pt-[max(8px,env(safe-area-inset-top))]"
            : "z-10 flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 pt-[max(8px,env(safe-area-inset-top))]"
        }
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-md)] bg-surface/90 px-2 py-1 text-xs tabular-nums">
          <Stat label="Ore" value={p?.ore ?? 0} />
          <Stat label="Flux" value={p?.flux ?? 0} />
          <Stat label="Supply" value={`${p?.supply ?? 0}/${p?.supplyMax ?? 0}`} />
          <Stat
            label="Shield"
            value={s && s.world.shield > 0 ? `${Math.ceil(s.world.shield)}s` : "open"}
          />
        </div>
        <div className="pointer-events-auto flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Touch help"
            onClick={() => setHelp(true)}
          >
            <span className="text-base font-semibold">?</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Button size="icon" variant="ghost" aria-label="Menu" onClick={() => setMenu(true)}>
            <Pause />
          </Button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className={landscape ? "absolute inset-0" : "relative min-h-0 flex-1"}
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerUp={onPointer}
          onPointerCancel={onPointer}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
        {s?.mode === "build" && s.buildType && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <p className="rounded-full bg-ok/25 px-3 py-1.5 text-center text-[12px] text-fg shadow">
              {s.ghost?.held
                ? `Drag the green square · then tap Place ${BUILDINGS[s.buildType].name}`
                : `Pan/pinch to look · tap the green ${BUILDINGS[s.buildType].name} square to pick it up`}
            </p>
          </div>
        )}
        {!selU.length && !selB[0] && !help && s?.mode !== "build" && s?.mode !== "select" && s?.mode !== "rove" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <p className="rounded-full bg-surface/90 px-3 py-1.5 text-center text-[12px] text-fg shadow">
              TAP a glowing rigger · DRAG to pan · PINCH to zoom
            </p>
          </div>
        )}
        {s?.mode === "rove" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <p className="rounded-full bg-ok/25 px-3 py-1.5 text-center text-[12px] text-fg shadow">
              Tap map points for the patrol · Start when you have 2+
            </p>
          </div>
        )}
        {s?.mode === "select" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <p className="rounded-full bg-ok/25 px-3 py-1.5 text-center text-[12px] text-fg shadow">
              Drag a box to select a squad · tap a unit to add/remove
            </p>
          </div>
        )}
        {!!selU.length && s?.mode !== "build" && s?.mode !== "rove" && s?.mode !== "select" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <p className="rounded-full bg-ok/20 px-3 py-1.5 text-center text-[12px] text-fg shadow">
              {workerOn && !militaryOn
                ? "Tap empty ground to move · tap a crystal to mine"
                : "Tap ground to move · Box to multi-select · double-tap a unit to select all of that type"}
            </p>
          </div>
        )}
        {!!selB[0] && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <p className="rounded-full bg-ok/20 px-3 py-1.5 text-center text-[12px] text-fg shadow">
              Tap a unit card below to train
            </p>
          </div>
        )}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-bg/80 text-sm text-muted">
            Loading battlefield…
          </div>
        )}
      </div>

      <canvas
        ref={miniRef}
        width={112}
        height={112}
        onPointerDown={onMini}
        onPointerMove={(e) => e.buttons && onMini(e)}
        className={
          landscape
            ? "pointer-events-auto absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-2 z-10 h-28 w-28 rounded-[var(--radius-sm)] border border-border bg-elevated"
            : "pointer-events-auto absolute bottom-[12.5rem] left-2 z-10 h-24 w-24 rounded-[var(--radius-sm)] border border-border bg-elevated/90"
        }
      />

      <div
        className={
          landscape
            ? "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end p-2 pb-[max(8px,env(safe-area-inset-bottom))]"
            : "z-10 border-t border-border bg-surface pb-[max(8px,env(safe-area-inset-bottom))]"
        }
      >
        <div
          className={
            landscape
              ? "pointer-events-auto w-[min(100%,22rem)] rounded-[var(--radius-lg)] border border-border bg-surface/92 p-2"
              : "p-2"
          }
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted">
              {s?.mode === "build" && s.buildType
                ? s.ghost?.held
                  ? "Dragging footprint — camera locked"
                  : "Pan the map, then tap the green square"
                : s?.mode === "rove"
                  ? `Rove ${s.roveDraft.length} points — tap map, then Start`
                  : s?.mode === "select"
                    ? "Box-select · tap units to add"
                    : selU.length
                      ? `${selU.length} selected — tap map to move`
                      : selB[0]
                        ? selB[0].progress < 1
                          ? `${BUILDINGS[selB[0].type].name} ${((selB[0].progress * 100) | 0)}% — cancel below`
                          : `${BUILDINGS[selB[0].type].name} — tap a card to train`
                        : "Tap a unit · drag to pan · pinch to zoom"}
            </p>
            <div className="flex gap-1">
              <IconBtn
                label="Attack"
                active={s?.mode === "attack"}
                onClick={() => sessRef.current?.attackMove()}
              >
                <Crosshair className="size-4" />
              </IconBtn>
              <IconBtn label="Stop" onClick={() => sessRef.current?.stop()}>
                <Square className="size-4" />
              </IconBtn>
              <IconBtn
                label="Box"
                active={s?.mode === "select"}
                onClick={() => {
                  const se = sessRef.current;
                  if (!se) return;
                  se.mode = se.mode === "select" ? "pan" : "select";
                  setHud((n) => n + 1);
                }}
              >
                <Maximize2 className="size-4" />
              </IconBtn>
            </div>
          </div>

          {(militaryOn || selU.length >= 2 || (s && s.squads.some((q) => q.length))) && s?.mode !== "build" && (
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {[0, 1, 2, 3].map((i) => (
                <SquadBtn
                  key={i}
                  n={i + 1}
                  filled={(s?.squads[i].length ?? 0) > 0}
                  onSelect={() => {
                    sessRef.current?.selectSquad(i);
                    setHud((x) => x + 1);
                  }}
                  onAssign={() => {
                    sessRef.current?.assignSquad(i);
                    setHud((x) => x + 1);
                  }}
                />
              ))}
              {militaryOn && (
                <>
                  <IconBtn
                    label="Hunt"
                    active={stanceOn === "attack"}
                    onClick={() => {
                      sessRef.current?.setStance("attack");
                      setHud((x) => x + 1);
                    }}
                  >
                    <Swords className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="Hold"
                    active={stanceOn === "hold"}
                    onClick={() => {
                      sessRef.current?.setStance("hold");
                      setHud((x) => x + 1);
                    }}
                  >
                    <Shield className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="Rove"
                    active={s?.mode === "rove" || stanceOn === "rove"}
                    onClick={() => {
                      sessRef.current?.setStance("rove");
                      setHud((x) => x + 1);
                    }}
                  >
                    <Route className="size-4" />
                  </IconBtn>
                  <span className="mx-0.5 h-6 w-px bg-border" />
                </>
              )}
              {selU.length >= 2 &&
                (
                  [
                    ["box", LayoutGrid, "Box"],
                    ["line", GripHorizontal, "Line"],
                    ["wedge", ChevronUp, "Wedge"],
                    ["column", MoreVertical, "Column"],
                  ] as const
                ).map(([kind, Icon, label]) => (
                  <IconBtn
                    key={kind}
                    label={label}
                    active={s?.formKind === kind}
                    onClick={() => {
                      sessRef.current?.setFormation(kind);
                      setHud((x) => x + 1);
                    }}
                  >
                    <Icon className="size-4" />
                  </IconBtn>
                ))}
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {s?.mode === "rove" && (
              <>
                <button
                  type="button"
                  className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-elevated text-sm font-medium"
                  onClick={() => {
                    sessRef.current?.cancelRove();
                    setHud((n) => n + 1);
                  }}
                >
                  <X className="size-4" />
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={(s.roveDraft.length ?? 0) < 2}
                  className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-ok bg-ok/25 text-sm font-medium disabled:opacity-40"
                  onClick={() => {
                    sessRef.current?.confirmRove();
                    setHud((n) => n + 1);
                  }}
                >
                  <Check className="size-4" />
                  Start rove
                </button>
              </>
            )}
            {s?.mode === "build" && s.buildType && (
              <>
                <button
                  type="button"
                  className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-elevated text-sm font-medium"
                  onClick={() => {
                    sessRef.current?.cancelPlacement();
                    setHud((n) => n + 1);
                  }}
                >
                  <X className="size-4" />
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!s.ghost?.ok}
                  className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-ok bg-ok/25 text-sm font-medium disabled:opacity-40"
                  onClick={() => {
                    sessRef.current?.confirmPlacement();
                    setHud((n) => n + 1);
                  }}
                >
                  <Check className="size-4" />
                  Place {BUILDINGS[s.buildType].name}
                </button>
              </>
            )}
            {workerOn &&
              s?.mode !== "build" &&
              s?.mode !== "rove" &&
              (Object.keys(BUILDINGS) as BuildingType[])
                .filter((t) => t !== "core")
                .map((t) => (
                  <Cmd
                    key={t}
                    src={BUILDING_SPRITE[t]}
                    label={BUILDINGS[t].name}
                    sub={`${BUILDINGS[t].ore}${BUILDINGS[t].flux ? `/${BUILDINGS[t].flux}` : ""}`}
                    onClick={() => {
                      sessRef.current?.beginBuild(t);
                      setHud((n) => n + 1);
                    }}
                  />
                ))}
            {selB[0] && selB[0].progress < 1 && s?.mode !== "build" && (
              <button
                type="button"
                className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-danger bg-danger/15 text-sm font-medium"
                onClick={() => {
                  sessRef.current?.cancelConstruction();
                  setHud((n) => n + 1);
                }}
              >
                <X className="size-4" />
                Cancel build
              </button>
            )}
            {selB[0] &&
              selB[0].progress >= 1 &&
              BUILDINGS[selB[0].type].produces.map((t) => (
                <Cmd
                  key={t}
                  src={UNIT_SPRITE[t]}
                  label={UNITS[t].name}
                  sub={`${UNITS[t].ore}${UNITS[t].flux ? `/${UNITS[t].flux}` : ""}`}
                  onClick={() => sessRef.current?.train(t as UnitType)}
                />
              ))}
            {!workerOn && !selB[0] && s?.mode !== "build" && (
              <p className="col-span-4 px-1 py-3 text-xs text-muted sm:col-span-6">
                Tap a rigger (the six workers by your nexus). Then this grid becomes buildings.
              </p>
            )}
          </div>
        </div>
      </div>

      {help && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-bg/80 px-4">
          <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-border bg-surface p-5">
            <h2 className="font-display text-2xl font-semibold">Phone controls</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-fg">
              <li>
                <b>Tap</b> a rigger (small worker). A ring appears when it is selected.
              </li>
              <li>
                <b>Drag</b> one finger to pan the map. <b>Pinch</b> to zoom.
              </li>
              <li>
                With riggers selected, <b>tap a crystal</b> (the ice patches by your nexus) to mine.
                You can also tap the crystal first — nearby riggers will go.
              </li>
              <li>
                To build: tap a building card. <b>Pan/pinch</b> to look around, <b>tap the green
                square</b> to pick it up, drag it, then tap <b>Place</b>. Cancel backs out.
                Tap an unfinished building and <b>Cancel build</b> to refund.
              </li>
              <li>
                <b>Box</b> then drag to select many. Double-tap a troop to select all of that type.
                Tap squad <b>1–4</b> to recall, <b>hold</b> 1–4 to save the current selection.
              </li>
              <li>
                Squad orders: <b>swords</b> hunt, <b>shield</b> hold, <b>route</b> patrol.
                Formation (grid / line / wedge / column) is how they stand and march — tap a shape
                to assemble, then tap the map to move as a squad.
              </li>
            </ol>
            <Button
              className="mt-5 w-full"
              size="lg"
              onClick={() => {
                localStorage.setItem("rift-touch-help", "1");
                setHelp(false);
              }}
            >
              Got it — play
            </Button>
          </div>
        </div>
      )}

      {(menu || winner !== null) && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg/70 px-4">
          <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-border bg-surface p-6">
            <h2 className="font-display text-2xl font-semibold">
              {winner !== null ? (winner === meTeam ? "Victory" : "Defeat") : "Paused"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {winner !== null
                ? winner === meTeam
                  ? "The last nexus standing is yours."
                  : "Your nexus line has fallen."
                : "Tap a rigger · drag to pan · pinch to zoom. Open ? for the full guide."}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {winner === null && <Button onClick={() => setMenu(false)}>Resume</Button>}
              <Button variant="secondary" onClick={onExit}>
                <Home className="size-4" />
                Leave match
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TICK_SAFE = 1 / 20;

function worldToScreenLocal(cam: Cam, x: number, y: number, vw: number, vh: number) {
  return { x: (x - cam.x) * cam.z + vw / 2, y: (y - cam.y) * cam.z + vh / 2 };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="px-1">
      <span className="mr-1 text-subtle">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </span>
  );
}

function SquadBtn({
  n,
  filled,
  onSelect,
  onAssign,
}: {
  n: number;
  filled: boolean;
  onSelect: () => void;
  onAssign: () => void;
}) {
  const t = useRef(0);
  return (
    <button
      type="button"
      aria-label={`Squad ${n}. Tap to select, hold to save.`}
      onPointerDown={() => {
        t.current = Date.now();
      }}
      onPointerUp={() => {
        if (Date.now() - t.current > 380) onAssign();
        else onSelect();
      }}
      className={`grid size-11 place-items-center rounded-[var(--radius-sm)] border text-sm font-semibold ${
        filled ? "border-accent bg-elevated" : "border-border bg-elevated/60"
      }`}
    >
      {n}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid size-11 place-items-center rounded-[var(--radius-sm)] border ${
        active ? "border-accent bg-elevated" : "border-border bg-elevated/60"
      }`}
    >
      {children}
    </button>
  );
}

function Cmd({
  src,
  label,
  sub,
  onClick,
}: {
  src: string;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-col items-center rounded-[var(--radius-sm)] border border-border bg-elevated px-1 py-1"
    >
      <img src={src} alt="" className="size-8 object-contain" />
      <span className="text-[10px] leading-tight text-fg">{label}</span>
      <span className="text-[10px] tabular-nums text-subtle">{sub}</span>
    </button>
  );
}
