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

    if (window.App && window.App.viewer2d && window.App.viewer2d.viewer && window.App.viewer2d.viewer.renderer) {
      const el2d = window.App.viewer2d.viewer.renderer.domElement;
      el2d.addEventListener('click', this._handleClick);
      el2d.addEventListener('mousemove', this._handleMouseMove);
      el2d.style.cursor = 'crosshair';
    }
  }

  /** Disable measurement mode */
  disable() {
    this.enabled = false;
    const el = this.viewer.renderer.domElement;
    el.removeEventListener('click', this._handleClick);
    el.removeEventListener('mousemove', this._handleMouseMove);
    window.removeEventListener('keydown', this._handleKeyDown);
    el.style.cursor = '';

    if (window.App && window.App.viewer2d && window.App.viewer2d.viewer && window.App.viewer2d.viewer.renderer) {
      const el2d = window.App.viewer2d.viewer.renderer.domElement;
      el2d.removeEventListener('click', this._handleClick);
      el2d.removeEventListener('mousemove', this._handleMouseMove);
      el2d.style.cursor = '';
    }

    this._clearTemp();
    this.firstPoint = null;
    
    if (this.snapMarker) {
      if (this.snapMarker.parent) {
        this.snapMarker.parent.remove(this.snapMarker);
      } else {
        this.viewer.scene.remove(this.snapMarker);
      }
      this.snapMarker.material.dispose();
      this.snapMarker.geometry.dispose();
      this.snapMarker = null;
    }
  }

  /** Handle clicks — first click sets start, second creates measurement */
  _handleClick(event) {
    if (!this.enabled) return;

    const is2D = window.App && window.App.currentViewMode === '2d';
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    if (!activeViewer || !activeViewer.renderer) return;
    if (event.target !== activeViewer.renderer.domElement) return;

    let point;
    if (is2D) {
      const rect = activeViewer.renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const pos = new THREE.Vector3(x, y, 0.5);
      pos.unproject(activeViewer.camera);
      point = new THREE.Vector3(pos.x, pos.y, 0);
    } else {
      const meshes = this.viewer.getModelMeshes();
      const intersects = this.viewer.raycast(event, meshes);
      if (intersects.length === 0) return;
      point = this._getSnappedPoint(intersects[0]).point;
    }

    if (!this.firstPoint) {
      // First point
      this.firstPoint = point;
      this._addTempMarker(point, is2D ? activeViewer.scene : this.viewer.scene);
    } else {
      // Second point — create measurement
      this._createMeasurement(this.firstPoint, point, is2D ? activeViewer.scene : this.viewer.scene);
      this._clearTemp();
      this.firstPoint = null;
      if (this.snapMarker) this.snapMarker.visible = false;
    }
  }

  /** Show dashed preview line from first point to cursor */
  _handleMouseMove(event) {
    if (!this.enabled) return;

    const is2D = window.App && window.App.currentViewMode === '2d';
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    if (!activeViewer || !activeViewer.renderer) return;

    let point, snapType = 'none';

    if (is2D) {
      const rect = activeViewer.renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const pos = new THREE.Vector3(x, y, 0.5);
      pos.unproject(activeViewer.camera);
      point = new THREE.Vector3(pos.x, pos.y, 0);
    } else {
      const meshes = this.viewer.getModelMeshes();
      const intersects = this.viewer.raycast(event, meshes);
      if (intersects.length === 0) {
        if (this.snapMarker) this.snapMarker.visible = false;
        return;
      }
      const snapInfo = this._getSnappedPoint(intersects[0]);
      point = snapInfo.point;
      snapType = snapInfo.type;
    }

    const scene = is2D ? activeViewer.scene : this.viewer.scene;

    // Manage snap marker
    if (!this.snapMarker) {
      const geom = new THREE.SphereGeometry(is2D ? 2 : 0.08, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false, transparent: true, opacity: 0.8 });
      this.snapMarker = new THREE.Mesh(geom, mat);
      this.snapMarker.renderOrder = 1000;
      scene.add(this.snapMarker);
    }
    this.snapMarker.position.copy(point);
    this.snapMarker.material.color.setHex(snapType === 'midpoint' ? 0x00ffff : 0xffaa00);
    this.snapMarker.visible = snapType !== 'none' || is2D; // Always show cursor in 2D

    // Draw dashed preview if we have a first point
    if (this.firstPoint) {
      this._removeTempLine();
      const geom = new THREE.BufferGeometry().setFromPoints([this.firstPoint, point]);
      const mat = new THREE.LineDashedMaterial({
        color: 0x00ff88,
        dashSize: is2D ? 10 : 0.15,
        gapSize: is2D ? 5 : 0.08
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      line.userData._temp = 'line';
      line.renderOrder = 999;
      scene.add(line);
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

  _createMeasurement(p1, p2, scene = this.viewer.scene) {
    const distance = p1.distanceTo(p2);
    if (distance < 0.001) return;

    const group = new THREE.Group();

    // Solid line
    const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2, depthTest: false });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 999;
    group.add(line);

    // End points
    const sphereGeom = new THREE.SphereGeometry(0.05, 16, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false });
    const s1 = new THREE.Mesh(sphereGeom, sphereMat);
    s1.position.copy(p1);
    s1.renderOrder = 1000;
    group.add(s1);

    const s2 = new THREE.Mesh(sphereGeom, sphereMat);
    s2.position.copy(p2);
    s2.renderOrder = 1000;
    group.add(s2);

    // Dynamic text label
    const midPoint = new THREE.Vector3().lerpVectors(p1, p2, 0.5);
    const label = this._createLabelSprite(distance);
    label.position.copy(midPoint);
    label.renderOrder = 1001;
    group.add(label);

    scene.add(group);

    const measurement = { id: Date.now().toString(), p1, p2, distance, group };
    this.measurements.push(measurement);
    
    if (this.onMeasurementAdded) this.onMeasurementAdded(measurement);
  }

  _createLabelSprite(distance) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.roundRect(0, 0, 256, 64, 8);
    ctx.fill();

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 28px "Segoe UI", Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${distance.toFixed(2)} m`, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y += 0.25;
    sprite.scale.set(2.4, 0.54, 1);
    sprite.renderOrder = 1001;

    return sprite;
  }

  /** Add temporary marker for first point */
  _addTempMarker(point, scene = this.viewer.scene) {
    const geom = new THREE.SphereGeometry(0.06, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, depthTest: false });
    const marker = new THREE.Mesh(geom, mat);
    marker.position.copy(point);
    marker.userData._temp = 'marker';
    marker.renderOrder = 1000;
    scene.add(marker);
    this.tempObjects.push(marker);
  }

  /** Remove temp preview line only */
  _removeTempLine() {
    this.tempObjects = this.tempObjects.filter(obj => {
      if (obj.userData._temp === 'line') {
        if (obj.parent) obj.parent.remove(obj);
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
      if (obj.parent) obj.parent.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    this.tempObjects = [];
  }

  /** Dispose a single measurement */
  _disposeMeasurement(m) {
    if (m.group && m.group.parent) {
      m.group.parent.remove(m.group);
    }
    const objects = [m.line, m.marker1, m.marker2, m.tick1, m.tick2, m.label];
    for (const obj of objects) {
      if (!obj) continue;
      if (obj.parent) obj.parent.remove(obj);
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
