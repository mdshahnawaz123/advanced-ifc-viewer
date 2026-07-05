import * as THREE from 'three';

/**
 * 2D Drawing tool — Places a 2D drawing pin on the model.
 * Click on model → type drawing details → pin is placed with saved viewpoint.
 */
export class DrawingTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.enabled = false;
    this.drawings = [];
    this._nextId = 1;
    this.pendingPoint = null;
    this.pendingNormal = null;

    /** Callbacks */
    this.onDrawingAdded = null;
    this.onDrawingRemoved = null;
    this.onDrawingsChanged = null;

    this._handleClick = this._handleClick.bind(this);
  }

  /** Enable drawing placement mode */
  enable() {
    this.enabled = true;
    this.viewer.renderer.domElement.addEventListener('click', this._handleClick);
    this.viewer.renderer.domElement.style.cursor = 'crosshair';
    
    // Support 2D Viewer
    if (window.App && window.App.viewer2d && window.App.viewer2d.viewer && window.App.viewer2d.viewer.renderer) {
      window.App.viewer2d.viewer.renderer.domElement.addEventListener('click', this._handleClick);
      window.App.viewer2d.viewer.renderer.domElement.style.cursor = 'crosshair';
    }
  }

  /** Disable drawing placement mode */
  disable() {
    this.enabled = false;
    this.viewer.renderer.domElement.removeEventListener('click', this._handleClick);
    this.viewer.renderer.domElement.style.cursor = '';
    
    if (window.App && window.App.viewer2d && window.App.viewer2d.viewer && window.App.viewer2d.viewer.renderer) {
      window.App.viewer2d.viewer.renderer.domElement.removeEventListener('click', this._handleClick);
      window.App.viewer2d.viewer.renderer.domElement.style.cursor = '';
    }
    
    this.pendingPoint = null;
    this.pendingNormal = null;
  }

  /** Handle click — snap to surface, prompt for form */
  _handleClick(event) {
    if (!this.enabled) return;
    
    const is2D = window.App && window.App.currentViewMode === '2d';
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    
    if (!activeViewer || !activeViewer.renderer) return;
    if (event.target !== activeViewer.renderer.domElement) return;

    if (is2D) {
      if (typeof activeViewer.getWorldPositionByMousePick === 'function') {
        const wp = activeViewer.getWorldPositionByMousePick(event);
        if (wp) {
          this.pendingPoint = wp;
          this.pendingNormal = new THREE.Vector3(0, 0, 1);
          this.onShowForm();
          return;
        }
      }
      // Fallback
      const rect = activeViewer.renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const pos = new THREE.Vector3(x, y, 0.5);
      pos.unproject(activeViewer.camera);
      
      this.pendingPoint = new THREE.Vector3(pos.x, pos.y, 0);
      this.pendingNormal = new THREE.Vector3(0, 0, 1);
      this.onShowForm();
    } else {
      const meshes = this.viewer.getModelMeshes();
      const intersects = this.viewer.raycast(event, meshes);
      if (intersects.length === 0) return;

      const hit = intersects[0];
      this.pendingPoint = hit.point.clone();
      this.pendingNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    }

    // Show the drawing dialog
    this._showDialog();
  }

  /** Show drawing input dialog */
  _showDialog() {
    if (this.onShowForm) {
      this.onShowForm();
    }
  }

  /** Update an existing drawing */
  updateDrawing(id, { number, sheetName, revision, description, discipline }) {
    const drawing = this.drawings.find(d => d.id === id);
    if (!drawing) return null;

    drawing.number = number ? number.trim() : '';
    drawing.sheetName = sheetName ? sheetName.trim() : '';
    drawing.revision = revision ? revision.trim() : '';
    drawing.description = description ? description.trim() : '';
    drawing.discipline = discipline || 'arch';

    if (this.onDrawingsChanged) this.onDrawingsChanged(this.drawings);
    return drawing;
  }

  /** Called when user confirms drawing from dialog */
  saveDrawing({ number, sheetName, revision, description, discipline }) {
    if (!this.pendingPoint) return null;

    const id = this._nextId++;
    const drawing = {
      id,
      number: number ? number.trim() : '',
      sheetName: sheetName ? sheetName.trim() : '',
      revision: revision ? revision.trim() : '',
      description: description ? description.trim() : '',
      discipline: discipline || 'arch',
      point: this.pendingPoint.clone(),
      normal: this.pendingNormal ? this.pendingNormal.clone() : new THREE.Vector3(0, 1, 0),
      viewpoint: {
        position: this.viewer.camera.position.clone(),
        target: this.viewer.controls.target.clone(),
        up: this.viewer.camera.up.clone()
      },
      timestamp: new Date(),
      pin: null
    };

    // Create 3D visuals
    this._createPin(drawing);
    this.drawings.push(drawing);

    this.pendingPoint = null;
    this.pendingNormal = null;

    if (this.onDrawingAdded) this.onDrawingAdded(drawing);
    if (this.onDrawingsChanged) this.onDrawingsChanged(this.drawings);

    return drawing;
  }

  /** Cancel pending drawing */
  cancelDrawing() {
    this.pendingPoint = null;
    this.pendingNormal = null;
  }

  /** Navigate camera to a drawing's saved viewpoint */
  navigateToDrawing(id) {
    const drawing = this.drawings.find(d => d.id === id);
    if (!drawing) return;

    const { position, target, up } = drawing.viewpoint;
    const startPos = this.viewer.camera.position.clone();
    const startTarget = this.viewer.controls.target.clone();
    const startUp = this.viewer.camera.up.clone();
    const startTime = performance.now();
    const duration = 700;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      this.viewer.camera.position.lerpVectors(startPos, position, e);
      this.viewer.controls.target.lerpVectors(startTarget, target, e);
      this.viewer.camera.up.lerpVectors(startUp, up, e).normalize();
      this.viewer.controls.update();

      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    // Highlight the pin briefly
    this._pulsePin(drawing);
  }

  /** Remove a single drawing */
  removeDrawing(id) {
    const index = this.drawings.findIndex(d => d.id === id);
    if (index < 0) return;

    const drawing = this.drawings[index];
    this._disposeVisuals(drawing);
    this.drawings.splice(index, 1);

    if (this.onDrawingRemoved) this.onDrawingRemoved(drawing);
    if (this.onDrawingsChanged) this.onDrawingsChanged(this.drawings);
  }

  /** Remove all drawings */
  clearAll() {
    for (const drawing of this.drawings) {
      this._disposeVisuals(drawing);
    }
    this.drawings = [];
    if (this.onDrawingsChanged) this.onDrawingsChanged(this.drawings);
  }

  /** Toggle visibility of all 3D pushpins */
  toggleVisibility(visible) {
    this.drawings.forEach(d => {
      if (d.pin) d.pin.visible = visible;
    });
  }

  /** Get count */
  get count() {
    return this.drawings.length;
  }

  /* ============================================
     3D Visuals — Pin
     ============================================ */

  _createPin(drawing) {
    const group = new THREE.Group();
    // Offset slightly along normal to avoid z-fighting
    const offsetPoint = drawing.point.clone().add(drawing.normal.clone().multiplyScalar(0.05));
    group.position.copy(offsetPoint);

    // Make the pin always face the camera
    const badgeCanvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = 128;
    badgeCanvas.width = size * dpr;
    badgeCanvas.height = size * dpr;
    const ctx = badgeCanvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Pin shape: a blue square representing a document/drawing
    const width = 80;
    const height = 96;
    const x = (size - width) / 2;
    const y = (size - height) / 2;

    const pinColor = '#2563eb'; // Blue for drawing

    // Draw drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = pinColor;
    ctx.fillRect(x, y, width, height);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Inner color
    ctx.fillStyle = pinColor;
    ctx.fillRect(x, y, width, height);

    // White border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(x, y, width, height);

    // "2D" Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2D', size / 2, size / 2);

    const is2D = window.App && window.App.currentViewMode === '2d';

    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    badgeTexture.minFilter = THREE.LinearFilter;
    const badgeMat = new THREE.SpriteMaterial({ 
      map: badgeTexture, 
      depthTest: false, 
      sizeAttenuation: !is2D 
    });
    const badge = new THREE.Sprite(badgeMat);
    if (is2D) {
      badge.scale.set(48, 48, 1);
    } else {
      badge.scale.set(0.8, 0.8, 1);
    }
    badge.renderOrder = 1002;
    group.add(badge);

    // Shift sprite up so pin line connects
    badge.position.y = is2D ? 0 : 0.3;
    group.renderOrder = 1001;
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    
    if (activeViewer && activeViewer.scene) {
      activeViewer.scene.add(group);
    }
    
    drawing.pin = group;
  }

  _pulsePin(drawing) {
    if (!drawing.pin) return;
    const badge = drawing.pin.children[0];
    if (!badge || !badge.isSprite) return;

    const originalScale = 0.8;
    const pulseScale = 1.2;
    const startTime = performance.now();
    const duration = 600;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const scale = originalScale + (pulseScale - originalScale) * Math.sin(t * Math.PI);
      badge.scale.set(scale, scale, 1);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  _disposeVisuals(drawing) {
    if (drawing.pin) {
      this.viewer.scene.remove(drawing.pin);
      drawing.pin.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      drawing.pin = null;
    }
  }
}
