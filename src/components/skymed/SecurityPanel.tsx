import { useState } from "react";
import { Check, Eye, ShieldAlert, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLocation } from "@/sim/city";
import { formatSimTime, useSim } from "@/sim/store";
import { ThermalFeed } from "./ThermalFeed";

const CAMERA_IDS = ["SG-01", "SG-02", "SG-03", "SG-04", "SG-07", "SG-12"];

export function SecurityPanel() {
  const drones = useSim((s) => s.snap.drones);
  const alerts = useSim((s) => s.snap.alerts);
  const state = useSim((s) => s.snap.state);
  const reviewAlert = useSim((s) => s.reviewAlert);
  const patrols = drones.filter((d) => d.task === "patrol");
  const [picked, setPicked] = useState<string | null>(null);
  const feedId = picked ?? patrols[0]?.id ?? CAMERA_IDS[0]!;
  const pending = alerts.filter((a) => a.review === "pending").length;

  return (
    <div className="space-y-2.5">
      <section className="panel p-3">
        <div className="hud-label">Security mode · night</div>
        <h2 className="mt-1 text-sm font-semibold">Patrol & Thermal Camera</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Six drones fly loops over the city. Their thermal cameras flag possible issues, but every
          flag goes to a human operator first.
        </p>
        {state === "idle" && (
          <Button variant="hero" className="mt-3 w-full" onClick={useSim.getState().start}>
            <Eye /> Start night patrol
          </Button>
        )}
        <div className="mt-2.5">
          <ThermalFeed droneId={feedId} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="hud-label mr-1 self-center">Camera</span>
          {CAMERA_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setPicked(id)}
              aria-pressed={id === feedId}
              className={`rounded-md px-1.5 py-1 font-mono text-[9px] ${
                id === feedId
                  ? "bg-warning text-warning-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-3">
        <div className="flex items-center justify-between">
          <h2 className="hud-label">Sample Detection Alerts</h2>
          <span
            className={`rounded-full px-2 py-px text-[10px] font-medium ${pending ? "bg-alert/20 text-alert" : "bg-secondary text-muted-foreground"}`}
          >
            {pending} pending review
          </span>
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
          <UserCheck className="mt-px h-3 w-3 shrink-0 text-primary" />
          These are clearly-labelled SAMPLE detections from a simulated model. No action is taken
          until an operator reviews them.
        </p>
        <div className="mt-2.5 space-y-1.5">
          {alerts.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-2.5 text-center text-[11px] text-muted-foreground">
              {state === "running"
                ? "Scanning… first sample detection arrives in a few seconds."
                : "No detections yet."}
            </div>
          )}
          {alerts.slice(0, 6).map((a) => (
            <div
              key={a.id}
              data-review={a.review}
              className="rounded-lg border border-alert/35 bg-alert/[0.035] p-2 data-[review=confirmed]:border-warning/40 data-[review=confirmed]:bg-warning/5 data-[review=dismissed]:border-border data-[review=dismissed]:bg-transparent data-[review=dismissed]:opacity-60"
            >
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <ShieldAlert className="h-3.5 w-3.5 text-alert" />
                <span className="rounded bg-secondary px-1.5 py-px font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                  Simulated
                </span>
                <span className="text-xs font-semibold">{a.kind}</span>
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                  {a.id} · {formatSimTime(a.t)}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug">{a.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9px] text-muted-foreground">
                <span>{getLocation(a.locationId).short}</span>
                <span>·</span>
                <span>by {a.droneId}</span>
                <span>·</span>
                <span className="flex min-w-20 flex-1 items-center gap-1">
                  <span className="h-1 flex-1 overflow-hidden rounded bg-secondary">
                    <span className="block h-full bg-alert" style={{ width: `${a.confidence}%` }} />
                  </span>
                  {a.confidence}%
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {a.review === "pending" ? (
                  <>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-alert">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-alert" /> Pending
                      human review
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="sm"
                        variant="alert"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => reviewAlert(a.id, "confirmed")}
                      >
                        <Check /> Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="subtle"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => reviewAlert(a.id, "dismissed")}
                      >
                        <X /> Dismiss
                      </Button>
                    </div>
                  </>
                ) : (
                  <span
                    className={`text-[10px] font-medium ${a.review === "confirmed" ? "text-warning" : "text-muted-foreground"}`}
                  >
                    {a.review === "confirmed"
                      ? "✓ Confirmed by operator — ground team notified (simulated)"
                      : "Dismissed as false positive"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
