/**
 * Toolbar controller — manages tool button states and events.
 */
export class Toolbar {
  constructor() {
    this.currentTool = 'select';
    this.onToolChange = null;
    this.onAction = null;

    this._initButtons();
    this._initViewsDropdown();
    this._initClearDropdown();
    this._initKeyboard();
  }

  /** Show the toolbar */
  show() {
    document.getElementById('toolbar').classList.remove('hidden');
  }

  /** Hide the toolbar */
  hide() {
    document.getElementById('toolbar').classList.add('hidden');
  }

  /** Set the active tool (visually + callback) */
  setActiveTool(tool) {
    this.currentTool = tool;

    // Update button states
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    if (this.onToolChange) this.onToolChange(tool);
  }

  /* ---- Internal ---- */

  _initButtons() {
    // Tool buttons (select, measure, section)
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setActiveTool(btn.dataset.tool);
      });
    });

    // Action buttons (no tool state, just fire events)
    const actions = {
      'btn-fit': 'fit',
      'btn-add-model': 'addModel',
      'btn-toggle-sidebar': 'toggleSidebar'
    };

    for (const [id, action] of Object.entries(actions)) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.onAction) this.onAction(action);
        });
      }
    }
  }

  _initViewsDropdown() {
    const toggleBtn = document.getElementById('btn-views');
    const menu = document.getElementById('views-menu');
    if (!toggleBtn || !menu) return;

    // Toggle dropdown
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    // View preset buttons
    menu.querySelectorAll('button[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (this.onAction) this.onAction('view', view);
        menu.classList.remove('open');
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      menu.classList.remove('open');
    });
  }

  _initClearDropdown() {
    const toggleBtn = document.getElementById('btn-clear');
    const menu = document.getElementById('clear-menu');
    if (!toggleBtn || !menu) return;

    // Toggle dropdown
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    // Clear option buttons
    menu.querySelectorAll('button[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clearType = btn.dataset.clear;
        const actionMap = {
          'dimensions': 'clearDimensions',
          'sections': 'clearSections',
          'comments': 'clearComments',
          'all': 'clearAll'
        };
        if (this.onAction && actionMap[clearType]) {
          this.onAction(actionMap[clearType]);
        }
        menu.classList.remove('open');
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      menu.classList.remove('open');
    });
  }

  _initKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 's':
          this.setActiveTool('select');
          break;
        case 'm':
          this.setActiveTool('measure');
          break;
        case 'x':
          this.setActiveTool('section');
          break;
        case 'c':
          this.setActiveTool('comment');
          break;
        case 'f':
          if (this.onAction) this.onAction('fit');
          break;
        case 'v':
          document.getElementById('views-menu')?.classList.toggle('open');
          break;
        case 'tab':
          e.preventDefault();
          if (this.onAction) this.onAction('toggleSidebar');
          break;
        case 'delete':
          if (this.onAction) this.onAction('clearAll');
          break;
      }
    });
  }
}
