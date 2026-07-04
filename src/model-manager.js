/**
 * Multi-model manager — load, unload, and toggle multiple IFC models.
 */
export class ModelManager {
  constructor(viewer) {
    this.viewer = viewer;
    this.models = new Map();
    this._nextId = 1;

    /** Callbacks */
    this.onModelAdded = null;
    this.onModelRemoved = null;
    this.onModelsChanged = null;
  }

  /** Register a model group in the scene */
  addModel(name, group, modelID) {
    const id = this._nextId++;
    const color = ModelManager.PALETTE[(id - 1) % ModelManager.PALETTE.length];

    const model = {
      id,
      name,
      group,
      modelID,
      visible: true,
      color,
      meshCount: group.userData.meshCount || group.children.length
    };

    this.models.set(id, model);
    this.viewer.scene.add(group);
    this.viewer.fitToView(group);

    this._notify('add', model);
    return model;
  }

  /** Remove a model from the scene and dispose resources */
  removeModel(id) {
    const model = this.models.get(id);
    if (!model) return;

    this.viewer.scene.remove(model.group);

    // Dispose geometry and materials
    model.group.traverse(child => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });

    this.models.delete(id);
    this._notify('remove', model);
  }

  /** Toggle a model's visibility */
  toggleVisibility(id) {
    const model = this.models.get(id);
    if (!model) return;
    model.visible = !model.visible;
    model.group.visible = model.visible;
    this._notify('change', model);
  }

  /** Get all models as array */
  getModels() {
    return Array.from(this.models.values());
  }

  /** Get all visible meshes across all models */
  getAllMeshes() {
    const meshes = [];
    for (const model of this.models.values()) {
      if (!model.visible) continue;
      model.group.traverse(child => {
        if (child.isMesh) meshes.push(child);
      });
    }
    return meshes;
  }

  /** Remove all models */
  clear() {
    const ids = [...this.models.keys()];
    for (const id of ids) {
      this.removeModel(id);
    }
  }

  /** Get count of loaded models */
  get count() {
    return this.models.size;
  }

  /* ---- Internal ---- */
  _notify(type, model) {
    if (type === 'add' && this.onModelAdded) this.onModelAdded(model);
    if (type === 'remove' && this.onModelRemoved) this.onModelRemoved(model);
    if (this.onModelsChanged) this.onModelsChanged(this.getModels());
  }

  /** Color palette for model indicators */
  static PALETTE = [
    '#4fc3f7', // light blue
    '#81c784', // green
    '#ffb74d', // orange
    '#f06292', // pink
    '#ba68c8', // purple
    '#4dd0e1', // teal
    '#aed581', // lime
    '#ff8a65', // deep orange
    '#9575cd', // deep purple
    '#e0e0e0', // grey
  ];
}
