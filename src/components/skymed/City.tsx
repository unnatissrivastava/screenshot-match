import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HUBS, LOCATIONS, PAD_OFFSETS } from "@/sim/city";
import { getEngine } from "@/sim/store";
import { P, sceneFx } from "./palette";

// ---------------------------------------------------------------- helpers
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rect = [number, number, number, number]; // x0 z0 x1 z1
type BlockType = "hospital" | "office" | "shops" | "houses" | "park" | "officeLow" | "apartments";
const BLOCKS: Array<{ cx: number; cz: number; type: BlockType; reserve?: Rect[] }> = [
  { cx: -12, cz: -12, type: "hospital", reserve: [[-17, -17, -7, -7]] },
  { cx: 0, cz: -12, type: "office" },
  { cx: 12, cz: -12, type: "shops", reserve: [[9, -15, 15, -7.4]] },
  { cx: -12, cz: 0, type: "houses", reserve: [[-14.6, -2.2, -9.4, 3.2]] },
  { cx: 0, cz: 0, type: "park" },
  { cx: 12, cz: 0, type: "officeLow", reserve: [[9.4, -2.2, 14.6, 3.2]] },
  { cx: -12, cz: 12, type: "apartments", reserve: [[-14.4, 9.6, -9.6, 14.4]] },
  { cx: 0, cz: 12, type: "houses", reserve: [[-3.4, 9, 3.6, 15.2]] },
  { cx: 12, cz: 12, type: "houses", reserve: [[8.4, 8.4, 11.9, 11.9], [11.4, 11.4, 15, 15]] },
];

interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  kind: "tower" | "house";
  color: string;
  roof: string;
}

function overlaps(a: Rect, b: Rect) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function generateLots(): Lot[] {
  const rnd = mulberry32(42);
  const lots: Lot[] = [];
  const offs = [-3.2, 0, 3.2];
  for (const b of BLOCKS) {
    if (b.type === "park" || b.type === "hospital") continue;
    for (const ox of offs)
      for (const oz of offs) {
        const x = b.cx + ox;
        const z = b.cz + oz;
        const house = b.type === "houses";
        const w = house ? 1.7 + rnd() * 0.5 : 1.9 + rnd() * 0.7;
        const d = house ? 1.5 + rnd() * 0.5 : 1.9 + rnd() * 0.7;
        const rect: Rect = [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
        if (b.reserve?.some((r) => overlaps(r, rect))) continue;
        const h =
          b.type === "office"
            ? 3.4 + rnd() * 2.6
            : b.type === "apartments"
              ? 2.4 + rnd() * 1.8
              : b.type === "officeLow"
                ? 1.8 + rnd() * 1.6
                : b.type === "shops"
                  ? 1.1 + rnd() * 1
                  : 0.9 + rnd() * 0.5;
        lots.push({
          x,
          z,
          w,
          d,
          h,
          kind: house ? "house" : "tower",
          color: (house ? P.house : P.building)[Math.floor(rnd() * (house ? P.house.length : P.building.length))]!,
          roof: P.roof[Math.floor(rnd() * P.roof.length)]!,
        });
      }
  }
  return lots;
}

function makeWindowTextures() {
  const rnd = mulberry32(7);
  const W = 64;
  const H = 96;
  const cols = 3;
  const rows = 3;
  const base = document.createElement("canvas");
  base.width = W;
  base.height = H;
  const emis = document.createElement("canvas");
  emis.width = W;
  emis.height = H;
  const g = base.getContext("2d")!;
  const e = emis.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  e.fillStyle = "#000000";
  e.fillRect(0, 0, W, H);
  const cw = W / cols;
  const rh = H / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.2;
      const y = r * rh + rh * 0.25;
      g.fillStyle = "#8ea4bd";
      g.fillRect(x, y, cw * 0.6, rh * 0.5);
      if (rnd() > 0.3) {
        const warm = rnd();
        e.fillStyle = warm > 0.25 ? "#ffd98a" : "#9fe4ff";
        e.fillRect(x, y, cw * 0.6, rh * 0.5);
      }
    }
  const map = new THREE.CanvasTexture(base);
  const emissiveMap = new THREE.CanvasTexture(emis);
  for (const t of [map, emissiveMap]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, emissiveMap };
}

function makeLaneTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2b3a52";
  g.fillRect(0, 0, 128, 16);
  g.fillStyle = "#9fdcef";
  g.fillRect(8, 7, 48, 2);
  g.fillRect(72, 7, 48, 2);
  g.fillStyle = "#3a4c68";
  g.fillRect(0, 0, 128, 1);
  g.fillRect(0, 15, 128, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeHelipadTexture(letter: string, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a3b55";
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = "bold 64px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- building instancing
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function TowerTier({ lots, repeatY, textures }: { lots: Lot[]; repeatY: number; textures: ReturnType<typeof makeWindowTextures> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const roof = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => {
    const map = textures.map.clone();
    const emissiveMap = textures.emissiveMap.clone();
    map.repeat.set(2, repeatY);
    emissiveMap.repeat.set(2, repeatY);
    map.needsUpdate = emissiveMap.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: new THREE.Color(P.window),
      emissiveIntensity: 0,
      roughness: 0.65,
      metalness: 0.05,
    });
  }, [textures, repeatY]);

  useLayoutEffect(() => {
    if (!mesh.current || !roof.current) return;
    lots.forEach((l, i) => {
      dummy.position.set(l.x, l.h / 2 + 0.12, l.z);
      dummy.scale.set(l.w, l.h, l.d);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
      mesh.current!.setColorAt(i, tmpColor.set(l.color));
      dummy.position.set(l.x, l.h + 0.16, l.z);
      dummy.scale.set(l.w + 0.08, 0.08, l.d + 0.08);
      dummy.updateMatrix();
      roof.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true;
    roof.current!.instanceMatrix.needsUpdate = true;
  }, [lots]);

  useFrame(() => {
    mat.emissiveIntensity = sceneFx.night * 0.55;
  });

  if (!lots.length) return null;
  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, lots.length]} material={mat} castShadow receiveShadow>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, lots.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#8394ab" roughness={0.8} />
      </instancedMesh>
    </>
  );
}

function Houses({ lots }: { lots: Lot[] }) {
  const walls = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const winMat = useRef<THREE.MeshStandardMaterial>(null);
  useLayoutEffect(() => {
    if (!walls.current || !roofs.current) return;
    lots.forEach((l, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(l.x, l.h / 2 + 0.12, l.z);
      dummy.scale.set(l.w, l.h, l.d);
      dummy.updateMatrix();
      walls.current!.setMatrixAt(i, dummy.matrix);
      walls.current!.setColorAt(i, tmpColor.set(l.color));
      dummy.position.set(l.x, l.h + 0.12 + 0.45, l.z);
      dummy.rotation.set(0, Math.PI / 4, 0);
      dummy.scale.set(l.w * 0.78, 0.9, l.d * 0.78);
      dummy.updateMatrix();
      roofs.current!.setMatrixAt(i, dummy.matrix);
      roofs.current!.setColorAt(i, tmpColor.set(l.roof));
    });
    dummy.rotation.set(0, 0, 0);
    walls.current!.instanceMatrix.needsUpdate = true;
    roofs.current!.instanceMatrix.needsUpdate = true;
    if (walls.current!.instanceColor) walls.current!.instanceColor.needsUpdate = true;
    if (roofs.current!.instanceColor) roofs.current!.instanceColor.needsUpdate = true;
  }, [lots]);
  useFrame(() => {
    if (winMat.current) winMat.current.emissiveIntensity = sceneFx.night * 0.22;
  });
  if (!lots.length) return null;
  return (
    <>
      <instancedMesh ref={walls} args={[undefined, undefined, lots.length]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial ref={winMat} roughness={0.85} emissive={P.window} emissiveIntensity={0} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, lots.length]} castShadow>
        <coneGeometry args={[0.72, 1, 4]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </>
  );
}

