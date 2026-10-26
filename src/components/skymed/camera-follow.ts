import * as THREE from "three";
import type { DeliveryStage } from "@/sim/engine";

interface CameraControlsTarget {
  target: THREE.Vector3;
  update: () => void;
}

const FOLLOW_OFFSET = new THREE.Vector3(8, 6, 8);
const OVERVIEW_POSITION = new THREE.Vector3(35, 37, 35);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
const dronePosition = new THREE.Vector3();
const cameraOffset = FOLLOW_OFFSET.clone().normalize();
const desiredPosition = new THREE.Vector3();

const STAGE_CAMERA_DISTANCE: Record<Exclude<DeliveryStage, "complete">, number> = {
  dispatch: 18,
  pickup: 16,
  transit: 22,
  arrival: 16,
  otp: 14,
  delivery: 14,
  return: 18,
  charging: 14,
};

export function getDeliveryCameraFocus(
  stage: Exclude<DeliveryStage, "complete">,
  drone: THREE.Vector3,
  pickup: THREE.Vector3,
  destination: THREE.Vector3,
  hub: THREE.Vector3,
  target: THREE.Vector3,
) {
  switch (stage) {
    case "pickup":
      target.copy(drone).add(pickup).multiplyScalar(0.5);
      break;
    case "arrival":
    case "otp":
    case "delivery":
      target.copy(drone).add(destination).multiplyScalar(0.5);
      break;
    case "return":
      target.copy(drone).add(hub).multiplyScalar(0.5);
      break;
    case "charging":
      target.copy(drone).add(hub).multiplyScalar(0.5);
      break;
    case "dispatch":
    case "transit":
      target.copy(drone);
      break;
  }
  return STAGE_CAMERA_DISTANCE[stage];
}

export function updateCinematicCamera(
  camera: THREE.Camera,
  controls: CameraControlsTarget,
  drone: THREE.Object3D | undefined,
  followEnabled: boolean,
  returnToOverview: boolean,
  delta: number,
  focus?: { target: THREE.Vector3; distance: number },
) {
  let target: THREE.Vector3;
  let position: THREE.Vector3;

  if (returnToOverview) {
    target = OVERVIEW_TARGET;
    position = OVERVIEW_POSITION;
  } else if (followEnabled && drone) {
    drone.getWorldPosition(dronePosition);
    target = focus?.target ?? dronePosition;
    position = desiredPosition
      .copy(target)
      .addScaledVector(cameraOffset, focus?.distance ?? FOLLOW_OFFSET.length());
  } else if (followEnabled && focus) {
    target = focus.target;
    position = desiredPosition.copy(target).addScaledVector(cameraOffset, focus.distance);
  } else {
    return false;
  }

  const blend = 1 - Math.exp(-3.2 * Math.min(delta, 0.05));
  camera.position.lerp(position, blend);
  controls.target.lerp(target, blend);
  controls.update();

  return returnToOverview && camera.position.distanceTo(OVERVIEW_POSITION) < 0.15;
}
