/**
 * Sidebar controller — model list, properties panel, tabs.
 */
export class Sidebar {
  constructor() {
    this.visible = false;
    this.currentTab = 'models';
    this.onModelAction = null; // (action, modelId)
    this.onVisibilityAction = null; // (action)

    this._initTabs();
    this._initCloseButton();
  }

  /** Show the sidebar */
  show() {
    this.visible = true;
    document.getElementById('sidebar').classList.remove('hidden');
  }

  /** Hide the sidebar */
  hide() {
    this.visible = false;
    document.getElementById('sidebar').classList.add('hidden');
  }

  /** Toggle visibility */
  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  /** Switch to a tab */
  switchTab(tab) {
    this.currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.sidebar-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(el => {
      el.classList.toggle('active', el.id === `tab-${tab}`);
    });
  }

  /**
   * Update the model list.
   * @param {Array} models - [{id, name, visible, color, meshCount}]
   */
  updateModelList(models) {
    const list = document.getElementById('model-list');
    if (!list) return;

    if (models.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          <p>No models loaded</p>
        </div>
      `;
      return;
    }

    list.innerHTML = models.map(model => `
      <div class="model-item" data-model-id="${model.id}">
        <div class="model-color" style="color: ${model.color}; background: ${model.color}"></div>
        <div class="model-info">
          <div class="model-name" title="${model.name}">${model.name}</div>
          <div class="model-meta">${model.meshCount} elements</div>
        </div>
        <div class="model-actions">
          <button class="model-action-btn hide-btn ${model.visible ? '' : 'hidden-state'}"
                  data-action="toggle" data-model-id="${model.id}"
                  title="${model.visible ? 'Hide' : 'Show'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${model.visible
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
              }
            </svg>
          </button>
          <button class="model-action-btn remove-btn"
                  data-action="remove" data-model-id="${model.id}"
                  title="Remove model">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach event listeners
    list.querySelectorAll('.model-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const modelId = parseInt(btn.dataset.modelId, 10);
        if (this.onModelAction) this.onModelAction(action, modelId);
      });
    });
  }

  /**
   * Display element properties.
   * @param {object|null} props - {expressID, type, properties: {key: value}}
   */
  showProperties(props) {
    const content = document.getElementById('properties-content');
    if (!content) return;

    if (!props) {
      content.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <p>Click an element to view properties</p>
        </div>
      `;
      return;
    }

    // Build properties HTML
    let html = '';

    // Actions group
    html += `
      <div class="property-group" style="padding-bottom: 8px;">
        <div class="property-group-header">Visibility Actions</div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn" style="flex:1; padding:6px; font-size:12px; background:var(--bg-glass); border:1px solid var(--border);" id="btn-prop-hide">👁️ Hide</button>
          <button class="btn" style="flex:1; padding:6px; font-size:12px; background:var(--bg-glass); border:1px solid var(--border);" id="btn-prop-isolate">🎯 Isolate</button>
          <button class="btn" style="flex:1; padding:6px; font-size:12px; background:var(--bg-glass); border:1px solid var(--border);" id="btn-prop-showall">🔄 Show All</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
          <label style="font-size:12px; color:var(--text-dim);">🎨 Paint Color:</label>
          <input type="color" id="prop-color-picker" style="cursor:pointer; background:transparent; border:none; width:30px; height:24px; padding:0;" value="#ff0000" />
          <button class="btn" id="btn-prop-paint" style="padding:4px 8px; font-size:12px; background:var(--bg-glass); border:1px solid var(--border);">Apply</button>
        </div>
      </div>
    `;

    // Identity group
    html += `
      <div class="property-group">
        <div class="property-group-header">Identity</div>
        <div class="property-row">
          <span class="property-key">Express ID</span>
          <span class="property-value">${props.expressID}</span>
        </div>
        <div class="property-row">
          <span class="property-key">Type</span>
          <span class="property-value">${props.type}</span>
        </div>
      </div>
    `;

    // Other properties
    const entries = Object.entries(props.properties || {});
    if (entries.length > 0) {
      html += `<div class="property-group"><div class="property-group-header">Attributes</div>`;
      for (const [key, value] of entries) {
        const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
        html += `
          <div class="property-row">
            <span class="property-key">${key}</span>
            <span class="property-value">${displayVal}</span>
          </div>
        `;
      }
      html += `</div>`;
    }

    content.innerHTML = html;
    
    // Attach action listeners
    const hideBtn = document.getElementById('btn-prop-hide');
    const isolateBtn = document.getElementById('btn-prop-isolate');
    const showAllBtn = document.getElementById('btn-prop-showall');
    const paintBtn = document.getElementById('btn-prop-paint');
    const colorPicker = document.getElementById('prop-color-picker');
    
    if (hideBtn) hideBtn.addEventListener('click', () => this.onVisibilityAction && this.onVisibilityAction('hide'));
    if (isolateBtn) isolateBtn.addEventListener('click', () => this.onVisibilityAction && this.onVisibilityAction('isolate'));
    if (showAllBtn) showAllBtn.addEventListener('click', () => this.onVisibilityAction && this.onVisibilityAction('show_all'));
    if (paintBtn && colorPicker) {
      paintBtn.addEventListener('click', () => this.onVisibilityAction && this.onVisibilityAction('paint', colorPicker.value));
    }

    this.switchTab('properties');
  }

  /**
   * Update the comments list in the sidebar.
   * @param {Array} comments
   * @param {CommentTool} commentTool - reference to handle clicks
   */
  updateCommentsList(comments, commentTool) {
    const list = document.getElementById('comments-list');
    if (!list) return;

    if (comments.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p>No comments yet</p>
          <p style="font-size:11px; color: var(--text-muted)">Press C and click on model to add</p>
        </div>
      `;
      // Don't auto-switch tab if there are no comments
      return;
    }

    list.innerHTML = comments.map(c => {
      const dateStr = c.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const statusClass = c.status === 'answered' ? 'status-answered' : c.status === 'closed' ? 'status-closed' : 'status-open';
      const statusLabel = c.status ? c.status.toUpperCase() : 'OPEN';
      
      const title = c.title ? c.title : 'Unspecified Issue';
      const assignee = c.assignee ? c.assignee : 'Unassigned';
      const typeLabel = c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : 'Unspecified';
      
      return `
        <div class="comment-item ${statusClass}" data-comment-id="${c.id}">
          <div class="comment-item-header" style="margin-bottom: 4px;">
            <div class="issue-status-pill ${statusClass}">${statusLabel}</div>
            <div class="comment-date" style="font-weight: 500;">${typeLabel}</div>
          </div>
          <div class="comment-title" style="margin-bottom: 6px;">#${c.id} - ${title}</div>
          <div class="comment-meta">
            Assigned to: ${assignee}<br>
            Location: Unspecified<br>
            <span style="color: var(--text-muted);">${dateStr}</span>
            ${c.text ? `<div style="margin-top: 4px;">Desc: ${c.text}</div>` : ''}
          </div>
          </div>
          <div style="position: absolute; right: 10px; top: 10px; display: flex; gap: 8px;">
            <button class="comment-edit" data-comment-id="${c.id}" title="Edit Issue" style="position: static !important; background: transparent; border: none; padding: 0; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="comment-delete" data-comment-id="${c.id}" title="Delete Issue" style="position: static !important; background: transparent; border: none; padding: 0; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Click to navigate
    list.querySelectorAll('.comment-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Prevent if clicking edit or delete
        if (e.target.closest('.comment-delete') || e.target.closest('.comment-edit')) return;
        const id = parseInt(item.dataset.commentId, 10);
        commentTool.navigateToComment(id);
      });
    });

    // Edit button
    list.querySelectorAll('.comment-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.commentId, 10);
        const comment = comments.find(c => c.id === id);
        if (commentTool.onShowForm) commentTool.onShowForm(comment);
      });
    });

    // Delete button
    list.querySelectorAll('.comment-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.commentId, 10);
        commentTool.removeComment(id);
      });
    });

    this.switchTab('comments');
  }

  /* ---- Internal ---- */

  _initTabs() {
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });
  }

  _initCloseButton() {
    const closeBtn = document.getElementById('btn-close-sidebar');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
  }
}
