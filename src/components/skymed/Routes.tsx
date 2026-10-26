import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { PATROL_ROUTES, getLocation, type Vec3 } from "@/sim/city";
import { getEngine, useSim } from "@/sim/store";
import { P, TASK_COLOR } from "./palette";

const UP = new THREE.Vector3(0, 1, 0);

function RouteLine({
  points,
  color,
  dashed = true,
  emphasized = false,
}: {
  points: Vec3[];
  color: string;
  dashed?: boolean;
  emphasized?: boolean;
}) {
  const lineRef = useRef<{ material: { dashOffset: number } } | null>(null);
  const arrows = useRef<Array<THREE.Mesh | null>>([]);
  const offset = useRef(0);
  const pts = useMemo(() => points.map((p) => new THREE.Vector3(p.x, p.y, p.z)), [points]);
  const segs = useMemo(() => {
    const out: Array<{
      a: THREE.Vector3;
      b: THREE.Vector3;
      len: number;
      start: number;
      dir: THREE.Vector3;
    }> = [];
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = a.distanceTo(b);
      if (len < 0.01) continue;
      out.push({ a, b, len, start: acc, dir: b.clone().sub(a).normalize() });
      acc += len;
    }
    return { list: out, total: acc };
  }, [pts]);
  const ARROWS = emphasized ? Math.max(2, Math.min(4, Math.round(segs.total / 10))) : 0;

  useFrame((_, delta) => {
    const running = getEngine().state === "running";
    const dt = running ? Math.min(delta, 0.05) : 0;
    offset.current += dt * 2.2;
    if (lineRef.current) lineRef.current.material.dashOffset = -offset.current;
    if (!segs.total) return;
    for (let k = 0; k < ARROWS; k++) {
      const m = arrows.current[k];
      if (!m) continue;
      const s = (offset.current + (k * segs.total) / ARROWS) % segs.total;
      const seg =
        segs.list.find((x) => s >= x.start && s <= x.start + x.len) ??
        segs.list[segs.list.length - 1]!;
      const t = (s - seg.start) / seg.len;
      m.position.lerpVectors(seg.a, seg.b, t);
      m.quaternion.setFromUnitVectors(UP, seg.dir);
    }
  });

  if (pts.length < 2) return null;
  return (
    <group>
      {emphasized && (
        <Line
          points={pts}
          color="#0b2532"
          lineWidth={4.2}
          dashed={dashed}
          dashSize={0.8}
          gapSize={0.42}
          transparent
          opacity={0.65}
          depthTest={false}
          depthWrite={false}
        />
      )}
      <Line
        ref={lineRef as never}
        points={pts}
        color={color}
        lineWidth={emphasized ? 2.8 : 1}
        dashed={dashed}
        dashSize={emphasized ? 0.8 : 0.5}
        gapSize={emphasized ? 0.42 : 0.55}
        transparent
        opacity={emphasized ? 0.98 : 0.2}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
      {Array.from({ length: ARROWS }, (_, k) => (
        <mesh
          key={k}
          ref={(m) => {
            arrows.current[k] = m;
          }}
        >
          <coneGeometry args={[0.16, 0.42, 3]} />
          <meshBasicMaterial
            color={color}
            toneMapped={false}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function ActiveRoutes({
  visible = true,
  selectedDroneId = null,
}: {
  visible?: boolean;
  selectedDroneId?: string | null;
}) {
  const mode = useSim((s) => s.snap.mode);
  const activeMissionDroneId = useSim((s) => {
    const focusedMission = s.snap.missions.find(
      (mission) => mission.id === s.snap.focusMissionId && mission.stage !== "complete",
    );
    return (
      focusedMission?.droneId ??
      s.snap.missions.find((mission) => mission.stage !== "complete")?.droneId
    );
  });
  const emphasizedDroneId =
    selectedDroneId ?? (mode === "healthcare" ? activeMissionDroneId : null);
  // Re-render only when a route is (re)assigned or a task changes.
  const key = useSim((s) =>
    s.snap.drones.map((d) => `${d.id}:${d.routeVersion}:${d.task}`).join("|"),
  );
  const routes = useMemo(() => {
    const e = getEngine();
    return e.drones
      .filter((d) => d.task !== "docked" && d.task !== "charging" && d.route.length > 1)
      .map((d) => ({
        droneId: d.id,
        id: `${d.id}-${d.routeVersion}`,
        points: d.route.map((p) => ({ ...p })),
        color: TASK_COLOR[d.task] ?? P.cyan,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);
  if (!visible) return null;
  return (
    <>
      {routes.map((r) => (
        <RouteLine
          key={r.id}
          points={r.points}
          color={
            emphasizedDroneId === r.droneId ? (mode === "security" ? P.amber : P.cyan) : r.color
          }
          emphasized={emphasizedDroneId === r.droneId}
        />
      ))}
    </>
  );
}

export function PatrolLoops({ visible = true }: { visible?: boolean }) {
  const mode = useSim((s) => s.snap.mode);
  if (!visible || mode !== "security") return null;
  return (
    <>
      {PATROL_ROUTES.map((r) => (
        <Line
          key={r.id}
          points={[...r.points, r.points[0]!].map(
            ([x, z]) => [x, r.alt, z] as [number, number, number],
          )}
          color={P.amber}
          lineWidth={1}
          transparent
          opacity={0.12}
          dashed
          dashSize={0.25}
          gapSize={0.35}
        />
      ))}
    </>
  );
}

function PulseMarker({ position, color }: { position: [number, number, number]; color: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current = (t.current + Math.min(delta, 0.05) * 0.8) % 1;
    if (ring.current) ring.current.scale.setScalar(0.6 + t.current * 1.6);
    if (ringMat.current) ringMat.current.opacity = (1 - t.current) * 0.9;
  });
  return (
    <group position={position}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.04}>
        <ringGeometry args={[0.8, 0.95, 40]} />
        <meshBasicMaterial
          ref={ringMat}
          color={color}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[1.05, 1.12, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh position-y={2}>
        <cylinderGeometry args={[0.05, 0.05, 4, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

export function MissionMarkers() {
  const key = useSim((s) =>
    s.snap.missions
      .filter((m) => m.stage !== "complete")
      .map((m) => `${m.id}:${m.stage}`)
      .join("|"),
  );
  const markers = useMemo(() => {
    const e = getEngine();
    const out: Array<{
      id: string;
      pos: [number, number, number];
      color: string;
      label: string;
      sub: string;
    }> = [];
    for (const m of e.missions) {
      if (m.stage === "dispatch" || m.stage === "pickup") {
        const l = getLocation("pharmacy");
        out.push({
          id: `${m.id}-p`,
          pos: [l.x, l.landY - 0.15, l.z],
          color: P.green,
          label: "Pickup",
          sub: m.id,
        });
      }
      if (["dispatch", "pickup", "transit", "arrival", "otp", "delivery"].includes(m.stage)) {
        const l = getLocation(m.patientHomeId);
        out.push({
          id: `${m.id}-d`,
          pos: [l.x, l.landY - 0.15, l.z],
          color: P.cyan,
          label: m.stage === "otp" ? "Awaiting OTP" : "Drop-off",
          sub: m.id,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <>
      {markers.map((m) => (
        <PulseMarker key={m.id} position={m.pos} color={m.color} />
      ))}
    </>
  );
}

export function AlertMarkers() {
  const alerts = useSim((s) => s.snap.alerts);
  const mode = useSim((s) => s.snap.mode);
  if (mode !== "security") return null;
  return (
    <>
      {alerts
        .filter((a) => a.review !== "dismissed")
        .slice(0, 5)
        .map((a) => (
          <PulseMarker
            key={a.id}
            position={[a.pos.x, 0.12, a.pos.z]}
            color={a.review === "confirmed" ? P.amber : P.coral}
          />
        ))}
    </>
  );
}
