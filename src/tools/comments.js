import * as THREE from 'three';

/**
 * Comment / Annotation tool — Navisworks-style comments with snap-to-surface.
 * Click on model → type comment → pin is placed with saved viewpoint.
 * Navigate back to any comment's viewpoint by clicking it in the list.
 */
export class CommentTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.enabled = false;
    this.comments = [];
    this._nextId = 1;
    this.pendingPoint = null;
    this.pendingNormal = null;

    /** Callbacks */
    this.onCommentAdded = null;
    this.onCommentRemoved = null;
    this.onCommentsChanged = null;

    this._handleClick = this._handleClick.bind(this);
  }

  /** Enable comment placement mode */
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

  /** Disable comment placement mode */
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

  /** Handle click — snap to surface, prompt for text */
  _handleClick(event) {
    if (!this.enabled) return;
    
    const is2D = window.App && window.App.currentViewMode === '2d';
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    
    if (!activeViewer || !activeViewer.renderer) return;
    if (event.target !== activeViewer.renderer.domElement) return;

    if (is2D) {
      // For 2D viewer, we can raycast against an invisible plane or use camera projection
      const rect = activeViewer.renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      const pos = new THREE.Vector3(x, y, 0.5);
      pos.unproject(activeViewer.camera);
      // In orthographic 2D, unprojecting gives us the exact world coordinate
      this.pendingPoint = new THREE.Vector3(pos.x, pos.y, 0);
      this.pendingNormal = new THREE.Vector3(0, 0, 1);
    } else {
      const meshes = this.viewer.getModelMeshes();
      const intersects = this.viewer.raycast(event, meshes);
      if (intersects.length === 0) return;

      const hit = intersects[0];
      this.pendingPoint = hit.point.clone();
      this.pendingNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    }

    // Show the comment dialog
    this._showDialog();
  }

  /** Show comment input dialog */
  _showDialog() {
    // Trigger the UI to show the sidebar form
    if (this.onShowForm) {
      this.onShowForm();
    }
  }

  /** Update an existing comment */
  updateComment(id, { text, title, assignee, status, type }) {
    const comment = this.comments.find(c => c.id === id);
    if (!comment) return null;

    comment.text = text ? text.trim() : '';
    comment.title = title ? title.trim() : '';
    comment.assignee = assignee ? assignee.trim() : '';
    comment.status = status || 'open';
    comment.type = type || 'clash';

    if (this.onCommentsChanged) this.onCommentsChanged(this.comments);
    return comment;
  }

  /** Called when user confirms comment from dialog */
  saveComment({ text, title, assignee, status, type }) {
    if (!this.pendingPoint) return null;

    const id = this._nextId++;
    const comment = {
      id,
      text: text ? text.trim() : '',
      title: title ? title.trim() : '',
      assignee: assignee ? assignee.trim() : '',
      status: status || 'open',
      type: type || 'clash',
      point: this.pendingPoint.clone(),
      normal: this.pendingNormal ? this.pendingNormal.clone() : new THREE.Vector3(0, 1, 0),
      viewpoint: {
        position: this.viewer.camera.position.clone(),
        target: this.viewer.controls.target.clone(),
        up: this.viewer.camera.up.clone()
      },
      timestamp: new Date(),
      imageURL: this.viewer.captureScreenshot(),
      pin: null
    };

    // Create 3D visuals
    this._createPin(comment);
    this.comments.push(comment);

    this.pendingPoint = null;
    this.pendingNormal = null;

    if (this.onCommentAdded) this.onCommentAdded(comment);
    if (this.onCommentsChanged) this.onCommentsChanged(this.comments);

    return comment;
  }

  /** Cancel pending comment */
  cancelComment() {
    this.pendingPoint = null;
    this.pendingNormal = null;
  }

  /** Navigate camera to a comment's saved viewpoint */
  navigateToComment(id) {
    const comment = this.comments.find(c => c.id === id);
    if (!comment) return;

    const { position, target, up } = comment.viewpoint;
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
    this._pulsePin(comment);
  }

  /** Remove a single comment */
  removeComment(id) {
    const index = this.comments.findIndex(c => c.id === id);
    if (index < 0) return;

    const comment = this.comments[index];
    this._disposeVisuals(comment);
    this.comments.splice(index, 1);

    if (this.onCommentRemoved) this.onCommentRemoved(comment);
    if (this.onCommentsChanged) this.onCommentsChanged(this.comments);
  }

  /** Remove all comments */
  clearAll() {
    for (const comment of this.comments) {
      this._disposeVisuals(comment);
    }
    this.comments = [];
    if (this.onCommentsChanged) this.onCommentsChanged(this.comments);
  }

  /**
   * Toggle visibility of all 3D pushpins
   */
  toggleVisibility(visible) {
    this.comments.forEach(c => {
      if (c.pin) c.pin.visible = visible;
    });
  }

  /** Get count */
  get count() {
    return this.comments.length;
  }

  /* ============================================
     3D Visuals — Pin
     ============================================ */

  _createPin(comment) {
    const group = new THREE.Group();
    // Offset slightly along normal to avoid z-fighting
    const offsetPoint = comment.point.clone().add(comment.normal.clone().multiplyScalar(0.05));
    group.position.copy(offsetPoint);

    // Make the pin always face the camera
    const badgeCanvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = 128;
    badgeCanvas.width = size * dpr;
    badgeCanvas.height = size * dpr;
    const ctx = badgeCanvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Navisworks style pin: colored circle with white border
    const radius = 48;
    const center = size / 2;

    let pinColor = '#f39c12'; // default orange (open)
    if (comment.status === 'answered') pinColor = '#2980b9'; // blue
    if (comment.status === 'closed') pinColor = '#7f8c8d'; // grey

    // Draw drop shadow
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = pinColor;
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Inner color
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = pinColor;
    ctx.fill();

    // White border
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();

    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    badgeTexture.minFilter = THREE.LinearFilter;
    const badgeMat = new THREE.SpriteMaterial({ map: badgeTexture, depthTest: false, sizeAttenuation: true });
    const badge = new THREE.Sprite(badgeMat);
    badge.scale.set(0.8, 0.8, 1);
    badge.renderOrder = 1002;
    group.add(badge);

    // Shift sprite up so pin line connects
    badge.position.y = 0.3;
    group.renderOrder = 1001;

    const is2D = window.App && window.App.currentViewMode === '2d';
    const activeViewer = is2D ? window.App.viewer2d.viewer : this.viewer;
    
    if (activeViewer && activeViewer.scene) {
      activeViewer.scene.add(group);
    }
    
    comment.pin = group;
  }

  _pulsePin(comment) {
    if (!comment.pin) return;
    const badge = comment.pin.children[0];
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

  _disposeVisuals(comment) {
    if (comment.pin) {
      this.viewer.scene.remove(comment.pin);
      comment.pin.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      comment.pin = null;
    }
  }
}
