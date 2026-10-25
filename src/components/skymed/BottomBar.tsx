import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { DELIVERY_STAGES, STAGE_INFO } from "@/sim/engine";
import { formatSimTime, useSim } from "@/sim/store";
import { stageIndex, useFocusedMission } from "./HealthcarePanel";

const SHORT: Record<string, string> = {
  dispatch: "Dispatch",
  pickup: "Pickup",
  transit: "Transit",
  arrival: "Arrival",
  otp: "OTP check",
  delivery: "Delivered",
  return: "Return",
  charging: "Charging",
};

function Timeline() {
  const mission = useFocusedMission();
  const current = mission ? stageIndex(mission.stage) : -1;
  return (
    <section className="panel flex min-w-0 flex-col p-2">
      <div className="flex items-center justify-between">
        <div className="hud-label">Mission timeline</div>
        <span className="font-mono text-[10px] text-primary">
          {mission ? `${mission.id} · ${mission.droneId}` : "—"}
        </span>
      </div>
      <ol className="mt-2 flex items-start">
        {DELIVERY_STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const at = mission?.history.find((h) => h.stage === s)?.t;
          return (
            <li key={s} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span
                  className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || active ? "bg-primary" : "bg-border"}`}
                />
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] ${
                    done
                      ? "border-success bg-success/20 text-success"
                      : active
                        ? "animate-pulse-ring border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={`h-0.5 flex-1 ${i === DELIVERY_STAGES.length - 1 ? "opacity-0" : done ? "bg-primary" : "bg-border"}`}
                />
              </div>
              <span
                className={`mt-1 truncate text-[9px] font-medium ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}
              >
                {SHORT[s]}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {at !== undefined ? formatSimTime(at) : " "}
              </span>
            </li>
          );
        })}
      </ol>
      <p
        className="mt-1 truncate text-[10px] leading-snug text-muted-foreground"
        title={mission ? STAGE_INFO[mission.stage].explain : undefined}
      >
        {mission
          ? STAGE_INFO[mission.stage].explain
          : "Start a medicine delivery to watch it move through all eight stages in order."}
      </p>
    </section>
  );
}

const LEVEL_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  alert: ShieldAlert,
};
const LEVEL_CLS = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  alert: "text-alert",
};

function EventsLog() {
  const events = useSim((s) => s.snap.events);
  return (
    <section className="panel flex min-h-0 min-w-0 flex-col p-2">
      <div className="flex items-center justify-between">
        <div className="hud-label">Recent events</div>
        <span className="font-mono text-[10px] text-muted-foreground">{events.length} logged</span>
      </div>
      <ul className="scrollbar-thin mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {events.length === 0 && (
          <li className="text-[11px] text-muted-foreground">Nothing yet — press Start.</li>
        )}
        {events.map((e) => {
          const Icon = LEVEL_ICON[e.level];
          return (
            <li key={e.id} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className="w-12 shrink-0 font-mono text-[9px] text-muted-foreground">
                {formatSimTime(e.t)}
              </span>
              <Icon className={`mt-px h-3 w-3 shrink-0 ${LEVEL_CLS[e.level]}`} />
              <span className="text-[10px] leading-tight text-foreground/90">{e.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BottomBar() {
  return (
    <div className="grid gap-2 lg:h-[116px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Timeline />
      <EventsLog />
    </div>
  );
}
