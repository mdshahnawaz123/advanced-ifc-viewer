import * as THREE from 'three';

/**
 * Section cut tool — create and manage 3D clipping planes.
 * Double-click on a model surface to create a section plane.
 */
export class SectionTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.enabled = false;
    this.planes = [];        // { plane, helper, point, normal }
    this.onPlanesChanged = null;

    this._handleDblClick = this._handleDblClick.bind(this);
  }

  /** Enable section mode */
  enable() {
    this.enabled = true;
    this.viewer.renderer.domElement.addEventListener('dblclick', this._handleDblClick);
    this.viewer.renderer.domElement.style.cursor = 'crosshair';
  }

  /** Disable section mode */
  disable() {
    this.enabled = false;
    this.viewer.renderer.domElement.removeEventListener('dblclick', this._handleDblClick);
    this.viewer.renderer.domElement.style.cursor = '';
  }

  /** Create a clipping plane at the clicked surface */
  _handleDblClick(event) {
    if (!this.enabled) return;

    const meshes = this.viewer.getModelMeshes();
    const intersects = this.viewer.raycast(event, meshes);
    if (intersects.length === 0) return;

    const hit = intersects[0];
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);
    normal.negate(); // Invert normal so it clips away the geometry in front of the clicked face

    this.createPlane(hit.point.clone(), normal);
  }

  /**
   * Create a section plane at a point with a given normal.
   * @param {THREE.Vector3} point
   * @param {THREE.Vector3} normal
   */
  createPlane(point, normal) {
    const clippingPlane = new THREE.Plane();
    clippingPlane.setFromNormalAndCoplanarPoint(normal, point);

    // Visual helper: a translucent disc
    const helperSize = this._getHelperSize();
    const helperGeom = new THREE.PlaneGeometry(helperSize, helperSize);
    const helperMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    });
    const helper = new THREE.Mesh(helperGeom, helperMat);
    helper.position.copy(point);
    helper.lookAt(point.clone().add(normal));
    helper.renderOrder = 998;

    // Glowing border
    const borderGeom = new THREE.EdgesGeometry(helperGeom);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.5
    });
    const border = new THREE.LineSegments(borderGeom, borderMat);
    helper.add(border);

    // Normal arrow indicator
    const arrowHelper = new THREE.ArrowHelper(
      normal, new THREE.Vector3(0, 0, 0), helperSize * 0.3, 0x00d4ff, helperSize * 0.08, helperSize * 0.04
    );
    helper.add(arrowHelper);

    this.viewer.scene.add(helper);

    // Apply clipping to renderer
    this.viewer.clippingPlanes.push(clippingPlane);
    this._applyClipping();

    const entry = { plane: clippingPlane, helper, point, normal };
    this.planes.push(entry);

    if (this.onPlanesChanged) this.onPlanesChanged(this.planes);
    return entry;
  }

  /** Remove a section plane by index */
  removePlane(index) {
    if (index < 0 || index >= this.planes.length) return;

    const entry = this.planes[index];
    this.viewer.scene.remove(entry.helper);
    entry.helper.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });

    const planeIdx = this.viewer.clippingPlanes.indexOf(entry.plane);
    if (planeIdx >= 0) this.viewer.clippingPlanes.splice(planeIdx, 1);

    this.planes.splice(index, 1);
    this._applyClipping();

    if (this.onPlanesChanged) this.onPlanesChanged(this.planes);
  }

  /** Remove all section planes */
  clearAll() {
    while (this.planes.length > 0) {
      this.removePlane(0);
    }
  }

  /** Show/hide plane helpers */
  toggleHelpers(visible) {
    for (const entry of this.planes) {
      entry.helper.visible = visible;
    }
  }

  /** Get number of active planes */
  get count() {
    return this.planes.length;
  }

  /* ---- Internal ---- */

  /** Apply clipping planes to all model materials */
  _applyClipping() {
    const planes = [...this.viewer.clippingPlanes];
    const meshes = this.viewer.getModelMeshes();
    meshes.forEach(child => {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        mat.clippingPlanes = planes.length > 0 ? planes : null;
        mat.clipShadows = true;
        mat.needsUpdate = true;
      }
    });
  }

  /** Calculate helper size based on scene bounds */
  _getHelperSize() {
    const bounds = this.viewer.getSceneBounds();
    if (!bounds) return 20;
    const size = bounds.getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z) * 1.2;
  }
}
