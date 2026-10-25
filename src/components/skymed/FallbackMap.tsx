import { useEffect, useState } from "react";
import { LOCATIONS, PATROL_ROUTES } from "@/sim/city";
import { getEngine, useSim } from "@/sim/store";

const TASK_CLASS: Record<string, string> = {
  delivery: "fill-primary",
  patrol: "fill-warning",
  shuttle: "fill-shuttle",
  returning: "fill-returning",
  charging: "fill-success",
  docked: "fill-returning",
};

/** 2D top-down tactical map. Used when WebGL is unavailable or the 3D scene fails. */
export function FallbackMap({ reason }: { reason?: string }) {
  const [, setTick] = useState(0);
  const mode = useSim((s) => s.snap.mode);
  const alerts = useSim((s) => s.snap.alerts);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 80);
    return () => window.clearInterval(id);
  }, []);
  const drones = getEngine().drones;
  const blocks = [-12, 0, 12].flatMap((x) => [-12, 0, 12].map((z) => [x, z] as const));

  return (
    <div className="relative h-full w-full grid-overlay">
      <svg viewBox="-21 -21 42 42" className="h-full w-full" role="img" aria-label="2D map of the simulated city and drone positions">
        <rect x={-20} y={-20} width={40} height={40} className="fill-secondary stroke-primary/60" strokeWidth={0.15} rx={0.6} />
        {blocks.map(([x, z]) => (
          <rect key={`${x}${z}`} x={x - 5} y={z - 5} width={10} height={10} rx={0.4} className={x === 0 && z === 0 ? "fill-success/25" : "fill-muted"} />
        ))}
        {mode === "security" &&
          PATROL_ROUTES.map((r) => (
            <polygon
              key={r.id}
              points={r.points.map(([x, z]) => `${x},${z}`).join(" ")}
              className="fill-none stroke-warning/50"
              strokeWidth={0.15}
              strokeDasharray="0.6 0.4"
            />
          ))}
        {LOCATIONS.map((l) => (
          <g key={l.id}>
            <circle cx={l.x} cy={l.z} r={0.9} className="fill-none stroke-primary" strokeWidth={0.15} />
            <text x={l.x} y={l.z - 1.4} textAnchor="middle" className="fill-foreground" fontSize={1}>
              {l.short}
            </text>
          </g>
        ))}
        {mode === "security" &&
          alerts
            .filter((a) => a.review === "pending")
            .map((a) => <circle key={a.id} cx={a.pos.x} cy={a.pos.z} r={1.4} className="fill-alert/30 stroke-alert" strokeWidth={0.15} />)}
        {drones.map((d) => (
          <g key={d.id}>
            <circle cx={d.pos.x} cy={d.pos.z} r={0.55} className={TASK_CLASS[d.task]} />
            <text x={d.pos.x + 0.8} y={d.pos.z + 0.35} className="fill-foreground font-mono" fontSize={0.75}>
              {d.id}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full border border-warning/50 bg-panel px-3 py-1 text-xs text-warning">
        {reason ?? "2D tactical map"} · simulation continues normally
      </div>
    </div>
  );
}
