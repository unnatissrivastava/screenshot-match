import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  Box,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Expand,
  Map as MapIcon,
  Minimize,
  Mouse,
  RotateCcw,
  Route,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { STAGE_INFO } from "@/sim/engine";
import { getLocation } from "@/sim/city";
import { useSim } from "@/sim/store";
import { FallbackMap } from "./FallbackMap";
import { SceneLabels } from "./SceneLabels";
import type { CameraActions } from "./SceneCanvas";

const SceneCanvas = lazy(() => import("./SceneCanvas"));

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: unknown) {
    console.warn("3D view failed, switching to 2D map", err);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center grid-overlay">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <div className="hud-label">Building 3D city…</div>
      </div>
    </div>
  );
}

function InfoPanel() {
  const missions = useSim((s) => s.snap.missions);
  const drones = useSim((s) => s.snap.drones);
  const mode = useSim((s) => s.snap.mode);
  const alerts = useSim((s) => s.snap.alerts);
  const state = useSim((s) => s.snap.state);
  const active = missions.find((m) => m.stage !== "complete");
  const patrols = drones.filter((d) => d.task === "patrol").length;
  const shuttles = drones.filter((d) => d.task === "shuttle").length;
  const pending = alerts.filter((a) => a.review === "pending").length;
  const stage = active ? STAGE_INFO[active.stage].title : null;
  const status =
    state === "idle"
      ? "Simulation idle"
      : state === "paused"
        ? "Simulation paused"
        : active
          ? `Delivery to ${getLocation(active.patientHomeId).short}`
          : mode === "healthcare"
            ? `${shuttles} supply shuttles active`
            : `${patrols} patrols active · ${pending} alerts pending`;

  return (
    <div className="panel pointer-events-auto flex max-w-[min(100%,22rem)] items-center gap-2 rounded-full px-3 py-2">
      {stage && (
        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary">
          {stage}
        </span>
      )}
      <span className="truncate text-[11px] text-muted-foreground">{status}</span>
    </div>
  );
}

function Legend() {
  const [open, setOpen] = useState(false);
  const items = [
    { c: "bg-primary", t: "Medicine delivery" },
    { c: "bg-shuttle", t: "Supply shuttle" },
    { c: "bg-warning", t: "Security patrol" },
    { c: "bg-returning", t: "Returning / docked" },
    { c: "bg-success", t: "Charging" },
    { c: "bg-alert", t: "Sample detection" },
  ];
  return (
    <div className="pointer-events-auto flex flex-col items-start gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="panel flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Route className="h-3.5 w-3.5 text-primary" />
        Legend
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="panel max-w-[min(100%,19rem)] p-2.5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {items.map((i) => (
              <div
                key={i.t}
                className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-muted-foreground"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${i.c}`} />
                {i.t}
              </div>
            ))}
            <div className="col-span-2 mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="h-px w-5 shrink-0 border-t-2 border-dashed border-primary" /> Route
              with moving arrows
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Viewport({
  fullscreen,
  onToggleFullscreen,
}: {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [cameraActions, setCameraActions] = useState<CameraActions | null>(null);
  const [followDrone, setFollowDrone] = useState(true);
  const mode = useSim((s) => s.snap.mode);
  useEffect(() => setWebgl(hasWebGL()), []);

  const fallback = <FallbackMap reason="3D view unavailable — showing 2D map" />;
  let content: ReactNode;
  if (webgl === null) content = <Loading />;
  else if (!webgl)
    content = <FallbackMap reason="WebGL not supported on this device — showing 2D map" />;
  else if (view === "2d") content = <FallbackMap />;
  else
    content = (
      <SceneBoundary fallback={fallback}>
        <Suspense fallback={<Loading />}>
          <SceneCanvas
            fullscreen={fullscreen}
            onCameraReady={setCameraActions}
            followEnabled={followDrone}
            onFollowChange={setFollowDrone}
          />
          <SceneLabels />
        </Suspense>
      </SceneBoundary>
    );

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-background ${
        fullscreen
          ? "rounded-2xl border border-primary/20 shadow-panel"
          : "rounded-2xl border border-border"
      }`}
    >
      <div className="absolute inset-0">{content}</div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2 sm:p-3">
        <div className="flex items-start justify-between gap-3">
          {!fullscreen && <InfoPanel />}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              {!fullscreen && (
                <div
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${
                    mode === "security"
                      ? "border-warning/50 text-warning"
                      : "border-primary/50 text-primary"
                  } bg-panel`}
                >
                  {mode === "security" ? "Night · Security patrol" : "Day · Healthcare delivery"}
                </div>
              )}
              <button
                type="button"
                onClick={() => setFollowDrone((enabled) => !enabled)}
                aria-label={`Follow Drone ${followDrone ? "ON" : "OFF"}`}
                aria-pressed={followDrone}
                title={`Follow Drone ${followDrone ? "ON" : "OFF"} · manual camera input disables follow`}
                className={`panel pointer-events-auto flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors ${
                  followDrone ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Crosshair className="h-4 w-4" />
                Follow {followDrone ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={onToggleFullscreen}
                aria-label={
                  fullscreen ? "Exit fullscreen simulation" : "Expand simulation fullscreen"
                }
                title={fullscreen ? "Exit fullscreen" : "Expand fullscreen"}
                className="panel pointer-events-auto flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
              >
                {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              </button>
            </div>
            {!fullscreen && (
              <div className="rounded-full border border-border bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Simulated telemetry
              </div>
            )}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          {!fullscreen && <Legend />}
          <div className="flex flex-col items-end gap-2">
            {view === "3d" && webgl && (
              <div className="panel pointer-events-auto flex items-center gap-0.5 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setFollowDrone(false);
                    cameraActions?.zoomIn();
                  }}
                  disabled={!cameraActions}
                  aria-label="Zoom in"
                  title="Zoom in"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-primary disabled:opacity-40"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFollowDrone(false);
                    cameraActions?.zoomOut();
                  }}
                  disabled={!cameraActions}
                  aria-label="Zoom out"
                  title="Zoom out"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-primary disabled:opacity-40"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => cameraActions?.cityOverview()}
                  disabled={!cameraActions}
                  aria-label="Reset camera to city overview"
                  title="Reset camera / city overview"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-primary disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            )}
            {webgl && (
              <div className="panel pointer-events-auto flex overflow-hidden p-0.5">
                {(["3d", "2d"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      view === v
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "3d" ? (
                      <Box className="h-3.5 w-3.5" />
                    ) : (
                      <MapIcon className="h-3.5 w-3.5" />
                    )}
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {!fullscreen && view === "3d" && webgl && (
              <div className="flex items-center gap-1.5 rounded-full bg-panel px-3 py-1 text-[10px] text-muted-foreground">
                <Mouse className="h-3 w-3" /> Scroll to zoom · Drag to rotate · Reset to recenter
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
