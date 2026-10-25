import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getEngine } from "@/sim/store";
import { P, TASK_COLOR, sceneFx } from "./palette";

const MOTORS: Array<[number, number]> = [
  [0.34, 0.34],
  [-0.34, 0.34],
  [0.34, -0.34],
  [-0.34, -0.34],
];

export const droneObjectRegistry = new Map<string, THREE.Group>();

function useSharedMaterials() {
  return useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({
        color: P.droneBody,
        roughness: 0.35,
        metalness: 0.15,
      }),
      dark: new THREE.MeshStandardMaterial({ color: P.droneDark, roughness: 0.5, metalness: 0.4 }),
      canopy: new THREE.MeshStandardMaterial({
        color: "#1e3a5c",
        roughness: 0.1,
        metalness: 0.6,
        emissive: P.cyan,
        emissiveIntensity: 0.25,
      }),
      blade: new THREE.MeshStandardMaterial({ color: "#2b3950", roughness: 0.6 }),
      disc: new THREE.MeshBasicMaterial({
        color: "#cfe9f5",
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
      pkg: new THREE.MeshStandardMaterial({ color: "#f6f2ea", roughness: 0.7 }),
      cross: new THREE.MeshBasicMaterial({ color: P.hospitalAccent }),
    }),
    [],
  );
}

