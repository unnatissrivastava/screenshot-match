import * as THREE from "three";

interface CameraControlsTarget {
  target: THREE.Vector3;
  update: () => void;
}

const FOLLOW_OFFSET = new THREE.Vector3(8, 6, 8);
const OVERVIEW_POSITION = new THREE.Vector3(35, 37, 35);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
const dronePosition = new THREE.Vector3();

export function updateCinematicCamera(
  camera: THREE.Camera,
  controls: CameraControlsTarget,
  drone: THREE.Object3D | undefined,
  followEnabled: boolean,
  returnToOverview: boolean,
  delta: number,
) {
  let target: THREE.Vector3;
  let position: THREE.Vector3;

  if (returnToOverview) {
    target = OVERVIEW_TARGET;
    position = OVERVIEW_POSITION;
  } else if (followEnabled && drone) {
    drone.getWorldPosition(dronePosition);
    target = dronePosition;
    position = dronePosition.clone().add(FOLLOW_OFFSET);
  } else {
    return false;
  }

  const blend = 1 - Math.exp(-3.2 * Math.min(delta, 0.05));
  camera.position.lerp(position, blend);
  controls.target.lerp(target, blend);
  controls.update();

  return returnToOverview && camera.position.distanceTo(OVERVIEW_POSITION) < 0.15;
}
