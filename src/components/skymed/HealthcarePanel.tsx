import { useState } from "react";
import {
  CheckCircle2,
  BatteryCharging,
  Home,
  KeyRound,
  Navigation,
  Package,
  PackageCheck,
  Rocket,
  Undo2,
  Pill,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { DELIVERY_STAGES, STAGE_INFO, type DeliveryStage, type Mission } from "@/sim/engine";
import { getLocation } from "@/sim/city";
import { formatSimTime, useSim } from "@/sim/store";

const STAGE_ICON: Record<DeliveryStage, typeof Rocket> = {
  dispatch: Rocket,
  pickup: Package,
  transit: Navigation,
  arrival: Home,
  otp: KeyRound,
  delivery: PackageCheck,
  return: Undo2,
  charging: BatteryCharging,
  complete: CheckCircle2,
};

export function stageIndex(stage: DeliveryStage) {
  return stage === "complete" ? DELIVERY_STAGES.length : DELIVERY_STAGES.indexOf(stage);
}

export function useFocusedMission(): Mission | undefined {
  const missions = useSim((s) => s.snap.missions);
  const focusId = useSim((s) => s.snap.focusMissionId);
  return missions.find((m) => m.id === focusId) ?? missions[0];
}

export function OtpCard({
  mission,
  fullscreen = false,
}: {
  mission: Mission;
  fullscreen?: boolean;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const verifyOtp = useSim((s) => s.verifyOtp);

  const submit = (value = code) => {
    if (value.length < 4) {
      setError("Enter all 4 digits.");
      return;
    }
    const ok = verifyOtp(mission.id, value);
    if (!ok) {
      setError("Code doesn't match — package stays locked. Try again.");
      setCode("");
    } else setError(null);
  };

  return (
    <div
      className={`rounded-2xl border border-primary/50 bg-primary/10 ${fullscreen ? "p-4 shadow-panel" : "p-3 shadow-glow"}`}
    >
      <div
        className={`flex items-center gap-2 font-semibold text-primary ${fullscreen ? "text-base" : "text-sm"}`}
      >
        <KeyRound className="h-4 w-4" /> OTP Verification · {mission.id}
      </div>
      <p
        className={`mt-2 leading-relaxed text-muted-foreground ${fullscreen ? "text-sm" : "text-[11px] leading-snug"}`}
      >
        The drone has landed at {getLocation(mission.patientHomeId).short}. Enter the code the
        patient received to unlock the package.
      </p>
      <div
        className={`mt-3 rounded-xl border border-border/70 bg-background/40 ${fullscreen ? "px-3 py-2" : "px-2.5 py-1.5 text-[11px]"}`}
      >
        <span className={fullscreen ? "text-sm text-muted-foreground" : "hud-label"}>
          Demo SMS to {mission.patientName}
        </span>
        <div className="font-mono text-base tracking-[0.4em] text-foreground">{mission.otp}</div>
      </div>
      <div className={`mt-3 flex flex-wrap items-center gap-2 ${fullscreen ? "gap-3" : ""}`}>
        <InputOTP
          maxLength={4}
          value={code}
          onChange={(v) => {
            setCode(v.replace(/\D/g, ""));
            setError(null);
          }}
          onComplete={(v: string) => submit(v)}
          inputMode="numeric"
          aria-label="Enter the 4-digit OTP"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className={`${fullscreen ? "h-11 w-11 text-lg" : "h-8 w-8 text-sm"} bg-background/60 font-mono`}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <Button
          variant="hero"
          size={fullscreen ? "default" : "sm"}
          className={fullscreen ? "h-11 px-5 text-sm" : "h-8 px-2"}
          onClick={() => submit()}
        >
          Verify
        </Button>
      </div>
      <button
        className={`mt-2 text-primary underline-offset-2 hover:underline ${fullscreen ? "text-sm" : "text-[11px]"}`}
        onClick={() => {
          setCode(mission.otp);
          submit(mission.otp);
        }}
      >
        Auto-fill demo code
      </button>
      {error && <p className="mt-1 text-[11px] text-alert">{error}</p>}
    </div>
  );
}

function StageCards({
  mission,
  showDescription = true,
  fullscreen = false,
}: {
  mission?: Mission;
  showDescription?: boolean;
  fullscreen?: boolean;
}) {
  const current = mission ? stageIndex(mission.stage) : -1;
  return (
    <ol className={fullscreen ? "space-y-2" : "space-y-1.5"}>
      {DELIVERY_STAGES.map((stage, i) => {
        const Icon = STAGE_ICON[stage];
        const done = i < current;
        const active = i === current;
        const at = mission?.history.find((h) => h.stage === stage)?.t;
        return (
          <li
            key={stage}
            data-state={done ? "done" : active ? "active" : "pending"}
            className={`rounded-xl transition-colors ${
              fullscreen
                ? "border border-transparent bg-secondary/45 px-3 py-2.5 data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10 data-[state=pending]:opacity-55"
                : "border border-border bg-panel-strong/60 p-1.5 data-[state=active]:border-primary/70 data-[state=active]:bg-primary/10 data-[state=pending]:opacity-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex shrink-0 items-center justify-center rounded-lg ${
                  fullscreen ? "h-7 w-7" : "h-5 w-5"
                } ${
                  done
                    ? "bg-success/20 text-success"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {done ? (
                  <CheckCircle2 className={fullscreen ? "h-4 w-4" : "h-3 w-3"} />
                ) : (
                  <Icon className={fullscreen ? "h-4 w-4" : "h-3 w-3"} />
                )}
              </span>
              <span
                className={`font-medium ${fullscreen ? "text-[15px]" : "text-[11px]"} ${active ? "text-primary" : ""}`}
              >
                {i + 1}. {STAGE_INFO[stage].title}
              </span>
              <span
                className={`ml-auto font-mono ${fullscreen ? "text-xs" : "text-[10px]"} text-muted-foreground`}
              >
                {at !== undefined ? formatSimTime(at) : active ? "now" : ""}
              </span>
            </div>
            {active && showDescription && (
              <p
                className={`mt-1.5 pl-9 leading-relaxed text-muted-foreground ${fullscreen ? "text-sm" : "text-[10px] leading-snug"}`}
              >
                {STAGE_INFO[stage].explain}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function MissionStatusPanel({ fullscreen = false }: { fullscreen?: boolean }) {
  const focusMission = useSim((s) => s.focusMission);
  const startDelivery = useSim((s) => s.startDelivery);
  const missions = useSim((s) => s.snap.missions);
  const time = useSim((s) => s.snap.t);
  const mission = useFocusedMission();
  return mission ? (
    <section className={`panel rounded-2xl ${fullscreen ? "min-h-full p-4" : "p-3"}`}>
      <div className="flex items-center justify-between">
        <h2 className={`font-semibold tracking-tight ${fullscreen ? "text-lg" : "hud-label"}`}>
          Mission Status
        </h2>
        {missions.length > 1 && (
          <div className="flex gap-1">
            {missions.slice(0, 4).map((m) => (
              <button
                key={m.id}
                onClick={() => focusMission(m.id)}
                className={`rounded-md px-2 py-1 font-mono ${fullscreen ? "text-xs" : "text-[10px]"} ${
                  m.id === mission.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.id.slice(4)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`mt-4 grid grid-cols-2 ${fullscreen ? "gap-2" : "gap-1.5 text-[10px]"}`}>
        {[
          ["Mission", mission.id],
          ["Drone", mission.droneId],
          ["Medicine", mission.medicine],
          ["Destination", `${mission.patientName} · ${getLocation(mission.patientHomeId).short}`],
          ["Elapsed", formatSimTime(Math.max(0, time - mission.createdAt))],
        ].map(([k, v]) => (
          <div
            key={k}
            className={`rounded-xl bg-secondary/55 ${fullscreen ? "px-3 py-2.5" : "px-1.5 py-1"}`}
          >
            <div
              className={
                fullscreen ? "text-xs font-medium text-muted-foreground" : "hud-label !text-[8px]"
              }
            >
              {k}
            </div>
            <div className={`truncate font-medium ${fullscreen ? "mt-0.5 text-sm" : ""}`} title={v}>
              {v}
            </div>
          </div>
        ))}
      </div>
      <div className={fullscreen ? "mt-5" : "mt-2"}>
        <StageCards mission={mission} showDescription fullscreen={fullscreen} />
      </div>
      {mission.stage === "otp" && (
        <div className={fullscreen ? "mt-4" : "mt-2"}>
          <OtpCard mission={mission} fullscreen={fullscreen} />
        </div>
      )}
      {!fullscreen && mission.stage === "complete" && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-success/50 bg-success/10 p-2 text-xs text-success">
          <CheckCircle2 className="h-4 w-4" /> Delivery confirmed and drone recharged.
        </div>
      )}
      {missions
        .filter((m) => m.stage === "otp" && m.id !== mission.id)
        .map((m) => (
          <div key={m.id} className="mt-2">
            <OtpCard mission={m} fullscreen={fullscreen} />
          </div>
        ))}
    </section>
  ) : (
    <section
      className={`panel text-muted-foreground ${fullscreen ? "rounded-2xl p-4" : "p-3 text-xs"}`}
    >
      <div className={`mb-2 font-semibold ${fullscreen ? "text-lg text-foreground" : "hud-label"}`}>
        Mission Status
      </div>
      <p className={`mb-3 ${fullscreen ? "text-sm" : ""}`}>
        No delivery mission is active. Start a medicine delivery to follow the assigned drone
        through each stage.
      </p>
      <Button
        variant="hero"
        size={fullscreen ? "default" : "sm"}
        className="mb-4"
        onClick={startDelivery}
      >
        <Pill /> Start Medicine Delivery
      </Button>
      <StageCards fullscreen={fullscreen} />
    </section>
  );
}

export function HealthcarePanel({
  fullscreen,
  mode,
}: {
  fullscreen: boolean;
  mode: "healthcare" | "security";
}) {
  const startDelivery = useSim((s) => s.startDelivery);
  const activeCount = useSim((s) => s.snap.missions.filter((m) => m.stage !== "complete").length);

  return (
    <div className={fullscreen ? "h-full" : "space-y-2"}>
      <section
        className={`panel flex items-center justify-between gap-2 p-3 ${fullscreen || mode === "security" ? "hidden" : ""}`}
      >
        <div className="min-w-0">
          <div className="hud-label">Healthcare mode</div>
          <h2 className="mt-0.5 truncate text-sm font-semibold">Medicine delivery</h2>
          <p className="text-[10px] text-muted-foreground">
            {activeCount > 0 ? `${activeCount} mission(s) in progress` : "Ready to dispatch"}
          </p>
        </div>
        <Button variant="hero" size="sm" className="shrink-0 px-2.5" onClick={startDelivery}>
          <Pill /> Start delivery
        </Button>
      </section>
      <MissionStatusPanel fullscreen={fullscreen} />
    </div>
  );
}
