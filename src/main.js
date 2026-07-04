/**
 * IFC Viewer — Main Application Entry Point
 *
 * Wires together: Viewer, IFC Loader, Model Manager,
 * Tools (measurement, section, navigation), and UI (toolbar, sidebar, view cube).
 */

import { Viewer } from './viewer.js';
import { loadIFCFile, getElementProperties, summarizeModel } from './ifc-loader.js';
import { ModelManager } from './model-manager.js';
import { MeasurementTool } from './tools/measurement.js';
import { AreaTool } from './tools/area.js';
import { SectionTool } from './tools/section.js';
import { CommentTool } from './tools/comments.js';
import { animateToView, fitAll, getSceneBounds } from './tools/navigation.js';
import { Toolbar } from './ui/toolbar.js';
import { Sidebar } from './ui/sidebar.js';
import { ViewCube } from './ui/view-cube.js';
import { exportIssuesToExcel } from './utils/export.js';
import { AIChatEngine } from './utils/ai-chat.js';

/* ============================================
   Application State
   ============================================ */

let viewer, modelManager, measureTool, areaTool, sectionTool, commentTool, aiChat;
let toolbar, sidebar, viewCube;
let activeTool = 'select';

/* ============================================
   Initialization
   ============================================ */

async function init() {
  // --- Core Viewer ---
  const container = document.getElementById('viewport');
  viewer = new Viewer(container);

  // --- Model Manager ---
  modelManager = new ModelManager(viewer);
  modelManager.onModelsChanged = (models) => {
    sidebar.updateModelList(models);
    updateStatusBar();
  };

  // --- Tools ---
  measureTool = new MeasurementTool(viewer);
  areaTool = new AreaTool(viewer);
  sectionTool = new SectionTool(viewer);
  commentTool = new CommentTool(viewer);

  // --- UI ---
  toolbar = new Toolbar();
  sidebar = new Sidebar();

  // View Cube
  const cubeContainer = document.getElementById('view-cube');
  viewCube = new ViewCube(cubeContainer, viewer.camera, viewer.controls);
  viewer.onRender(() => viewCube.update());

  // --- Wire Up Events ---
  setupToolbar();
  setupSidebar();
  setupViewCube();
  setupDragDrop();
  setupFileInput();
  setupElementSelection();
  setupComments();

  // --- AI Chat ---
  aiChat = new AIChatEngine();
  aiChat.onCommand = handleAICommand;
  setupChat();

  console.log('🏗️ IFC Viewer initialized');
}

function handleAICommand(cmd) {
  if (cmd.command === 'show_all') {
    viewer.showAll();
    return;
  }

  if (cmd.type) {
    const meshes = viewer.getModelMeshes();
    const targets = meshes.filter(m => m.userData.ifcType && m.userData.ifcType.includes(cmd.type));
    
    if (targets.length > 0) {
      if (cmd.command === 'highlight') {
        viewer.highlightMesh(targets);
        viewer.fitToView(targets[0]);
      } else if (cmd.command === 'hide') {
        viewer.hideMeshes(targets);
      } else if (cmd.command === 'isolate') {
        viewer.isolateMeshes(targets);
        viewer.fitToView(targets[0]);
      }
    } else {
      if (cmd.command === 'highlight') viewer.clearHighlight();
    }
  }
}

/* ============================================
   Toolbar Events
   ============================================ */

function setupToolbar() {
  toolbar.onToolChange = (tool) => {
    switchTool(tool);
  };

  toolbar.onAction = (action, param) => {
    switch (action) {
      case 'fit':
        fitAll(viewer.camera, viewer.controls, viewer.scene);
        break;

      case 'view':
        const bounds = getSceneBounds(viewer.scene);
        if (bounds) animateToView(viewer.camera, viewer.controls, param, bounds);
        break;

      case 'addModel':
        triggerFileInput();
        break;

      case 'toggleSidebar':
        sidebar.toggle();
        break;

      case 'clearDimensions':
        measureTool.clearAll();
        break;

      case 'clearSections':
        sectionTool.clearAll();
        break;

      case 'clearComments':
        commentTool.clearAll();
        break;

      case 'clearAll':
        measureTool.clearAll();
        // areaTool.clearAll(); // TODO: implement clearAll in AreaTool if needed
        sectionTool.clearAll();
        commentTool.clearAll();
        viewer.clearHighlight();
        sidebar.showProperties(null);
        break;
    }
  };
}

