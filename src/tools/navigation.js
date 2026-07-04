import * as THREE from 'three';

/**
 * Navigation presets — animate camera to standard views.
 */

const DURATION = 600; // ms

/** Easing function — cubic ease-in-out */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Animate camera to a named view preset.
 * @param {THREE.PerspectiveCamera} camera
 * @param {OrbitControls} controls
 * @param {'top'|'bottom'|'front'|'back'|'left'|'right'|'isometric'} preset
 * @param {THREE.Box3|null} bounds - scene bounding box
 */
export function animateToView(camera, controls, preset, bounds) {
  if (!bounds || bounds.isEmpty()) return;

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 2;

  const viewDirections = {
    top:       new THREE.Vector3(0, 1, 0.001),
    bottom:    new THREE.Vector3(0, -1, 0.001),
    front:     new THREE.Vector3(0, 0, 1),
    back:      new THREE.Vector3(0, 0, -1),
    left:      new THREE.Vector3(-1, 0, 0),
    right:     new THREE.Vector3(1, 0, 0),
    isometric: new THREE.Vector3(1, 1, 1).normalize()
  };

  const dir = viewDirections[preset];
  if (!dir) return;

  const endPos = center.clone().add(dir.clone().multiplyScalar(dist));

  // For top/bottom, set camera up to face front
  const upVectors = {
    top:    new THREE.Vector3(0, 0, -1),
    bottom: new THREE.Vector3(0, 0, 1)
  };
  const endUp = upVectors[preset] || new THREE.Vector3(0, 1, 0);

  _animateCamera(camera, controls, endPos, center, endUp);
}

/**
 * Fit all models in the scene.
 * @param {THREE.PerspectiveCamera} camera
 * @param {OrbitControls} controls
 * @param {THREE.Scene} scene
 * @returns {THREE.Box3|null}
 */
export function fitAll(camera, controls, scene) {
  const box = new THREE.Box3();
  scene.traverse(child => {
    if (child.isMesh && child.userData.expressID !== undefined) {
      box.expandByObject(child);
    }
  });

  if (box.isEmpty()) return null;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 1.8;

  const endPos = new THREE.Vector3(
    center.x + dist * 0.45,
    center.y + dist * 0.55,
    center.z + dist * 0.45
  );

  _animateCamera(camera, controls, endPos, center, new THREE.Vector3(0, 1, 0));
  return box;
}

/**
 * Get scene bounding box (models only).
 */
export function getSceneBounds(scene) {
  const box = new THREE.Box3();
  scene.traverse(child => {
    if (child.isMesh && child.userData.expressID !== undefined) {
      box.expandByObject(child);
    }
  });
  return box.isEmpty() ? null : box;
}

/* ---- Internal animation ---- */
function _animateCamera(camera, controls, endPos, endTarget, endUp) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startUp = camera.up.clone();
  const startTime = performance.now();

  function tick() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / DURATION, 1);
    const e = easeInOutCubic(t);

    camera.position.lerpVectors(startPos, endPos, e);
    controls.target.lerpVectors(startTarget, endTarget, e);
    camera.up.lerpVectors(startUp, endUp, e).normalize();
    controls.update();

    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
