import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { getEngine } from "@/sim/store";
import { landingPoint } from "@/sim/city";
import { City } from "./City";
import { Drones, droneObjectRegistry } from "./Drones";
import { getDeliveryCameraFocus, updateCinematicCamera } from "./camera-follow";
import { P, sceneFx } from "./palette";
import { ActiveRoutes, AlertMarkers, MissionMarkers, PatrolLoops } from "./Routes";
import { labelRegistry } from "./SceneLabels";

const projV = new THREE.Vector3();

export type CameraActions = {
  zoomIn: () => void;
  zoomOut: () => void;
  cityOverview: () => void;
};

export interface MapDisplayOptions {
  droneLabels: boolean;
  flightPaths: boolean;
  spotlights: boolean;
  hubLabels: boolean;
}

function WheelScrollGuard() {
  const { gl } = useThree();
  useEffect(() => {
    const preventPageScroll = (event: WheelEvent) => event.preventDefault();
    gl.domElement.addEventListener("wheel", preventPageScroll, { passive: false });
    return () => gl.domElement.removeEventListener("wheel", preventPageScroll);
  }, [gl]);
  return null;
}

function CameraControls({
  onCameraReady,
  followEnabled,
  onFollowChange,
  selectedDroneId,
}: {
  onCameraReady: (actions: CameraActions | null) => void;
  followEnabled: boolean;
  onFollowChange: (enabled: boolean) => void;
  selectedDroneId: string | null;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const manualOverride = useRef(false);
  const overviewRequested = useRef(false);
  const previousFollow = useRef(followEnabled);
  const trackedStage = useRef("");
  const stageElapsed = useRef(0);
  const chargingOverviewMissionId = useRef<string | null>(null);
  const dronePosition = useRef(new THREE.Vector3());
  const destinationPosition = useRef(new THREE.Vector3());
  const hubPosition = useRef(new THREE.Vector3());
  const focusTarget = useRef(new THREE.Vector3());
  const pickupPosition = useMemo(() => {
    const point = landingPoint("pharmacy");
    return new THREE.Vector3(point.x, point.y, point.z);
  }, []);
  useEffect(() => {
    if (followEnabled && !previousFollow.current) {
      manualOverride.current = false;
      overviewRequested.current = false;
    }
    previousFollow.current = followEnabled;
  }, [followEnabled]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    onCameraReady({
      zoomIn: () => {
        controls.dollyIn(1.2);
        controls.update();
      },
      zoomOut: () => {
        controls.dollyOut(1.2);
        controls.update();
      },
      cityOverview: () => {
        manualOverride.current = false;
        overviewRequested.current = true;
        onFollowChange(false);
      },
    });
    return () => onCameraReady(null);
  }, [onCameraReady, onFollowChange]);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const engine = getEngine();
    const focusedMission = engine.missions.find((mission) => mission.id === engine.focusMissionId);
    const activeMission =
      focusedMission && focusedMission.stage !== "complete"
        ? focusedMission
        : engine.missions.find((mission) => mission.stage !== "complete");
    const selectedDrone = engine.drones.find((item) => item.id === selectedDroneId);
    const selectedMission = selectedDrone?.missionId
      ? engine.missions.find(
          (mission) => mission.id === selectedDrone.missionId && mission.stage !== "complete",
        )
      : undefined;
    const healthcareMission = selectedDrone ? selectedMission : activeMission;
    const healthcareDrone =
      selectedDrone ??
      (healthcareMission
        ? engine.drones.find((item) => item.id === healthcareMission.droneId)
        : undefined);
    const trackedMission = engine.mode === "healthcare" ? healthcareMission : activeMission;
    const trackedDrone = engine.mode === "healthcare" ? healthcareDrone : undefined;
    const droneId = trackedDrone?.id ?? activeMission?.droneId;
    const drone = droneId ? droneObjectRegistry.get(droneId) : undefined;
    const shouldFollow = followEnabled && !manualOverride.current && !overviewRequested.current;

    const stageKey = trackedMission
      ? `${trackedMission.id}:${trackedMission.stage}`
      : trackedDrone
        ? `drone:${trackedDrone.id}`
        : "";
    if (stageKey !== trackedStage.current) {
      trackedStage.current = stageKey;
      stageElapsed.current = 0;
    }
    if (
      chargingOverviewMissionId.current &&
      (!engine.missions.some((mission) => mission.id === chargingOverviewMissionId.current) ||
        (trackedMission && trackedMission.id !== chargingOverviewMissionId.current))
    ) {
      chargingOverviewMissionId.current = null;
    }
    if (
      trackedMission &&
      trackedMission.stage === "charging" &&
      shouldFollow &&
      engine.state === "running"
    ) {
      stageElapsed.current += Math.min(delta, 0.05);
      if (stageElapsed.current >= 2.5) {
        chargingOverviewMissionId.current = trackedMission.id;
      }
    }

    let focus: { target: THREE.Vector3; distance: number } | undefined;
    if (engine.mode === "healthcare" && trackedDrone) {
      const position = trackedDrone.pos;
      dronePosition.current.set(position.x, position.y, position.z);
      if (trackedMission && trackedMission.stage !== "complete") {
        const destination = landingPoint(trackedMission.patientHomeId);
        const pad = trackedDrone.pad;
        destinationPosition.current.set(destination.x, destination.y, destination.z);
        hubPosition.current.set(pad.x, pad.y, pad.z);
        const distance = getDeliveryCameraFocus(
          trackedMission.stage,
          dronePosition.current,
          pickupPosition,
          destinationPosition.current,
          hubPosition.current,
          focusTarget.current,
        );
        focus = { target: focusTarget.current, distance };
      } else {
        focusTarget.current.copy(dronePosition.current);
        focus = { target: focusTarget.current, distance: 13 };
      }
    }
    const chargingDrone = chargingOverviewMissionId.current
      ? engine.missions.find((mission) => mission.id === chargingOverviewMissionId.current)?.droneId
      : undefined;
    const returnFromCharging =
      engine.mode === "healthcare" &&
      chargingOverviewMissionId.current !== null &&
      (!trackedMission || trackedMission.id === chargingOverviewMissionId.current) &&
      (!selectedDrone || selectedDrone.id === chargingDrone);
    const reachedOverview = updateCinematicCamera(
      camera,
      controls,
      shouldFollow ? drone : undefined,
      shouldFollow,
      overviewRequested.current ||
        (shouldFollow && ((!trackedMission && !trackedDrone) || returnFromCharging)),
      delta,
      shouldFollow ? focus : undefined,
    );
    if (reachedOverview) overviewRequested.current = false;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[0, 0, 0]}
      enablePan
      enableDamping
      dampingFactor={0.08}
      minDistance={10}
      maxDistance={85}
      minPolarAngle={0.55}
      maxPolarAngle={1.12}
      minAzimuthAngle={Math.PI / 4 - 0.75}
      maxAzimuthAngle={Math.PI / 4 + 0.75}
      rotateSpeed={0.5}
      zoomSpeed={0.7}
      zoomToCursor
      onStart={() => {
        manualOverride.current = true;
        overviewRequested.current = false;
        onFollowChange(false);
      }}
    />
  );
}

