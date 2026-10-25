import {
  HeartPulse,
  Moon,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  StepForward,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatSimTime, useSim } from "@/sim/store";

function Logo() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        className="fill-secondary stroke-primary/60"
        strokeWidth="1.2"
      />
      <path
        d="M20 9v22M9 20h22"
        className="stroke-primary"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {[
        [11, 11],
        [29, 11],
        [11, 29],
        [29, 29],
      ].map(([x, y]) => (
        <circle
          key={`${x}${y}`}
          cx={x}
          cy={y}
          r="4"
          className="fill-none stroke-primary-glow"
          strokeWidth="1.4"
        />
      ))}
    </svg>
  );
}

export function TopBar({ compact = false }: { compact?: boolean }) {
  const state = useSim((s) => s.snap.state);
  const mode = useSim((s) => s.snap.mode);
  const t = useSim((s) => s.snap.t);
  const { start, pause, resume, reset, setMode } = useSim.getState();

  return (
    <header className={`panel flex flex-wrap items-center gap-x-4 gap-y-2 ${compact ? "px-2 py-1" : "px-3 py-2"}`}>
      {!compact && (
        <div className="flex items-center gap-2">
          <Logo />
          <div>
            <h1 className="text-base font-semibold leading-none tracking-[0.18em]">
              SKYMED <span className="glow-text">GRID</span>
            </h1>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Healthcare delivery · security patrol
            </p>
          </div>
        </div>
      )}

      <div className={`flex items-center gap-2 rounded-xl border border-border bg-panel-strong px-2.5 ${compact ? "py-0.5" : "py-1"}`}>
        <div
          className={`flex items-center gap-1.5 text-xs font-medium ${mode === "healthcare" ? "text-primary" : "text-muted-foreground"}`}
        >
          <Sun className="h-4 w-4" />
          <HeartPulse className="h-4 w-4" /> Healthcare
        </div>
        <Switch
          checked={mode === "security"}
          onCheckedChange={(v) => setMode(v ? "security" : "healthcare")}
          aria-label="Switch to night-time security patrol"
          className="data-[state=checked]:bg-warning"
        />
        <div
          className={`flex items-center gap-1.5 text-xs font-medium ${mode === "security" ? "text-warning" : "text-muted-foreground"}`}
        >
          <ShieldCheck className="h-4 w-4" /> Security <Moon className="h-4 w-4" />
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Button variant="control" size="sm" onClick={start} disabled={state !== "idle"}>
          <Play /> Start
        </Button>
        <Button variant="control" size="sm" onClick={pause} disabled={state !== "running"}>
          <Pause /> Pause
        </Button>
        <Button variant="control" size="sm" onClick={resume} disabled={state !== "paused"}>
          <StepForward /> Resume
        </Button>
        <Button variant="control" size="sm" onClick={reset}>
          <RotateCcw /> Reset
        </Button>
        <div className="ml-1 flex items-center gap-2 rounded-lg border border-border bg-panel-strong px-3 py-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              state === "running"
                ? "bg-success animate-pulse"
                : state === "paused"
                  ? "bg-warning"
                  : "bg-returning"
            }`}
          />
          <span className="hud-label">{state}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">{formatSimTime(t)}</span>
        </div>
      </div>
    </header>
  );
}