// ---------------------------------------------------------------- trees & street lights
function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const pts = useMemo(() => {
    const rnd = mulberry32(99);
    const out: Array<[number, number, number]> = [];
    let guard = 0;
    while (out.length < 22 && guard++ < 400) {
      const x = (rnd() - 0.5) * 9;
      const z = (rnd() - 0.5) * 9;
      if (x > -2.6 && x < 2.6 && z > -3.6 && z < 1.6) continue; // hub
      if (Math.hypot(x - 2.6, z - 3) < 1.4) continue; // pond
      out.push([x, z, 0.7 + rnd() * 0.5]);
    }
    // street trees around residential blocks
    for (const [x, z] of [
      [-16.4, 6.8], [-7.6, 6.8], [-16.4, 17.2], [7.6, 17.2], [16.4, 7.2], [-7.6, -6.8], [7.6, -6.8], [16.4, -6.8],
    ] as Array<[number, number]>)
      out.push([x, z, 0.7]);
    return out;
  }, []);
  useLayoutEffect(() => {
    pts.forEach(([x, z, s], i) => {
      dummy.position.set(x, 0.12 + 0.25 * s, z);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunks.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.12 + 0.95 * s, z);
      dummy.updateMatrix();
      crowns.current!.setMatrixAt(i, dummy.matrix);
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    crowns.current!.instanceMatrix.needsUpdate = true;
  }, [pts]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, pts.length]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.5, 6]} />
        <meshStandardMaterial color={P.trunk} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, pts.length]} castShadow>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color={P.tree} flatShading roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function StreetLights() {
  const poles = useRef<THREE.InstancedMesh>(null);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  const bulbMat = useRef<THREE.MeshBasicMaterial>(null);
  const poolMat = useRef<THREE.MeshBasicMaterial>(null);
  const pts = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (const r of [-6, 6])
      for (const s of [-15, -9, -3, 3, 9, 15]) {
        out.push([s, r + 1.15]);
        out.push([r - 1.15, s]);
      }
    return out;
  }, []);
  useLayoutEffect(() => {
    pts.forEach(([x, z], i) => {
      dummy.position.set(x, 0.6, z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 1.22, z);
      dummy.updateMatrix();
      bulbs.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.14, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      pools.current!.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
    poles.current!.instanceMatrix.needsUpdate = true;
    bulbs.current!.instanceMatrix.needsUpdate = true;
    pools.current!.instanceMatrix.needsUpdate = true;
  }, [pts]);
  const day = useMemo(() => new THREE.Color("#c7d2de"), []);
  const night = useMemo(() => new THREE.Color("#ffe2a0").multiplyScalar(1.6), []);
  useFrame(() => {
    bulbMat.current?.color.lerpColors(day, night, sceneFx.night);
    if (poolMat.current) poolMat.current.opacity = sceneFx.night * 0.35;
  });
  return (
    <>
      <instancedMesh ref={poles} args={[undefined, undefined, pts.length]}>
        <cylinderGeometry args={[0.025, 0.035, 1.2, 5]} />
        <meshStandardMaterial color="#5b6b82" />
      </instancedMesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, pts.length]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial ref={bulbMat} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, pts.length]}>
        <circleGeometry args={[0.9, 20]} />
        <meshBasicMaterial
          ref={poolMat}
          color="#ffcf7a"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}