/** Moves the DOM labels in SceneLabels to their projected screen positions. */
function LabelProjector() {
  useFrame(({ camera, size }) => {
    const placed: DOMRect[] = [];
    const labels = [...labelRegistry.values()].sort((a, b) => b.priority - a.priority);
    for (const { el, pos } of labels) {
      if (el.classList.contains("hidden")) {
        el.style.visibility = "hidden";
        continue;
      }
      const p = pos();
      if (!p) {
        el.style.visibility = "hidden";
        continue;
      }
      projV.set(p[0], p[1], p[2]).project(camera);
      if (projV.z > 1 || projV.z < -1) {
        el.style.visibility = "hidden";
        continue;
      }
      const x = (projV.x * 0.5 + 0.5) * size.width;
      const y = (-projV.y * 0.5 + 0.5) * size.height;
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (!width || !height) {
        el.style.visibility = "hidden";
        continue;
      }
      let accepted = false;
      for (const offset of [0, 16, -16, 32, -32, 48, -48]) {
        const rect = new DOMRect(x - width / 2, y - offset - height, width, height);
        if (
          rect.left < 3 ||
          rect.right > size.width - 3 ||
          rect.top < 3 ||
          rect.bottom > size.height - 3 ||
          placed.some(
            (other) =>
              rect.left < other.right + 3 &&
              rect.right + 3 > other.left &&
              rect.top < other.bottom + 3 &&
              rect.bottom + 3 > other.top,
          )
        ) {
          continue;
        }
        placed.push(rect);
        el.style.transform = `translate(${x.toFixed(1)}px, ${(y - offset).toFixed(1)}px) translate(-50%, -100%)`;
        el.style.visibility = "visible";
        accepted = true;
        break;
      }
      if (!accepted) el.style.visibility = "hidden";
    }
  });
  return null;
}

