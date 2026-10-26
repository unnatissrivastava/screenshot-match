import { BatteryCharging, Plane, Package, ShieldCheck, Zap } from "lucide-react";
import { HUBS } from "@/sim/city";
import { useSim, type DroneView } from "@/sim/store";

const TASK_LABEL: Record<string, { text: string; cls: string; dot: string }> = {
  docked: { text: "Ready", cls: "text-muted-foreground", dot: "bg-returning" },
  charging: { text: "Charging", cls: "text-success", dot: "bg-success" },
  delivery: { text: "Delivery", cls: "text-primary", dot: "bg-primary" },
  patrol: { text: "Patrol", cls: "text-warning", dot: "bg-warning" },
  shuttle: { text: "Shuttle", cls: "text-shuttle", dot: "bg-shuttle" },
  returning: { text: "Returning", cls: "text-returning", dot: "bg-returning" },
};

function Battery({ value }: { value: number }) {
  const cls = value < 30 ? "bg-alert" : value < 60 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-2 w-12 overflow-hidden rounded-sm border border-border bg-secondary">
        <div className={`h-full ${cls} transition-[width] duration-300`} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{Math.round(value)}%</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, cls }: { icon: typeof Plane; label: string; value: number | string; cls: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel-strong/70 p-2">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${cls}`} />
        <span className="hud-label !text-[9px]">{label}</span>
      </div>
      <div className={`mt-0.5 font-mono text-xl font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

export function FleetPanel({ compact = false }: { compact?: boolean }) {
  const drones = useSim((s) => s.snap.drones);
  const missions = useSim((s) => s.snap.missions);
  const activeDeliveries = missions.filter((m) => m.stage !== "complete" && m.stage !== "charging").length;
  const airborne = drones.filter((d) => d.airborne).length;
  const charging = drones.filter((d) => d.task === "charging").length;
  const patrol = drones.filter((d) => d.task === "patrol").length;
  const panelClass = compact ? "panel p-3" : "panel p-4";

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h2 className="hud-label">Fleet Overview</h2>
          <span className="font-mono text-[10px] text-muted-foreground">12 drones · 3 hubs</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat icon={Package} label="Active deliveries" value={activeDeliveries} cls="text-primary" />
          <Stat icon={Plane} label="Airborne" value={airborne} cls="text-foreground" />
          <Stat icon={BatteryCharging} label="Charging" value={charging} cls="text-success" />
          <Stat icon={ShieldCheck} label="On patrol" value={patrol} cls="text-warning" />
        </div>
      </section>

      <section className={panelClass}>
        <h2 className="hud-label">Charging Stations</h2>
        <div className="mt-2 space-y-1.5">
          {HUBS.map((h, hi) => {
            const pads = drones.slice(hi * 4, hi * 4 + 4);
            return (
              <div key={h.id} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-2.5 py-1.5">
                <Zap className="h-3.5 w-3.5 text-success" />
                <span className="text-xs">{h.short}</span>
                <div className="ml-auto flex gap-1">
                  {pads.map((d) => {
                    const onPad = d.task === "docked" || d.task === "charging";
                    return (
                      <span
                        key={d.id}
                        title={`${d.id}: ${onPad ? (d.task === "charging" ? "charging" : "docked") : "pad empty"}`}
                        className={`flex h-5 w-7 items-center justify-center rounded font-mono text-[8px] ${
                          !onPad
                            ? "border border-dashed border-border text-muted-foreground/60"
                            : d.task === "charging"
                              ? "animate-pulse bg-success/25 text-success"
                              : "bg-primary/15 text-primary"
                        }`}
                      >
                        {d.id.slice(3)}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h2 className="hud-label">Drone Telemetry</h2>
          <span className="rounded bg-secondary px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Simulated</span>
        </div>
        <ul className="mt-2 divide-y divide-border/60">
          {drones.map((d: DroneView) => {
            const t = TASK_LABEL[d.task]!;
            return (
              <li key={d.id} className="flex items-center gap-2 py-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
                <span className="w-11 font-mono text-[11px] font-semibold">{d.id}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-medium ${t.cls}`}>
                    {t.text}
                    {d.missionId && <span className="ml-1 font-mono text-muted-foreground">{d.missionId}</span>}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground" title={d.status}>
                    {d.status}
                  </div>
                </div>
                <Battery value={d.battery} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
