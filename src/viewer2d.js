import { Viewer2d } from '@x-viewer/core';

export class Viewer2DWrapper {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    // Initialize the @x-viewer/core 2D Viewer
    this.viewer = new Viewer2d({
      containerId: containerId,
      enableSpinner: true,
      enableLayoutBar: true,
    });
    
    this.isLoaded = false;
  }

  /**
   * Load a DWG, DXF, or PDF file into the 2D viewer.
   * @param {File} file 
   */
  async loadModel(file) {
    return new Promise((resolve, reject) => {
        // Append #filename to the blob URL so x-viewer can infer the file extension
        const fileUrl = URL.createObjectURL(file) + '#' + file.name;
        const ext = file.name.split('.').pop().toLowerCase();
        
        this.viewer.loadModel({
          modelId: `2d_${Date.now()}`,
          name: file.name,
          src: fileUrl,
          fileFormat: ext,
          format: ext
        }).then(() => {
          this.viewer.goToHomeView();
          this.isLoaded = true;
          resolve();
        }).catch((err) => {
          console.error("Failed to load 2D model:", err);
          reject(err);
        });
    });
  }

  show() {
    this.container.classList.remove('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
  }
}