/** Blends day ↔ night lighting based on the current mode. */
function DayNight() {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();
  const c = useMemo(
    () => ({
      bgDay: new THREE.Color(P.bgDay),
      bgNight: new THREE.Color(P.bgNight),
      sunDay: new THREE.Color("#fff3df"),
      sunNight: new THREE.Color("#8fb0ff"),
      skyDay: new THREE.Color("#cfe2ff"),
      skyNight: new THREE.Color("#3b5590"),
      gndDay: new THREE.Color("#2a3a55"),
      gndNight: new THREE.Color("#0b1426"),
      ambDay: new THREE.Color("#b9cbe6"),
      ambNight: new THREE.Color("#3a4c7a"),
    }),
    [],
  );
  useFrame((_, delta) => {
    const target = getEngine().mode === "security" ? 1 : 0;
    sceneFx.night += (target - sceneFx.night) * (1 - Math.exp(-2.2 * Math.min(delta, 0.05)));
    const n = sceneFx.night;
    if (scene.background instanceof THREE.Color) scene.background.lerpColors(c.bgDay, c.bgNight, n);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.lerpColors(c.bgDay, c.bgNight, n);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.35, 0.18, n);
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(1.55, 0.55, n);
      sun.current.color.lerpColors(c.sunDay, c.sunNight, n);
    }
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(0.6, 0.45, n);
      hemi.current.color.lerpColors(c.skyDay, c.skyNight, n);
      hemi.current.groundColor.lerpColors(c.gndDay, c.gndNight, n);
    }
    if (amb.current) {
      amb.current.intensity = THREE.MathUtils.lerp(0.35, 0.32, n);
      amb.current.color.lerpColors(c.ambDay, c.ambNight, n);
    }
  });
  return (
    <>
      <color attach="background" args={[P.bgDay]} />
      <fog attach="fog" args={[P.bgDay, 70, 140]} />
      <ambientLight ref={amb} intensity={0.35} />
      <hemisphereLight ref={hemi} args={["#cfe2ff", "#2a3a55", 0.85]} />
      <directionalLight
        ref={sun}
        position={[18, 30, 12]}
        intensity={2.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />
    </>
  );
}

export default function SceneCanvas({
  onCameraReady,
  fullscreen = false,
  followEnabled,
  onFollowChange,
  displayOptions,
  selectedDroneId,
  hoveredDroneId,
  onSelectDrone,
  onHoverDrone,
}: {
  onCameraReady: (actions: CameraActions | null) => void;
  fullscreen?: boolean;
  followEnabled: boolean;
  onFollowChange: (enabled: boolean) => void;
  displayOptions: MapDisplayOptions;
  selectedDroneId: string | null;
  hoveredDroneId: string | null;
  onSelectDrone: (id: string) => void;
  onHoverDrone: (id: string | null) => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [35, 37, 35], fov: fullscreen ? 38 : 32, near: 0.5, far: 300 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <WheelScrollGuard />
      <DayNight />
      <Environment resolution={64}>
        <Lightformer
          intensity={2}
          position={[0, 10, 0]}
          rotation-x={Math.PI / 2}
          scale={[20, 20, 1]}
        />
        <Lightformer
          intensity={1}
          color="#8fd8ff"
          position={[-10, 3, -5]}
          rotation-y={Math.PI / 2}
          scale={[20, 2, 1]}
        />
        <Lightformer
          intensity={0.6}
          color="#ffe2b8"
          position={[10, 3, 5]}
          rotation-y={-Math.PI / 2}
          scale={[20, 2, 1]}
        />
      </Environment>
      <Suspense fallback={null}>
        <City />
        <Drones
          displaySpotlights={displayOptions.spotlights}
          selectedDroneId={selectedDroneId}
          hoveredDroneId={hoveredDroneId}
          onSelectDrone={onSelectDrone}
          onHoverDrone={onHoverDrone}
        />
        <ActiveRoutes visible={displayOptions.flightPaths} selectedDroneId={selectedDroneId} />
        <PatrolLoops visible={displayOptions.flightPaths} />
        <MissionMarkers />
        <AlertMarkers />
      </Suspense>
      <LabelProjector />
      <CameraControls
        onCameraReady={onCameraReady}
        followEnabled={followEnabled}
        onFollowChange={onFollowChange}
        selectedDroneId={selectedDroneId}
      />
    </Canvas>
  );
}