// ---------------------------------------------------------------- landmarks
function Cross({ color, position, rotationY = 0, size = 1 }: { color: string; position: [number, number, number]; rotationY?: number; size?: number }) {
  return (
    <group position={position} rotation-y={rotationY} scale={size}>
      <mesh>
        <boxGeometry args={[0.7, 0.22, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.22, 0.7, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function Hospital() {
  const heli = useMemo(() => makeHelipadTexture("H", P.hospitalAccent), []);
  return (
    <group>
      <mesh position={[-12, 2.12, -12]} castShadow receiveShadow>
        <boxGeometry args={[6.4, 4, 5]} />
        <meshStandardMaterial color={P.hospital} roughness={0.5} />
      </mesh>
      {/* glass band */}
      {[1.2, 2.4, 3.4].map((y) => (
        <mesh key={y} position={[-12, y, -12]}>
          <boxGeometry args={[6.46, 0.32, 5.06]} />
          <meshStandardMaterial color="#6f9ec4" metalness={0.4} roughness={0.25} emissive="#9fe4ff" emissiveIntensity={0.1} />
        </mesh>
      ))}
      <mesh position={[-9, 1.22, -8.4]} castShadow receiveShadow>
        <boxGeometry args={[3, 2.2, 2.2]} />
        <meshStandardMaterial color={P.hospital} roughness={0.5} />
      </mesh>
      {/* ambulance canopy */}
      <mesh position={[-13.6, 1.0, -8.9]} castShadow>
        <boxGeometry args={[2.6, 0.12, 1.4]} />
        <meshStandardMaterial color={P.hospitalAccent} />
      </mesh>
      <mesh position={[-12, 4.15, -12]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.3, 32]} />
        <meshStandardMaterial map={heli} />
      </mesh>
      <Cross color={P.hospitalAccent} position={[-12, 3.0, -9.47]} size={1.3} />
      <Cross color={P.hospitalAccent} position={[-8.77, 3.0, -12]} rotationY={Math.PI / 2} size={1.3} />
    </group>
  );
}

function Pharmacy() {
  const pad = useMemo(() => makeHelipadTexture("Rx", P.pharmacyAccent), []);
  return (
    <group>
      <mesh position={[12, 1.02, -12.8]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 1.8, 2.8]} />
        <meshStandardMaterial color={P.pharmacy} roughness={0.6} />
      </mesh>
      <mesh position={[12, 0.75, -11.3]} castShadow>
        <boxGeometry args={[4.2, 0.08, 0.6]} />
        <meshStandardMaterial color={P.pharmacyAccent} />
      </mesh>
      <mesh position={[12, 0.5, -11.38]}>
        <boxGeometry args={[3.4, 0.6, 0.04]} />
        <meshStandardMaterial color="#6f9ec4" metalness={0.4} roughness={0.2} emissive="#bff5dd" emissiveIntensity={0.2} />
      </mesh>
      <Cross color={P.pharmacyAccent} position={[12, 1.45, -11.37]} size={0.9} />
      <mesh position={[12, 0.15, -9.2]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.9, 32]} />
        <meshStandardMaterial map={pad} />
      </mesh>
    </group>
  );
}

function Residences() {
  const pad = useMemo(() => makeHelipadTexture("D", P.cyan), []);
  return (
    <group>
      {/* Lotus Apartments with rooftop drop pad */}
      <mesh position={[-12, 1.82, 12]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 3.4, 3.6]} />
        <meshStandardMaterial color="#efe6f0" roughness={0.7} />
      </mesh>
      {[0.9, 1.8, 2.7].map((y) => (
        <mesh key={y} position={[-12, y, 12]}>
          <boxGeometry args={[3.66, 0.18, 3.66]} />
          <meshStandardMaterial color="#b893b8" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[-12, 3.54, 12]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.95, 32]} />
        <meshStandardMaterial map={pad} />
      </mesh>
      {/* Cedar Court */}
      <mesh position={[-1.1, 0.82, 13.3]} castShadow receiveShadow>
        <boxGeometry args={[3, 1.4, 2.4]} />
        <meshStandardMaterial color="#f0e2cc" roughness={0.8} />
      </mesh>
      <mesh position={[-1.1, 1.97, 13.3]} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[2.1, 0.9, 4]} />
        <meshStandardMaterial color="#7a5c4c" />
      </mesh>
      <mesh position={[1.8, 0.15, 10.6]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.85, 32]} />
        <meshStandardMaterial map={pad} />
      </mesh>
      {/* Maple Residency */}
      <mesh position={[13.2, 0.92, 13.2]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 1.6, 2.8]} />
        <meshStandardMaterial color="#e4ecf2" roughness={0.8} />
      </mesh>
      <mesh position={[13.2, 2.17, 13.2]} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[2.1, 0.9, 4]} />
        <meshStandardMaterial color="#9a4b3a" />
      </mesh>
      <mesh position={[10.2, 0.15, 10.2]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.85, 32]} />
        <meshStandardMaterial map={pad} />
      </mesh>
    </group>
  );
}