/* ============================================
   Tool Switching
   ============================================ */

function switchTool(tool) {
  // Deactivate previous tool
  if (activeTool === 'measure') measureTool.disable();
  if (activeTool === 'area') areaTool.disable();
  if (activeTool === 'section') sectionTool.disable();
  if (activeTool === 'comment') commentTool.disable();

  // Activate new tool
  activeTool = tool;
  if (tool === 'measure') measureTool.enable();
  if (tool === 'area') areaTool.enable();
  if (tool === 'section') sectionTool.enable();
  if (tool === 'comment') commentTool.enable();

  updateStatusBar();
}

/* ============================================
   Sidebar Events
   ============================================ */

function setupSidebar() {
  sidebar.onModelAction = (action, modelId) => {
    switch (action) {
      case 'toggle':
        modelManager.toggleVisibility(modelId);
        break;
      case 'remove':
        modelManager.removeModel(modelId);
        break;
    }
  };

  sidebar.onVisibilityAction = (action, payload) => {
    if (action === 'hide' && viewer.highlightedMeshes.length > 0) {
      viewer.hideMeshes(viewer.highlightedMeshes);
      viewer.clearHighlight();
      // Hide properties panel since we hid the element
      const propsContainer = document.getElementById('properties-content');
      if (propsContainer) {
        propsContainer.innerHTML = '<div class="empty-state"><p>Select an element</p></div>';
      }
    } else if (action === 'isolate' && viewer.highlightedMeshes.length > 0) {
      viewer.isolateMeshes(viewer.highlightedMeshes);
    } else if (action === 'show_all') {
      viewer.showAll();
    } else if (action === 'paint' && viewer.highlightedMeshes.length > 0) {
      const hex = parseInt(payload.replace('#', '0x'), 16);
      viewer.overrideColor(viewer.highlightedMeshes, hex);
    }
  };
}

/* ============================================
   Comments Events
   ============================================ */

function setupComments() {
  const formPane = document.getElementById('issue-form-pane');
  const listContainer = document.getElementById('comments-list-container');
  const textarea = document.getElementById('comment-text');
  const saveBtn = document.getElementById('comment-save');
  const cancelBtn = document.getElementById('comment-cancel');

  const titleInput = document.getElementById('issue-title');
  const assigneeInput = document.getElementById('issue-assignee');
  const statusInput = document.getElementById('issue-status');
  const typeInput = document.getElementById('issue-type');

  const createBtn = document.getElementById('btn-create-issue');
  const togglePushpins = document.getElementById('toggle-pushpins');
  const btnExport = document.getElementById('btn-export-issues');
  const exportDialog = document.getElementById('export-dialog');
  const exportCancel = document.getElementById('export-cancel');
  const exportConfirm = document.getElementById('export-confirm');

  // Pushpin toggle
  if (togglePushpins) {
    togglePushpins.addEventListener('change', (e) => {
      commentTool.toggleVisibility(e.target.checked);
    });
  }

  // Export Dialog UI
  if (btnExport && exportDialog) {
    btnExport.addEventListener('click', () => {
      exportDialog.classList.remove('hidden');
    });
    
    exportCancel.addEventListener('click', () => {
      exportDialog.classList.add('hidden');
    });

    exportConfirm.addEventListener('click', async () => {
      const checkboxes = document.querySelectorAll('#export-columns-list input[type="checkbox"]:checked');
      const selectedColumns = Array.from(checkboxes).map(cb => cb.value);
      
      exportConfirm.textContent = 'Exporting...';
      exportConfirm.disabled = true;
      try {
        await exportIssuesToExcel(commentTool.comments, selectedColumns);
        exportDialog.classList.add('hidden');
      } catch (err) {
        console.error('Export failed', err);
        alert('Failed to export issues: ' + err.message);
      } finally {
        exportConfirm.textContent = 'Download .xlsx';
        exportConfirm.disabled = false;
      }
    });
  }

  // Tool callbacks
  commentTool.onCommentsChanged = (comments) => {
    sidebar.updateCommentsList(comments, commentTool);
  };

  commentTool.onShowForm = () => {
    sidebar.show();
    sidebar.switchTab('comments');
    listContainer.classList.add('hidden');
    formPane.classList.remove('hidden');
    titleInput.focus();
  };

  // Allow clicking "Create Issue" without placing a pin (places at camera target)
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      // Switch tool visually
      switchTool('comment');
      toolbar.setActiveTool('comment');
      // Mock a point in the center of view to place a pin
      const mockIntersect = {
        point: viewer.controls.target.clone(),
        face: { normal: new THREE.Vector3(0, 1, 0) }
      };
      commentTool._onPointerDown(new MouseEvent('click')); // will fail gracefully or set focus
      commentTool.pendingPoint = mockIntersect.point;
      commentTool.pendingNormal = mockIntersect.face.normal;
      commentTool.onShowForm();
    });
  }

  // Dialog actions
  saveBtn.addEventListener('click', () => {
    commentTool.saveComment({
      text: textarea.value,
      title: titleInput.value,
      assignee: assigneeInput.value,
      status: statusInput.value,
      type: typeInput.value
    });
    
    // Clear form
    textarea.value = '';
    titleInput.value = '';
    assigneeInput.value = '';
    statusInput.value = 'open';
    typeInput.value = 'clash';

    formPane.classList.add('hidden');
    listContainer.classList.remove('hidden');
    
    // Switch back to select tool after placing a comment
    switchTool('select');
    toolbar.setActiveTool('select');
  });

  cancelBtn.addEventListener('click', () => {
    commentTool.cancelComment();
    formPane.classList.add('hidden');
    listContainer.classList.remove('hidden');
    switchTool('select');
    toolbar.setActiveTool('select');
  });

  // Enter to save (Shift+Enter for newline)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveBtn.click();
    }
  });
}