function Drone({ index, mats }: { index: number; mats: ReturnType<typeof useSharedMaterials> }) {
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const rotors = useRef<Array<THREE.Group | null>>([]);
  const pkg = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const spot = useRef<THREE.Mesh>(null);
  const red = useRef<THREE.MeshBasicMaterial>(null);
  const green = useRef<THREE.MeshBasicMaterial>(null);
  const strobe = useRef<THREE.MeshBasicMaterial>(null);
  const glowRed = useRef<THREE.Mesh>(null);
  const glowGreen = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const beamMat = useRef<THREE.MeshBasicMaterial>(null);
  const spotMat = useRef<THREE.MeshBasicMaterial>(null);

  const s = useRef({
    phase: index * 1.3,
    rotor: 0,
    prev: new THREE.Vector3(),
    pitch: 0,
    roll: 0,
    init: false,
  });
  const tmp = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const drone = getEngine().drones[index];
    const group = root.current;
    if (!drone || !group) return;
    droneObjectRegistry.set(drone.id, group);
    return () => {
      if (droneObjectRegistry.get(drone.id) === group) droneObjectRegistry.delete(drone.id);
    };
  }, [index]);

  useFrame((_, rawDelta) => {
    const e = getEngine();
    const d = e.drones[index];
    const g = root.current;
    if (!d || !g) return;
    const st = s.current;
    const running = e.state === "running";
    const dt = running ? Math.min(rawDelta, 0.05) : 0;
    st.phase += dt;

    const bob = d.airborne ? Math.sin(st.phase * 2.4) * 0.05 : 0;
    g.position.set(d.pos.x, d.pos.y + bob, d.pos.z);
    g.rotation.y = d.heading;

    // tilt from velocity
    if (!st.init) {
      st.prev.copy(g.position);
      st.init = true;
    }
    if (dt > 0) {
      const vx = (g.position.x - st.prev.x) / dt;
      const vz = (g.position.z - st.prev.z) / dt;
      const speed = Math.hypot(vx, vz);
      const target = Math.min(speed * 0.045, 0.22);
      st.pitch += (target - st.pitch) * (1 - Math.exp(-6 * dt));
      st.prev.copy(g.position);
    }
    if (tilt.current) tilt.current.rotation.x = st.pitch;

    // rotors
    const targetSpin = d.airborne ? 48 : d.task === "delivery" && d.holdReason === "otp" ? 6 : 0;
    st.rotor += (targetSpin - st.rotor) * (1 - Math.exp(-3 * dt));
    for (const r of rotors.current) if (r) r.rotation.y += st.rotor * dt;

    if (pkg.current) pkg.current.visible = d.carrying;

    // nav lights — brighter at night, strobe blinks
    const night = sceneFx.night;
    const lit = 0.55 + night * 1.4;
    red.current?.color.set("#ff3b3b").multiplyScalar(lit);
    green.current?.color.set("#2bff8a").multiplyScalar(lit);
    const blink = running ? (Math.sin(st.phase * 9 + index) > 0.82 ? 1 : 0.08) : 0.3;
    strobe.current?.color.setScalar(blink * (0.6 + night * 1.8));
    const glowScale = 0.6 + night * 1.6;
    glowRed.current?.scale.setScalar(glowScale);
    glowGreen.current?.scale.setScalar(glowScale);

    if (ring.current) {
      tmp.set(TASK_COLOR[d.task] ?? P.cyan);
      ring.current.color.copy(tmp).multiplyScalar(1 + night * 0.6);
    }

    // patrol searchlight
    const beamOn = night > 0.05 && d.airborne && (d.task === "patrol" || d.task === "delivery");
    const alt = Math.max(d.pos.y + bob, 0.01);
    if (beam.current && beamMat.current) {
      beam.current.visible = beamOn;
      beam.current.scale.set(1, alt, 1);
      beam.current.position.y = -alt / 2;
      beamMat.current.opacity = night * (d.task === "patrol" ? 0.16 : 0.08);
    }
    if (spot.current && spotMat.current) {
      spot.current.visible = beamOn;
      spot.current.position.y = -alt + 0.16;
      spotMat.current.opacity = night * 0.45;
    }
  });

  return (
    <group ref={root}>
      <group ref={tilt}>
        <RoundedBox
          args={[0.42, 0.14, 0.5]}
          radius={0.05}
          smoothness={2}
          material={mats.body}
          castShadow
        />
        <mesh position={[0, 0.08, 0.06]} material={mats.canopy}>
          <sphereGeometry args={[0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {/* arms */}
        <mesh rotation-y={Math.PI / 4} material={mats.dark} castShadow>
          <boxGeometry args={[1.0, 0.04, 0.06]} />
        </mesh>
        <mesh rotation-y={-Math.PI / 4} material={mats.dark} castShadow>
          <boxGeometry args={[1.0, 0.04, 0.06]} />
        </mesh>
        {MOTORS.map(([x, z], i) => (
          <group key={i} position={[x, 0.03, z]}>
            <mesh material={mats.dark}>
              <cylinderGeometry args={[0.055, 0.065, 0.1, 10]} />
            </mesh>
            <group
              position-y={0.065}
              ref={(r) => {
                rotors.current[i] = r;
              }}
            >
              <mesh material={mats.blade}>
                <boxGeometry args={[0.36, 0.01, 0.045]} />
              </mesh>
              <mesh rotation-x={-Math.PI / 2} material={mats.disc}>
                <circleGeometry args={[0.2, 20]} />
              </mesh>
            </group>
          </group>
        ))}
        {/* skids */}
        {[0.14, -0.14].map((x) => (
          <mesh key={x} position={[x, -0.13, 0]} material={mats.dark}>
            <boxGeometry args={[0.03, 0.03, 0.46]} />
          </mesh>
        ))}
        {/* task ring */}
        <mesh rotation-x={-Math.PI / 2} position-y={-0.075}>
          <ringGeometry args={[0.24, 0.29, 28]} />
          <meshBasicMaterial ref={ring} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {/* nav lights: red = port (+x when facing +z), green = starboard */}
        <mesh position={[0.4, 0.02, 0.4]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial ref={red} toneMapped={false} />
        </mesh>
        <mesh ref={glowRed} position={[0.4, 0.02, 0.4]}>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshBasicMaterial
            color="#ff3b3b"
            transparent
            opacity={0.35}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh position={[-0.4, 0.02, 0.4]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial ref={green} toneMapped={false} />
        </mesh>
        <mesh ref={glowGreen} position={[-0.4, 0.02, 0.4]}>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshBasicMaterial
            color="#2bff8a"
            transparent
            opacity={0.35}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh position={[0, 0.04, -0.27]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial ref={strobe} toneMapped={false} />
        </mesh>
        {/* medicine package */}
        <group ref={pkg} position={[0, -0.2, 0]} visible={false}>
          <mesh material={mats.pkg} castShadow>
            <boxGeometry args={[0.22, 0.14, 0.22]} />
          </mesh>
          <mesh position={[0, 0, 0.111]} material={mats.cross}>
            <planeGeometry args={[0.12, 0.04]} />
          </mesh>
          <mesh position={[0, 0, 0.111]} material={mats.cross}>
            <planeGeometry args={[0.04, 0.12]} />
          </mesh>
        </group>
      </group>
      {/* searchlight (night) */}
      <mesh ref={beam} visible={false}>
        <cylinderGeometry args={[0.05, 0.9, 1, 20, 1, true]} />
        <meshBasicMaterial
          ref={beamMat}
          color="#cdeeff"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={spot} rotation-x={-Math.PI / 2} visible={false}>
        <circleGeometry args={[0.95, 24]} />
        <meshBasicMaterial
          ref={spotMat}
          color="#dff4ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

export function Drones() {
  const mats = useSharedMaterials();
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <Drone key={i} index={i} mats={mats} />
      ))}
    </>
  );
}