function Hub({ hubIndex }: { hubIndex: number }) {
  const hub = HUBS[hubIndex]!;
  const rings = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const colors = useMemo(
    () => ({ idle: new THREE.Color(P.cyan), charge: new THREE.Color(P.green), empty: new THREE.Color("#2c4a72") }),
    [],
  );
  useFrame((state) => {
    const e = getEngine();
    for (let p = 0; p < 4; p++) {
      const d = e.drones[hubIndex * 4 + p];
      const m = rings.current[p];
      if (!m || !d) continue;
      const onPad = d.task === "docked" || d.task === "charging";
      if (!onPad) m.color.copy(colors.empty);
      else if (d.task === "charging") {
        m.color.copy(colors.charge).multiplyScalar(0.7 + 0.5 * Math.sin(state.clock.elapsedTime * 4 + p));
      } else m.color.copy(colors.idle);
    }
  });
  return (
    <group position={[hub.x, 0, hub.z]}>
      <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 0.3, 3.6]} />
        <meshStandardMaterial color={P.hub} roughness={0.4} metalness={0.3} />
      </mesh>
      {PAD_OFFSETS.map(([x, z], i) => (
        <group key={i} position={[x, 0.43, z]}>
          <mesh>
            <cylinderGeometry args={[0.7, 0.7, 0.03, 28]} />
            <meshStandardMaterial color={P.pad} roughness={0.5} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <ringGeometry args={[0.55, 0.64, 32]} />
            <meshBasicMaterial
              ref={(m) => {
                rings.current[i] = m;
              }}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {[
        [-1.65, -1.65],
        [1.65, -1.65],
        [-1.65, 1.65],
        [1.65, 1.65],
      ].map(([x = 0, z = 0], i) => (
        <mesh key={i} position={[x, 0.65, z]} castShadow>
          <boxGeometry args={[0.18, 0.5, 0.18]} />
          <meshStandardMaterial color="#2a4166" emissive={P.cyan} emissiveIntensity={0.35} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- city root
export function City() {
  const textures = useMemo(() => makeWindowTextures(), []);
  const lane = useMemo(() => makeLaneTexture(), []);
  const lots = useMemo(() => generateLots(), []);
  const towers = lots.filter((l) => l.kind === "tower");
  const tiers = [
    { lots: towers.filter((l) => l.h < 2.4), repeatY: 1 },
    { lots: towers.filter((l) => l.h >= 2.4 && l.h < 4), repeatY: 2 },
    { lots: towers.filter((l) => l.h >= 4), repeatY: 3 },
  ];
  const houses = lots.filter((l) => l.kind === "house");
  const hLane = useMemo(() => {
    const t = lane.clone();
    t.repeat.set(19, 1);
    t.needsUpdate = true;
    return t;
  }, [lane]);

  const edge = useMemo<Array<[number, number, number]>>(() => {
    const s = 20;
    return [[-s, 0.01, -s], [s, 0.01, -s], [s, 0.01, s], [-s, 0.01, s], [-s, 0.01, -s]];
  }, []);

  return (
    <group>
      {/* base slab = roads */}
      <mesh position={[0, -0.6, 0]} receiveShadow>
        <boxGeometry args={[40, 1.2, 40]} />
        <meshStandardMaterial color={P.road} roughness={0.9} />
      </mesh>
      <mesh position={[0, -1.25, 0]}>
        <boxGeometry args={[41.2, 0.1, 41.2]} />
        <meshStandardMaterial color={P.base} emissive={P.baseEdge} emissiveIntensity={0.15} />
      </mesh>
      <Line points={edge} color={P.baseEdge} lineWidth={1.5} />
      <gridHelper args={[120, 60, "#1d3a5c", "#132a46"]} position={[0, -1.4, 0]} />

      {/* lane markings */}
      {[-18, -6, 6, 18].map((z) => (
        <mesh key={`h${z}`} position={[0, 0.005, z]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[38, 1.6]} />
          <meshStandardMaterial map={hLane} roughness={0.9} />
        </mesh>
      ))}
      {[-18, -6, 6, 18].map((x) => (
        <mesh key={`v${x}`} position={[x, 0.006, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow>
          <planeGeometry args={[38, 1.6]} />
          <meshStandardMaterial map={hLane} roughness={0.9} />
        </mesh>
      ))}

      {/* city blocks */}
      {BLOCKS.map((b) => (
        <mesh key={`${b.cx},${b.cz}`} position={[b.cx, 0.06, b.cz]} receiveShadow>
          <boxGeometry args={[10.2, 0.12, 10.2]} />
          <meshStandardMaterial color={b.type === "park" ? P.park : P.block} roughness={0.95} />
        </mesh>
      ))}
      {/* park pond + paths */}
      <mesh position={[2.6, 0.13, 3]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.2, 32]} />
        <meshStandardMaterial color="#4f8fb8" roughness={0.15} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.125, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[3.6, 4.0, 48]} />
        <meshStandardMaterial color="#d9d2bf" />
      </mesh>

      {tiers.map((t) => (
        <TowerTier key={t.repeatY} lots={t.lots} repeatY={t.repeatY} textures={textures} />
      ))}
      <Houses lots={houses} />
      <Trees />
      <StreetLights />
      <Hospital />
      <Pharmacy />
      <Residences />
      {HUBS.map((_, i) => (
        <Hub key={i} hubIndex={i} />
      ))}
    </group>
  );
}

export const LABELLED_LOCATIONS = LOCATIONS;