/* ============================================
   AI Chat UI Events
   ============================================ */

function setupChat() {
  const apiSetup = document.getElementById('chat-api-setup');
  const keyInput = document.getElementById('gemini-api-key');
  const btnSaveKey = document.getElementById('btn-save-api-key');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-chat-send');
  const messagesArea = document.getElementById('chat-messages');

  const checkKey = () => {
    if (aiChat.hasApiKey()) {
      apiSetup.style.display = 'none';
      chatInput.disabled = false;
      btnSend.disabled = false;
    }
  };
  checkKey();

  btnSaveKey.addEventListener('click', () => {
    if (keyInput.value.trim()) {
      aiChat.setApiKey(keyInput.value);
      checkKey();
    }
  });

  const appendMessage = (text, isUser) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${isUser ? 'user' : 'bot'}`;
    msgDiv.style.display = 'flex';
    msgDiv.style.justifyContent = isUser ? 'flex-end' : 'flex-start';

    const bubble = document.createElement('div');
    bubble.className = 'message-content';
    bubble.textContent = text;
    bubble.style.padding = '8px 12px';
    bubble.style.borderRadius = '4px';
    bubble.style.fontSize = '13px';
    bubble.style.color = 'var(--text-primary)';
    bubble.style.maxWidth = '85%';

    if (isUser) {
      bubble.style.background = 'var(--accent-blue)';
      bubble.style.borderBottomRightRadius = '0';
    } else {
      bubble.style.background = 'rgba(255, 107, 0, 0.1)';
      bubble.style.borderLeft = '2px solid var(--accent-orange)';
      bubble.style.borderTopLeftRadius = '0';
      bubble.style.borderBottomLeftRadius = '0';
    }

    msgDiv.appendChild(bubble);
    messagesArea.appendChild(msgDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  };

  const sendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    chatInput.disabled = true;
    btnSend.disabled = true;
    
    appendMessage(text, true);

    try {
      const response = await aiChat.sendMessage(text);
      appendMessage(response, false);
    } catch (err) {
      appendMessage('Error: ' + err.message, false);
      // Unhide setup so user can fix their key if needed
      apiSetup.style.display = 'block';
      aiChat.setApiKey(''); // Clear the bad key from memory
    } finally {
      chatInput.disabled = false;
      btnSend.disabled = false;
      chatInput.focus();
    }
  };

  btnSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

/* ============================================
   Sidebar & Cube Events
   ============================================ */

function setupViewCube() {
  viewCube.onViewSelected = (view) => {
    const bounds = getSceneBounds(viewer.scene);
    if (bounds) animateToView(viewer.camera, viewer.controls, view, bounds);
  };
}

/* ============================================
   Element Selection (click to inspect)
   ============================================ */

function setupElementSelection() {
  viewer.renderer.domElement.addEventListener('click', (event) => {
    if (activeTool !== 'select') return;

    const meshes = viewer.getModelMeshes();
    const intersects = viewer.raycast(event, meshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const expressID = mesh.userData.expressID;
      const modelID = mesh.userData.modelID;

      // Highlight
      viewer.highlightMesh(mesh);

      // Get and display properties
      const props = getElementProperties(modelID, expressID);
      sidebar.showProperties(props);
      sidebar.show();
      aiChat.updateSelectedElement(props);
    } else {
      viewer.clearHighlight();
      sidebar.showProperties(null);
      aiChat.updateSelectedElement(null);
    }
  });
}

/* ============================================
   File Loading
   ============================================ */

function triggerFileInput() {
  const input = document.getElementById('file-input');
  input.click();
}

function setupFileInput() {
  const input = document.getElementById('file-input');
  const openBtn = document.getElementById('btn-open-file');

  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      await loadFile(file);
    }
    input.value = ''; // reset for re-selection
  });

  openBtn.addEventListener('click', () => {
    input.click();
  });
}

async function loadFile(file) {
  if (!file.name.toLowerCase().endsWith('.ifc')) {
    console.warn('Not an IFC file:', file.name);
    return;
  }

  showLoading(file.name);

  try {
    const buffer = await file.arrayBuffer();
    const { group, modelID } = await loadIFCFile(buffer);

    const name = file.name.replace(/\.ifc$/i, '');
    modelManager.addModel(name, group, modelID);

    // Summarize for AI Copilot (async)
    summarizeModel(group).then(summary => {
      aiChat.updateModelContext({
        modelCount: modelManager.count,
        types: summary
      });
      console.log('🤖 AI Context Updated:', summary);
    });

    // Show UI on first model
    hideWelcome();
    toolbar.show();
    showStatusBar();
    sidebar.show();

    console.log(`✅ Loaded: ${file.name}`);
  } catch (err) {
    console.error('Failed to load IFC file:', err);
    alert(`Failed to load ${file.name}.\n\nError: ${err.message}`);
  } finally {
    hideLoading();
  }
}

/* ============================================
   Drag & Drop
   ============================================ */

function setupDragDrop() {
  const app = document.getElementById('app');
  const overlay = document.getElementById('drag-overlay');
  let dragCounter = 0;

  app.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.remove('hidden');
  });

  app.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.add('hidden');
    }
  });

  app.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  app.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.add('hidden');

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await loadFile(file);
    }
  });
}

/* ============================================
   UI State Helpers
   ============================================ */

function showLoading(filename) {
  const overlay = document.getElementById('loading-overlay');
  const filenameEl = document.getElementById('loading-filename');
  if (filenameEl) filenameEl.textContent = filename;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function hideWelcome() {
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.classList.add('hidden');
}

function showStatusBar() {
  document.getElementById('status-bar').classList.remove('hidden');
}

function updateStatusBar() {
  const statusText = document.getElementById('status-text');
  const modelCount = document.getElementById('model-count');
  const toolLabel = document.getElementById('active-tool-label');

  if (statusText) statusText.textContent = 'Ready';
  if (modelCount) {
    const count = modelManager.count;
    modelCount.textContent = `${count} model${count !== 1 ? 's' : ''} loaded`;
  }
  if (toolLabel) {
    const toolNames = { select: 'Select', measure: 'Measure', section: 'Section Cut', comment: 'Add Comment' };
    toolLabel.textContent = `Tool: ${toolNames[activeTool] || activeTool}`;
  }
}

/* ============================================
   Start
   ============================================ */

init().catch(err => {
  console.error('Failed to initialize IFC Viewer:', err);
});
