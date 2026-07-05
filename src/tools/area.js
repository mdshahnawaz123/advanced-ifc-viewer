import * as THREE from 'three';

/**
 * Area Tool — click multiple points to define a closed polygon.
 * Calculates surface area of the polygon.
 */
export class AreaTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.enabled = false;
    this.areas = [];          // completed areas
    this.points = [];         // current drawing points
    this.tempObjects = [];    // temp lines and markers
    this.snapMarker = null;

    this._handleClick = this._handleClick.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

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
    this.points = [];
    
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

  _getSnappedPoint(intersect) {
    const point = intersect.point.clone();
    const mesh = intersect.object;
    const geom = mesh.geometry;
    
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
    
    const SNAP_TOLERANCE = 0.3;

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

  _handleClick(event) {
    if (!this.enabled) return;
    const is2D = window.App && window.App.currentViewMode === '2d';
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    if (!activeViewer || !activeViewer.renderer) return;
    if (event.target !== activeViewer.renderer.domElement) return;

    let point;
    if (is2D) {
      if (typeof activeViewer.getWorldPositionByMousePick === 'function') {
        const wp = activeViewer.getWorldPositionByMousePick(event);
        if (wp) point = wp;
      }
      if (!point) {
        const rect = activeViewer.renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const pos = new THREE.Vector3(x, y, 0.5);
        pos.unproject(activeViewer.camera);
        point = new THREE.Vector3(pos.x, pos.y, 0);
      }
    } else {
      const meshes = this.viewer.getModelMeshes();
      const intersects = this.viewer.raycast(event, meshes);
      if (intersects.length === 0) return;
      point = this._getSnappedPoint(intersects[0]).point;
    }

    const scene = is2D ? activeViewer.scene : this.viewer.scene;

    // Check if clicked near the start point to close the loop
    if (this.points.length >= 3 && point.distanceTo(this.points[0]) < 0.4) {
      this._createArea(this.points, scene);
      this._clearTemp();
      this.points = [];
      if (this.snapMarker) this.snapMarker.visible = false;
      return;
    }

    this.points.push(point);
    this._addTempMarker(point, scene);

    if (this.points.length > 1) {
      const p1 = this.points[this.points.length - 2];
      const p2 = this.points[this.points.length - 1];
      this._addTempLine(p1, p2, scene);
    }
  }

  _handleMouseMove(event) {
    if (!this.enabled) return;

    const is2D = window.App && window.App.currentViewMode === '2d';
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    if (!activeViewer || !activeViewer.renderer) return;

    let point, snapType = 'none';

    if (is2D) {
      if (typeof activeViewer.getWorldPositionByMousePick === 'function') {
        const wp = activeViewer.getWorldPositionByMousePick(event);
        if (wp) point = wp;
      }
      if (!point) {
        const rect = activeViewer.renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const pos = new THREE.Vector3(x, y, 0.5);
        pos.unproject(activeViewer.camera);
        point = new THREE.Vector3(pos.x, pos.y, 0);
      }
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

    if (!this.snapMarker) {
      const geom = new THREE.SphereGeometry(is2D ? 2 : 0.08, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false, transparent: true, opacity: 0.8 });
      this.snapMarker = new THREE.Mesh(geom, mat);
      this.snapMarker.renderOrder = 1000;
      scene.add(this.snapMarker);
    }
    
    if (this.points.length >= 3 && point.distanceTo(this.points[0]) < (is2D ? 2.0 : 0.4)) {
      this.snapMarker.position.copy(this.points[0]);
      this.snapMarker.material.color.setHex(0xff0000);
      this.snapMarker.visible = true;
    } else {
      this.snapMarker.position.copy(point);
      this.snapMarker.material.color.setHex(snapType === 'midpoint' ? 0x00ffff : 0xffaa00);
      this.snapMarker.visible = snapType !== 'none' || is2D;
    }

    if (this.points.length > 0) {
      this._removeTempPreviewLine();
      const lastPoint = this.points[this.points.length - 1];
      const geom = new THREE.BufferGeometry().setFromPoints([lastPoint, point]);
      const mat = new THREE.LineDashedMaterial({
        color: 0x00ffff,
        dashSize: is2D ? 10 : 0.15,
        gapSize: is2D ? 5 : 0.08
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      line.userData._temp = 'previewLine';
      line.renderOrder = 999;
      scene.add(line);
      this.tempObjects.push(line);
    }
  }

  _handleKeyDown(event) {
    if (event.key === 'Escape') {
      this._clearTemp();
      this.points = [];
      if (this.snapMarker) this.snapMarker.visible = false;
    } else if (event.key === 'Enter' && this.points.length >= 3) {
      this._createArea(this.points);
      this._clearTemp();
      this.points = [];
      if (this.snapMarker) this.snapMarker.visible = false;
    }
  }

  _createArea(points, scene = this.viewer.scene) {
    if (points.length < 3) return;

    const group = new THREE.Group();

    const pointsClosed = [...points, points[0]];
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pointsClosed);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2, depthTest: false });
    const outline = new THREE.Line(lineGeom, lineMat);
    outline.renderOrder = 999;
    group.add(outline);

    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].y);
    }
    const shapeGeom = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({ 
      color: 0x00ffff, 
      transparent: true, 
      opacity: 0.2, 
      side: THREE.DoubleSide,
      depthTest: false
    });
    const fillMesh = new THREE.Mesh(shapeGeom, fillMat);
    
    fillMesh.position.z = points[0].z;
    fillMesh.renderOrder = 998;
    group.add(fillMesh);

    for (const p of points) {
      const geom = new THREE.SphereGeometry(0.05, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false });
      const marker = new THREE.Mesh(geom, mat);
      marker.position.copy(p);
      marker.renderOrder = 1000;
      group.add(marker);
    }

    const area = this._calculateArea(points);
    const is2D = window.App && window.App.currentViewMode === '2d';

    const centroid = this._calculateCentroid(points);
    const label = this._createLabelSprite(area, is2D);
    label.position.copy(centroid);
    label.renderOrder = 1001;
    group.add(label);

    scene.add(group);

    const measurement = { id: Date.now().toString(), points: [...points], area, group };
    this.measurements.push(measurement);
  }

  _calculateArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  _calculateCentroid(points) {
    let x = 0, y = 0, z = 0;
    for (const p of points) {
      x += p.x; y += p.y; z += p.z;
    }
    return new THREE.Vector3(x / points.length, y / points.length, z / points.length);
  }

  _createLabelSprite(area, is2D = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 64, 8);
    ctx.fill();

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 64, 8);
    ctx.stroke();

    ctx.font = 'bold 28px "Segoe UI", Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${area.toFixed(2)} m²`, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: !is2D
    });
    const sprite = new THREE.Sprite(spriteMat);
    if (is2D) {
      sprite.scale.set(48, 48, 1);
    } else {
      sprite.position.y += 0.25;
      sprite.scale.set(2.4, 0.54, 1);
    }
    sprite.renderOrder = 1001;

    return sprite;
  }

  _addTempMarker(point, scene = this.viewer.scene) {
    const geom = new THREE.SphereGeometry(0.06, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false });
    const marker = new THREE.Mesh(geom, mat);
    marker.position.copy(point);
    marker.userData._temp = 'marker';
    marker.renderOrder = 1000;
    scene.add(marker);
    this.tempObjects.push(marker);
  }

  _addTempLine(p1, p2, scene = this.viewer.scene) {
    const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2, depthTest: false });
    const line = new THREE.Line(geom, mat);
    line.userData._temp = 'line';
    line.renderOrder = 999;
    scene.add(line);
    this.tempObjects.push(line);
  }

  _removeTempPreviewLine() {
    this.tempObjects = this.tempObjects.filter(obj => {
      if (obj.userData._tempPreview) {
        this.viewer.scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
        return false;
      }
      return true;
    });
  }

  _clearTemp() {
    for (const obj of this.tempObjects) {
      this.viewer.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
    this.tempObjects = [];
  }

  _createArea(points) {
    // Calculate area using Stoke's theorem (cross products)
    const normal = new THREE.Vector3();
    let centroid = new THREE.Vector3();
    
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const cross = new THREE.Vector3().crossVectors(p1, p2);
      normal.add(cross);
      centroid.add(p1);
    }
    
    const area = normal.length() * 0.5;
    centroid.divideScalar(points.length);

    // Create Polygon Mesh
    const geom = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      vertices.push(centroid.x, centroid.y, centroid.z);
      vertices.push(p1.x, p1.y, p1.z);
      vertices.push(p2.x, p2.y, p2.z);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const mat = new THREE.MeshBasicMaterial({ 
      color: 0x00d4ff, 
      transparent: true, 
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 995;
    this.viewer.scene.add(mesh);

    // Create Boundary Line
    const pts = [...points, points[0]];
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00d4ff, depthTest: false, linewidth: 2 });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 996;
    this.viewer.scene.add(line);

    // Create Label
    const label = this._createLabel(area, centroid);

    this.areas.push({ mesh, line, label, points: [...points], area });
  }

  _createLabel(area, position) {
    const div = document.createElement('div');
    div.className = 'measurement-label';
    div.textContent = area.toFixed(2) + ' m²';
    div.style.position = 'absolute';
    div.style.background = 'rgba(0, 0, 0, 0.7)';
    div.style.color = '#fff';
    div.style.padding = '4px 8px';
    div.style.borderRadius = '4px';
    div.style.fontSize = '12px';
    div.style.pointerEvents = 'none';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.zIndex = '10';
    this.viewer.container.appendChild(div);

    const updatePosition = () => {
      const vec = position.clone();
      vec.project(this.viewer.camera);
      const x = (vec.x * 0.5 + 0.5) * this.viewer.container.clientWidth;
      const y = (vec.y * -0.5 + 0.5) * this.viewer.container.clientHeight;
      div.style.left = `${x}px`;
      div.style.top = `${y}px`;
      
      if (vec.z > 1.0 || vec.z < -1.0) div.style.display = 'none';
      else div.style.display = 'block';
    };

    this.viewer.onRender(updatePosition);
    updatePosition();
    return div;
  }

  clearAll() {
    this._clearTemp();
    for (const a of this.areas) {
      if (a.mesh) {
        this.viewer.scene.remove(a.mesh);
        if (a.mesh.geometry) a.mesh.geometry.dispose();
        if (a.mesh.material) a.mesh.material.dispose();
      }
      if (a.line) {
        this.viewer.scene.remove(a.line);
        if (a.line.geometry) a.line.geometry.dispose();
        if (a.line.material) a.line.material.dispose();
      }
      if (a.label && a.label.parentNode) {
        a.label.parentNode.removeChild(a.label);
      }
    }
    this.areas = [];
    this.points = [];
  }
}
