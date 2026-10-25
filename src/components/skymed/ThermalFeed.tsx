import { useEffect, useMemo, useRef } from "react";
import { LOCATIONS } from "@/sim/city";
import { getEngine } from "@/sim/store";

const W = 192;
const H = 120;
const PX_PER_UNIT = 9;

/** Iron-bow style false-color lookup table. */
function buildLut() {
  const stops: Array<[number, [number, number, number]]> = [
    [0, [6, 4, 24]],
    [0.25, [58, 12, 110]],
    [0.45, [168, 30, 92]],
    [0.62, [228, 86, 30]],
    [0.8, [252, 176, 34]],
    [1, [255, 252, 220]],
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1]![0]) k++;
    const [a, ca] = stops[k]!;
    const [b, cb] = stops[k + 1]!;
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = ca[c]! + (cb[c]! - ca[c]!) * t;
  }
  return lut;
}

function gray(v: number) {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${g},${g},${g})`;
}

const WALKERS = Array.from({ length: 14 }, (_, i) => {
  const l = LOCATIONS[i % LOCATIONS.length]!;
  return { ox: l.x + ((i * 37) % 7) - 3, oz: l.z + ((i * 53) % 7) - 3, r: 1.2 + (i % 3) * 0.6, s: 0.25 + (i % 4) * 0.08, p: i * 1.7 };
});

/** Simulated top-down thermal camera view following the selected patrol drone. */
export function ThermalFeed({ droneId }: { droneId: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lut = useMemo(() => buildLut(), []);
  const idRef = useRef(droneId);
  idRef.current = droneId;

  useEffect(() => {
    const out = canvas.current;
    if (!out) return;
    const octx = out.getContext("2d");
    const work = document.createElement("canvas");
    work.width = W;
    work.height = H;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    if (!octx || !wctx) return;
    let raf = 0;
    let last = 0;
    let simClock = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 70) return;
      last = now;
      const e = getEngine();
      const d = idRef.current ? e.drones.find((x) => x.id === idRef.current) : undefined;
      simClock = e.t;
      const cx = d ? d.pos.x : 0;
      const cz = d ? d.pos.z : 0;
      const toX = (x: number) => (x - cx) * PX_PER_UNIT + W / 2;
      const toY = (z: number) => (z - cz) * PX_PER_UNIT + H / 2;

      // --- grayscale heat scene
      wctx.filter = "none";
      wctx.fillStyle = gray(0.2);
      wctx.fillRect(0, 0, W, H);
      // roads (warmer asphalt) and blocks (cooler)
      for (const bx of [-12, 0, 12])
        for (const bz of [-12, 0, 12]) {
          wctx.fillStyle = bx === 0 && bz === 0 ? gray(0.12) : gray(0.16);
          wctx.fillRect(toX(bx - 5), toY(bz - 5), 10 * PX_PER_UNIT, 10 * PX_PER_UNIT);
          for (const ox of [-3.2, 0, 3.2])
            for (const oz of [-3.2, 0, 3.2]) {
              const seed = Math.abs(Math.sin((bx + ox) * 12.9 + (bz + oz) * 78.2));
              if (seed < 0.25) continue;
              wctx.fillStyle = gray(0.28 + seed * 0.14);
              wctx.fillRect(toX(bx + ox - 1), toY(bz + oz - 1), 2 * PX_PER_UNIT, 2 * PX_PER_UNIT);
            }
        }
      // landmarks: hospital & hubs run warm
      for (const l of LOCATIONS) {
        wctx.fillStyle = gray(l.kind === "hospital" ? 0.55 : l.kind === "hub" ? 0.5 : 0.4);
        const s = l.kind === "hospital" ? 3 : 1.6;
        wctx.fillRect(toX(l.x - s), toY(l.z - s), s * 2 * PX_PER_UNIT, s * 2 * PX_PER_UNIT);
      }
      // people
      wctx.filter = "blur(1.5px)";
      for (const w of WALKERS) {
        const a = w.p + simClock * w.s;
        const x = w.ox + Math.cos(a) * w.r;
        const z = w.oz + Math.sin(a * 1.3) * w.r;
        wctx.fillStyle = gray(0.85);
        wctx.beginPath();
        wctx.arc(toX(x), toY(z), 2.6, 0, Math.PI * 2);
        wctx.fill();
      }
      // other drones (hot motors)
      for (const o of e.drones) {
        if (!o.airborne || o.id === d?.id) continue;
        wctx.fillStyle = gray(0.7);
        wctx.beginPath();
        wctx.arc(toX(o.pos.x), toY(o.pos.z), 2, 0, Math.PI * 2);
        wctx.fill();
      }
      // sample detections
      const visible = e.alerts.filter((a) => a.review !== "dismissed");
      for (const a of visible) {
        wctx.fillStyle = gray(1);
        wctx.beginPath();
        wctx.arc(toX(a.pos.x), toY(a.pos.z), 4.5, 0, Math.PI * 2);
        wctx.fill();
      }

      // --- false color + sensor noise
      const img = wctx.getImageData(0, 0, W, H);
      const px = img.data;
      for (let i = 0; i < px.length; i += 4) {
        let v = px[i]! + (Math.random() - 0.5) * 18;
        v = v < 0 ? 0 : v > 255 ? 255 : v | 0;
        px[i] = lut[v * 3]!;
        px[i + 1] = lut[v * 3 + 1]!;
        px[i + 2] = lut[v * 3 + 2]!;
      }
      octx.putImageData(img, 0, 0);

      // --- HUD overlay
      octx.strokeStyle = "rgba(180,240,255,0.7)";
      octx.lineWidth = 1;
      octx.beginPath();
      octx.moveTo(W / 2 - 8, H / 2);
      octx.lineTo(W / 2 - 3, H / 2);
      octx.moveTo(W / 2 + 3, H / 2);
      octx.lineTo(W / 2 + 8, H / 2);
      octx.moveTo(W / 2, H / 2 - 8);
      octx.lineTo(W / 2, H / 2 - 3);
      octx.moveTo(W / 2, H / 2 + 3);
      octx.lineTo(W / 2, H / 2 + 8);
      octx.stroke();
      octx.font = "7px monospace";
      for (const a of visible) {
        const x = toX(a.pos.x);
        const y = toY(a.pos.z);
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
        octx.strokeStyle = a.review === "pending" ? "#7cf0ff" : "#ffcf5a";
        octx.strokeRect(x - 9, y - 9, 18, 18);
        octx.fillStyle = "rgba(4,10,22,0.75)";
        octx.fillRect(x - 9, y - 19, 66, 9);
        octx.fillStyle = octx.strokeStyle;
        octx.fillText(`SAMPLE ${a.kind.toUpperCase()} ${a.confidence}%`, x - 8, y - 12);
      }
      octx.fillStyle = "rgba(4,10,22,0.7)";
      octx.fillRect(0, H - 10, W, 10);
      octx.fillStyle = "#bdefff";
      octx.fillText(
        d ? `${d.id}  ALT ${d.pos.y.toFixed(1)}m  X${d.pos.x.toFixed(0)} Z${d.pos.z.toFixed(0)}  IR-SIM` : "NO FEED · NO PATROL DRONE AIRBORNE",
        4,
        H - 3,
      );
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [lut]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border">
      <canvas ref={canvas} width={W} height={H} className="block aspect-[192/120] w-full [image-rendering:pixelated]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-scan bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-background/70 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-alert">
        <span className="h-1.5 w-1.5 animate-blink rounded-full bg-alert" /> Simulated thermal feed
      </div>
    </div>
  );
}
