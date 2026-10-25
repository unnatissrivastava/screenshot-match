// Lightweight DOM labels for the 3D scene. Label elements live in a normal
// React overlay; a tiny projector inside the Canvas moves them every frame.
// (Avoids one React root per label and keeps labels below the UI panels.)
import { useCallback, useMemo } from "react";
import { LOCATIONS, getLocation } from "@/sim/city";
import { getEngine, useSim } from "@/sim/store";

export type Pos = [number, number, number];
export interface Entry {
  el: HTMLElement;
  pos: () => Pos | null;
}
export const labelRegistry = new Map<string, Entry>();

function useLabel(id: string, pos: () => Pos | null) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) labelRegistry.set(id, { el, pos });
      else labelRegistry.delete(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
}

const KIND_ICON: Record<string, string> = { hospital: "✚", pharmacy: "Rx", residential: "⌂", hub: "⚡" };
const base = "pointer-events-none absolute left-0 top-0 whitespace-nowrap will-change-transform";

function LocationLabel({ id }: { id: string }) {
  const l = getLocation(id);
  const y = l.kind === "hospital" ? 5.4 : l.kind === "residential" && l.landY > 1 ? 4.4 : l.kind === "hub" ? 1.4 : 2.4;
  const ref = useLabel(`loc-${id}`, () => [l.x, y, l.z]);
  return (
    <div
      ref={ref}
      data-kind={l.kind}
      style={{ visibility: "hidden" }}
      className={`${base} flex items-center gap-1.5 rounded-full border border-border bg-panel-strong/90 py-0.5 pl-0.5 pr-2.5 text-[11px] font-medium text-foreground shadow-lg data-[kind=hospital]:border-alert/60 data-[kind=hub]:border-success/50 data-[kind=pharmacy]:border-success/60 data-[kind=residential]:border-primary/50`}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary font-mono text-[10px] text-primary">
        {KIND_ICON[l.kind]}
      </span>
      {l.short}
    </div>
  );
}

function DroneLabel({ index }: { index: number }) {
  const d = useSim((s) => s.snap.drones[index]);
  const ref = useLabel(`drone-${index}`, () => {
    const x = getEngine().drones[index];
    if (!x || !x.airborne) return null;
    return [x.pos.x, x.pos.y + 0.45, x.pos.z];
  });
  if (!d) return null;
  return (
    <div
      ref={ref}
      data-task={d.task}
      data-low={d.battery < 30 ? "1" : "0"}
      style={{ visibility: "hidden" }}
      className={`${base} flex items-center gap-1 rounded-sm border border-border bg-panel px-1.5 py-px font-mono text-[10px] leading-tight text-foreground data-[task=delivery]:border-primary data-[task=delivery]:text-primary data-[task=patrol]:border-warning/70 data-[task=patrol]:text-warning data-[task=shuttle]:text-shuttle data-[low='1']:text-alert`}
    >
      {d.id}
      <span className="opacity-75">{Math.round(d.battery)}%</span>
      {d.carrying && <span className="text-alert">✚</span>}
    </div>
  );
}

function MarkerLabel({ id, pos, text, sub, tone }: { id: string; pos: Pos; text: string; sub: string; tone: "primary" | "success" | "alert" | "warning" }) {
  const ref = useLabel(id, () => pos);
  const cls = {
    primary: "border-primary text-primary",
    success: "border-success text-success",
    alert: "border-alert text-alert",
    warning: "border-warning text-warning",
  }[tone];
  return (
    <div
      ref={ref}
      style={{ visibility: "hidden" }}
      className={`${base} rounded-md border bg-panel px-2 py-0.5 text-center font-mono text-[10px] uppercase tracking-wider ${cls}`}
    >
      {text}
      <div className="normal-case tracking-normal text-muted-foreground">{sub}</div>
    </div>
  );
}

function MarkerLabels() {
  const missions = useSim((s) => s.snap.missions);
  const alerts = useSim((s) => s.snap.alerts);
  const mode = useSim((s) => s.snap.mode);
  const markers = useMemo(() => {
    const out: Array<{ id: string; pos: Pos; text: string; sub: string; tone: "primary" | "success" | "alert" | "warning" }> = [];
    for (const m of missions) {
      if (m.stage === "dispatch" || m.stage === "pickup") {
        const l = getLocation("pharmacy");
        out.push({ id: `${m.id}-p`, pos: [l.x, 4.2, l.z], text: "Pickup", sub: m.id, tone: "success" });
      }
      if (["dispatch", "pickup", "transit", "arrival", "otp", "delivery"].includes(m.stage)) {
        const l = getLocation(m.patientHomeId);
        out.push({
          id: `${m.id}-d`,
          pos: [l.x, l.landY + 4.1, l.z],
          text: m.stage === "otp" ? "Awaiting OTP" : "Drop-off",
          sub: m.id,
          tone: "primary",
        });
      }
    }
    if (mode === "security")
      for (const a of alerts.filter((x) => x.review !== "dismissed").slice(0, 5))
        out.push({
          id: a.id,
          pos: [a.pos.x, 4.2, a.pos.z],
          text: `Sample · ${a.kind}`,
          sub: `${a.id} · ${a.confidence}% · ${a.review === "pending" ? "needs review" : "confirmed"}`,
          tone: a.review === "pending" ? "alert" : "warning",
        });
    return out;
  }, [missions, alerts, mode]);
  return (
    <>
      {markers.map((m) => (
        <MarkerLabel key={m.id} {...m} />
      ))}
    </>
  );
}

/** Mount as a DOM sibling covering the canvas. */
export function SceneLabels() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {LOCATIONS.map((l) => (
        <LocationLabel key={l.id} id={l.id} />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <DroneLabel key={i} index={i} />
      ))}
      <MarkerLabels />
    </div>
  );
}
