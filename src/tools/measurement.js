import * as THREE from 'three';

/**
 * Measurement tool — click two points to measure distance.
 * Shows labeled dimension lines with snap-to-surface.
 */
export class MeasurementTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.enabled = false;
    this.measurements = [];   // completed measurements
    this.firstPoint = null;   // pending first click
    this.tempObjects = [];    // temp visuals (line, marker)
    this.snapMarker = null;   // visual indicator for snapping
    this.onMeasurementAdded = null;

    this._handleClick = this._handleClick.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /** Gets the snapped point to the nearest vertex of the intersected face */
  _getSnappedPoint(intersect) {
    const point = intersect.point.clone();
    const mesh = intersect.object;
    const geom = mesh.geometry;
    
    // Ensure we have geometry with indexed position attributes and an intersected face
    if (!geom || !geom.index || !geom.attributes.position || !intersect.face) {
      return { point, type: 'none' };
    }

    const { a, b, c } = intersect.face;
    const posAttr = geom.attributes.position;
    const matrix = mesh.matrixWorld;

    const vA = new THREE.Vector3().fromBufferAttribute(posAttr, a).applyMatrix4(matrix);
    const vB = new THREE.Vector3().fromBufferAttribute(posAttr, b).applyMatrix4(matrix);
    const vC = new THREE.Vector3().fromBufferAttribute(posAttr, c).applyMatrix4(matrix);

    const mAB = new THREE.Vector3().lerpVectors(vA, vB, 0.5);
    const mBC = new THREE.Vector3().lerpVectors(vB, vC, 0.5);
    const mCA = new THREE.Vector3().lerpVectors(vC, vA, 0.5);

    const distA = point.distanceTo(vA);
    const distB = point.distanceTo(vB);
    const distC = point.distanceTo(vC);
    const distMAB = point.distanceTo(mAB);
    const distMBC = point.distanceTo(mBC);
    const distMCA = point.distanceTo(mCA);

    const minVertexDist = Math.min(distA, distB, distC);
    const minMidDist = Math.min(distMAB, distMBC, distMCA);
    
    const SNAP_TOLERANCE = 0.3; // 30cm snap radius

    if (minVertexDist < SNAP_TOLERANCE && minVertexDist <= minMidDist) {
      if (minVertexDist === distA) return { point: vA, type: 'vertex' };
      if (minVertexDist === distB) return { point: vB, type: 'vertex' };
      if (minVertexDist === distC) return { point: vC, type: 'vertex' };
    }
    
    if (minMidDist < SNAP_TOLERANCE && minMidDist < minVertexDist) {
      if (minMidDist === distMAB) return { point: mAB, type: 'midpoint' };
      if (minMidDist === distMBC) return { point: mBC, type: 'midpoint' };
      if (minMidDist === distMCA) return { point: mCA, type: 'midpoint' };
    }

    return { point, type: 'none' };
  }

  /** Enable measurement mode */
  enable() {
    this.enabled = true;
    const el = this.viewer.renderer.domElement;
    el.addEventListener('click', this._handleClick);
    el.addEventListener('mousemove', this._handleMouseMove);
    window.addEventListener('keydown', this._handleKeyDown);
    el.style.cursor = 'crosshair';
  }

  /** Disable measurement mode */
  disable() {
    this.enabled = false;
    const el = this.viewer.renderer.domElement;
    el.removeEventListener('click', this._handleClick);
    el.removeEventListener('mousemove', this._handleMouseMove);
    window.removeEventListener('keydown', this._handleKeyDown);
    el.style.cursor = '';
    this._clearTemp();
    this.firstPoint = null;
    
    if (this.snapMarker) {
      this.viewer.scene.remove(this.snapMarker);
      this.snapMarker.material.dispose();
      this.snapMarker.geometry.dispose();
      this.snapMarker = null;
    }
  }

  /** Handle clicks — first click sets start, second creates measurement */
  _handleClick(event) {
    if (!this.enabled) return;

    // Prevent toolbar clicks from triggering
    if (event.target !== this.viewer.renderer.domElement) return;

    const meshes = this.viewer.getModelMeshes();
    const intersects = this.viewer.raycast(event, meshes);
    if (intersects.length === 0) return;

    const snapInfo = this._getSnappedPoint(intersects[0]);
    const point = snapInfo.point;

    if (!this.firstPoint) {
      // First point
      this.firstPoint = point;
      this._addTempMarker(point);
    } else {
      // Second point — create measurement
      this._createMeasurement(this.firstPoint, point);
      this._clearTemp();
      this.firstPoint = null;
      if (this.snapMarker) this.snapMarker.visible = false;
    }
  }

  /** Show dashed preview line from first point to cursor */
  _handleMouseMove(event) {
    if (!this.enabled) return;

    const meshes = this.viewer.getModelMeshes();
    const intersects = this.viewer.raycast(event, meshes);
    
    if (intersects.length === 0) {
      if (this.snapMarker) this.snapMarker.visible = false;
      return;
    }

    const snapInfo = this._getSnappedPoint(intersects[0]);
    const point = snapInfo.point;

    // Manage snap marker
    if (!this.snapMarker) {
      const geom = new THREE.SphereGeometry(0.08, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false, transparent: true, opacity: 0.8 });
      this.snapMarker = new THREE.Mesh(geom, mat);
      this.snapMarker.renderOrder = 1000;
      this.viewer.scene.add(this.snapMarker);
    }
    this.snapMarker.position.copy(point);
    this.snapMarker.material.color.setHex(snapInfo.type === 'midpoint' ? 0x00ffff : 0xffaa00);
    this.snapMarker.visible = snapInfo.type !== 'none';

    // Draw dashed preview if we have a first point
    if (this.firstPoint) {
      this._removeTempLine();
      const geom = new THREE.BufferGeometry().setFromPoints([this.firstPoint, point]);
      const mat = new THREE.LineDashedMaterial({
        color: 0x00ff88,
        dashSize: 0.15,
        gapSize: 0.08
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      line.userData._temp = 'line';
      line.renderOrder = 999;
      this.viewer.scene.add(line);
      this.tempObjects.push(line);
    }
  }

  /** Escape cancels pending measurement */
  _handleKeyDown(event) {
    if (event.key === 'Escape') {
      this._clearTemp();
      this.firstPoint = null;
      if (this.snapMarker) this.snapMarker.visible = false;
    }
  }

  /** Create a completed measurement between two points */
  _createMeasurement(start, end) {
    const distance = start.distanceTo(end);

    // --- Solid dimension line ---
    const lineGeom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00d4ff, depthTest: false });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 999;
    this.viewer.scene.add(line);

    // --- End markers ---
    const marker1 = this._createMarker(start, 0x00d4ff);
    const marker2 = this._createMarker(end, 0x00d4ff);

    // --- Extension lines (ticks at endpoints) ---
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    const perpendicular = new THREE.Vector3().crossVectors(dir, this.viewer.camera.up).normalize();
    const tickLen = distance * 0.04;

    const tick1 = this._createTick(start, perpendicular, tickLen);
    const tick2 = this._createTick(end, perpendicular, tickLen);

    // --- Label ---
    const label = this._createLabel(distance, start, end);

    const measurement = {
      line, marker1, marker2, tick1, tick2, label,
      start: start.clone(), end: end.clone(), distance
    };
    this.measurements.push(measurement);

    if (this.onMeasurementAdded) this.onMeasurementAdded(measurement);
    return measurement;
  }

  /** Create a sphere marker at a point */
  _createMarker(point, color) {
    const geom = new THREE.SphereGeometry(0.06, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(point);
    mesh.renderOrder = 1000;
    this.viewer.scene.add(mesh);
    return mesh;
  }

  /** Create extension tick at a point */
  _createTick(point, direction, length) {
    const p1 = point.clone().add(direction.clone().multiplyScalar(length));
    const p2 = point.clone().add(direction.clone().multiplyScalar(-length));
    const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineBasicMaterial({ color: 0x00d4ff, depthTest: false });
    const tick = new THREE.Line(geom, mat);
    tick.renderOrder = 999;
    this.viewer.scene.add(tick);
    return tick;
  }

  /** Create a sprite label showing the distance */
  _createLabel(distance, start, end) {
    const midpoint = new THREE.Vector3().lerpVectors(start, end, 0.5);

    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = 320 * dpr;
    canvas.height = 72 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = 'rgba(0, 16, 32, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 320, 72, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, 316, 68, 9);
    ctx.stroke();

    // Format distance
    let text;
    if (distance >= 1) {
      text = `${distance.toFixed(3)} m`;
    } else if (distance >= 0.01) {
      text = `${(distance * 100).toFixed(1)} cm`;
    } else {
      text = `${(distance * 1000).toFixed(1)} mm`;
    }

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 160, 36);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(midpoint);
    sprite.position.y += 0.25;
    sprite.scale.set(2.4, 0.54, 1);
    sprite.renderOrder = 1001;
    this.viewer.scene.add(sprite);

    return sprite;
  }

  /** Add temporary marker for first point */
  _addTempMarker(point) {
    const geom = new THREE.SphereGeometry(0.08, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, depthTest: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(point);
    mesh.renderOrder = 1000;
    mesh.userData._temp = 'marker';
    this.viewer.scene.add(mesh);
    this.tempObjects.push(mesh);
  }

  /** Remove temp preview line only */
  _removeTempLine() {
    this.tempObjects = this.tempObjects.filter(obj => {
      if (obj.userData._temp === 'line') {
        this.viewer.scene.remove(obj);
        obj.geometry?.dispose();
        obj.material?.dispose();
        return false;
      }
      return true;
    });
  }

  /** Clear all temporary objects */
  _clearTemp() {
    for (const obj of this.tempObjects) {
      this.viewer.scene.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    this.tempObjects = [];
  }

  /** Dispose a single measurement */
  _disposeMeasurement(m) {
    const objects = [m.line, m.marker1, m.marker2, m.tick1, m.tick2, m.label];
    for (const obj of objects) {
      if (!obj) continue;
      this.viewer.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  }

  /** Remove all measurements */
  clearAll() {
    for (const m of this.measurements) {
      this._disposeMeasurement(m);
    }
    this.measurements = [];
    this._clearTemp();
    this.firstPoint = null;
  }

  /** Get count */
  get count() {
    return this.measurements.length;
  }
}
