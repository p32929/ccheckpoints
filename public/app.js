class CCheckpointApp {
  constructor() {
    this.ws = null;
    this.reconnectInterval = null;
    this.selectedProject = null;
    this.selectedCheckpoint = null;
    this.projectCheckpoints = [];
    this.cachedStats = null;
    this.pendingAction = null;
    this.currentView = 'projects'; // projects, checkpoints, details
    
    this.init();
  }

  async init() {
    console.log('🚀 Initializing CCheckpoint App...');
    this.setupWebSocket();
    await this.loadInitialData();
    this.setupEventHandlers();
    this.showView('projects');
    console.log('✅ CCheckpoint App initialized');
  }

  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('📡 WebSocket connected');
      this.updateConnectionStatus(true);
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 WebSocket message received:', message);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('📡 WebSocket disconnected');
      this.updateConnectionStatus(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus(false);
    };
  }

  scheduleReconnect() {
    if (this.reconnectInterval) return;
    
    console.log('🔄 Scheduling WebSocket reconnection...');
    this.reconnectInterval = setInterval(() => {
      console.log('🔄 Attempting WebSocket reconnection...');
      this.setupWebSocket();
    }, 5000);
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'session_start':
        if (message.data && message.data.projectName) {
          this.showToast(`New prompt received for ${message.data.projectName}`, 'info');
        }
        // Only refresh projects view data, don't force navigation
        if (this.currentView === 'projects') {
          this.loadInitialData();
        }
        break;
      case 'checkpoint_created':
        if (message.data && message.data.projectName) {
          this.showToast(`New checkpoint created for ${message.data.projectName}`, 'success');
        } else {
          this.showToast('New checkpoint created', 'success');
        }
        // Update projects stats only if in projects view
        if (this.currentView === 'projects') {
          this.loadInitialData();
        }
        // Refresh checkpoints list if currently viewing checkpoints
        if (this.currentView === 'checkpoints' && this.selectedProject) {
          console.log('🔄 WebSocket: Refreshing checkpoints list for', this.selectedProject.path);
          this.refreshCheckpointsList(this.selectedProject.path);
        } else {
          console.log('🔄 WebSocket: Not refreshing checkpoints - currentView:', this.currentView, 'selectedProject:', this.selectedProject);
        }
        break;
      case 'session_stop':
        break;
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }

  updateConnectionStatus(connected) {
    const statusDot = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-text');
    
    if (connected) {
      statusDot.classList.remove('disconnected');
      statusText.textContent = 'Connected';
    } else {
      statusDot.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
    }
  }

  async loadInitialData() {
    try {
      console.log('📊 Loading initial data...');
      const response = await fetch('/api/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const result = await response.json();
      
      if (result.success) {
        this.cachedStats = result.data;
        if (this.currentView === 'projects') {
          this.renderProjectsView();
        }
        console.log('✅ Initial data loaded');
      } else {
        throw new Error(result.error || 'Failed to load stats');
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showToast('Failed to load data', 'error');
    }
  }

  // View Management
  showView(view) {
    this.currentView = view;
    
    // Hide all views
    document.getElementById('projects-view').style.display = 'none';
    document.getElementById('checkpoints-view').style.display = 'none';
    document.getElementById('details-view').style.display = 'none';
    
    // Show the requested view
    document.getElementById(`${view}-view`).style.display = 'block';
    
    // Update header title and breadcrumb
    this.updateHeaderTitle();
    this.updateBreadcrumb();
    this.updateBackButton();
  }

  updateHeaderTitle() {
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    
    switch (this.currentView) {
      case 'projects':
        titleEl.textContent = 'Projects';
        subtitleEl.textContent = 'Select a project to view its checkpoints';
        break;
      case 'checkpoints':
        titleEl.textContent = this.selectedProject?.name || 'Checkpoints';
        subtitleEl.textContent = `${this.projectCheckpoints.length} checkpoints found`;
        break;
      case 'details':
        titleEl.textContent = 'Checkpoint Details';
        subtitleEl.textContent = this.selectedCheckpoint?.message || '';
        break;
    }
  }

  updateBreadcrumb() {
    const breadcrumbEl = document.getElementById('breadcrumb');
    const projectItem = document.getElementById('breadcrumb-project');
    const projectLink = document.getElementById('breadcrumb-project-link');
    const checkpointItem = document.getElementById('breadcrumb-checkpoint');
    const checkpointText = document.getElementById('breadcrumb-checkpoint-text');
    const separator2 = document.getElementById('breadcrumb-separator-2');
    
    // Check if all elements exist before proceeding
    if (!breadcrumbEl || !projectItem || !projectLink || !checkpointItem || !checkpointText || !separator2) {
      console.warn('Breadcrumb elements not found, skipping update');
      return;
    }
    
    // Show/hide breadcrumb based on current view
    if (this.currentView === 'projects') {
      breadcrumbEl.style.display = 'none';
    } else {
      breadcrumbEl.style.display = 'flex';
    }
    
    // Update project breadcrumb
    if (this.selectedProject && (this.currentView === 'checkpoints' || this.currentView === 'details')) {
      projectItem.style.display = 'inline';
      projectLink.textContent = `📋 ${this.selectedProject.name}`;
      projectLink.onclick = () => this.showCheckpoints();
    } else {
      projectItem.style.display = 'none';
    }
    
    // Update checkpoint breadcrumb
    if (this.selectedCheckpoint && this.currentView === 'details') {
      separator2.style.display = 'inline';
      checkpointItem.style.display = 'inline';
      const truncatedMessage = this.truncateMessage(this.selectedCheckpoint.message, 30);
      checkpointText.textContent = `📄 ${truncatedMessage}`;
    } else {
      separator2.style.display = 'none';
      checkpointItem.style.display = 'none';
    }
  }

  updateBackButton() {
    const backBtn = document.getElementById('back-btn');
    
    if (!backBtn) {
      console.warn('Back button element not found, skipping update');
      return;
    }
    
    if (this.currentView === 'projects') {
      backBtn.classList.remove('show');
    } else {
      backBtn.classList.add('show');
    }
  }

  // Projects View
  renderProjectsView() {
    const projects = this.cachedStats?.projects || [];
    document.getElementById('projects-count').textContent = projects.length;
    
    const tbody = document.getElementById('projects-tbody');
    
    if (projects.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-row">
            <div class="empty-state">
              <div class="empty-text">No projects with checkpoints found</div>
              <div class="empty-subtext">Start using Claude Code to create checkpoints</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = projects.map((project, index) => `
      <tr class="table-row" data-project-path="${project.projectPath}" data-project-name="${project.projectName}">
        <td class="row-number">${index + 1}</td>
        <td class="project-info">
          <div class="project-name">${project.projectName}</div>
          <div class="project-path">${project.projectPath}</div>
        </td>
        <td class="project-checkpoints">
          ${project.totalCheckpoints}
        </td>
        <td class="project-last-checkpoint">
          ${this.formatTimeAgo(project.lastSessionTime)}
        </td>
        <td class="project-actions-cell">
          <div class="table-actions">
            <button class="delete-btn" data-project-path="${project.projectPath}" data-project-name="${project.projectName}" title="Delete all checkpoints">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    
    // Add event listeners for project selection and deletion
    tbody.querySelectorAll('.table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (!e.target.closest('.delete-btn')) {
          const projectPath = row.dataset.projectPath;
          const projectName = row.dataset.projectName;
          this.selectProject(projectPath, projectName);
        }
      });
    });
    
    tbody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectPath = btn.dataset.projectPath;
        const projectName = btn.dataset.projectName;
        this.confirmDeleteProject(projectPath, projectName);
      });
    });
  }

  selectProject(projectPath, projectName) {
    console.log(`📁 Selecting project: ${projectName}`);
    this.selectedProject = { path: projectPath, name: projectName };
    this.selectedCheckpoint = null;
    this.loadProjectCheckpoints(projectPath);
  }

  async loadProjectCheckpoints(projectPath) {
    try {
      console.log(`📋 Loading checkpoints for: ${projectPath}`);
      
      const response = await fetch('/api/checkpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectPath })
      });
      const result = await response.json();
      
      if (result.success) {
        this.projectCheckpoints = result.data || [];
        this.showView('checkpoints');
        this.renderCheckpointsView();
        console.log(`✅ Loaded ${this.projectCheckpoints.length} checkpoints`);
      } else {
        throw new Error(result.error || 'Failed to load checkpoints');
      }
    } catch (error) {
      console.error('Error loading project checkpoints:', error);
      this.showToast('Failed to load checkpoints', 'error');
    }
  }

  async refreshCheckpointsList(projectPath) {
    try {
      console.log(`🔄 Refreshing checkpoints for: ${projectPath}`);
      console.log(`🔍 Current projectCheckpoints.length before refresh: ${this.projectCheckpoints.length}`);
      
      // Store current selection info BEFORE making API call
      const selectedCheckpointId = this.selectedCheckpoint?.id;
      const wasSelected = !!selectedCheckpointId;
      
      const response = await fetch('/api/checkpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectPath })
      });
      const result = await response.json();
      
      console.log(`📊 API response:`, result);
      
      if (result.success) {
        this.projectCheckpoints = result.data || [];
        console.log(`📋 Set projectCheckpoints.length to: ${this.projectCheckpoints.length}`);
        
        // Re-render the checkpoints view, skipping automatic selection restore
        this.renderCheckpointsView(true);
        
        // If there was a selection and it still exists, re-fetch its details to ensure fresh data
        if (wasSelected && selectedCheckpointId) {
          const stillExists = this.projectCheckpoints.find(cp => cp.id === selectedCheckpointId);
          if (stillExists) {
            console.log(`🔄 Re-selecting checkpoint ${selectedCheckpointId} to refresh details`);
            // Small delay to ensure DOM is ready
            setTimeout(() => {
              this.selectCheckpoint(selectedCheckpointId);
            }, 50);
          }
        }
        
        console.log(`✅ Refreshed ${this.projectCheckpoints.length} checkpoints`);
      } else {
        console.error('❌ API response not successful:', result);
        throw new Error(result.error || 'Failed to refresh checkpoints');
      }
    } catch (error) {
      console.error('Error refreshing checkpoints:', error);
      this.showToast('Failed to refresh checkpoints', 'error');
    }
  }

  // Checkpoints View
  async renderCheckpointsView(skipSelectionRestore = false) {
    const tbody = document.getElementById('checkpoints-tbody');
    
    // Debug logging
    console.log('renderCheckpointsView called, skipSelectionRestore:', skipSelectionRestore);
    console.log('projectCheckpoints:', this.projectCheckpoints);
    console.log('tbody element:', tbody);
    
    // Remember the currently selected checkpoint ID
    const selectedCheckpointId = this.selectedCheckpoint?.id;
    
    if (!this.projectCheckpoints || this.projectCheckpoints.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-row">
            <div class="empty-state">
              <div class="empty-icon">📋</div>
              <div class="empty-text">No checkpoints found</div>
              <div class="empty-subtext">This project doesn't have any checkpoints yet</div>
            </div>
          </td>
        </tr>
      `;
      // Clear selection since there are no checkpoints
      this.clearCheckpointSelection();
      return;
    }

    // Render checkpoints with change detection
    const checkpointRows = await Promise.all(this.projectCheckpoints.map(async (checkpoint, index) => {
      const hasChanges = await this.checkpointHasChanges(checkpoint, index);
      const isDisabled = !hasChanges;
      
      return `
        <tr class="table-row ${isDisabled ? 'disabled-checkpoint' : ''}" 
            ${isDisabled ? '' : `onclick="window.app.selectCheckpoint('${checkpoint.id}')"`}
            style="${isDisabled ? 'cursor: not-allowed; opacity: 0.6; color: #ff6b6b;' : ''}">
          <td class="row-number">${index + 1}</td>
          <td class="checkpoint-message">${this.truncateMessage(checkpoint.message, 60)}</td>
          <td class="checkpoint-stats">
            <div class="stat-item">📄 ${checkpoint.fileCount}</div>
            <div class="stat-item">📦 ${this.formatFileSize(checkpoint.totalSize)}</div>
          </td>
          <td class="checkpoint-time">${this.formatTimestamp(checkpoint.timestamp)}</td>
        </tr>
      `;
    }));
    
    tbody.innerHTML = checkpointRows.join('');
    
    // If there was a selected checkpoint, try to restore the selection (unless skipping)
    if (selectedCheckpointId && !skipSelectionRestore) {
      const stillExists = this.projectCheckpoints.find(cp => cp.id === selectedCheckpointId);
      if (stillExists) {
        // Restore the selection without making an API call
        this.selectedCheckpoint = stillExists;
        this.highlightSelectedCheckpoint(selectedCheckpointId);
        await this.showCheckpointDetails(stillExists);
      } else {
        // Selected checkpoint no longer exists, clear selection
        this.clearCheckpointSelection();
      }
    } else if (skipSelectionRestore) {
      // Just clear any highlighting, selection will be handled manually
      document.querySelectorAll('.table-row').forEach(row => {
        row.classList.remove('selected');
      });
    } else {
      // No previous selection, clear any stray highlighting
      this.clearCheckpointSelection();
    }
  }

  highlightSelectedCheckpoint(checkpointId) {
    // Remove previous highlighting
    document.querySelectorAll('.table-row').forEach(row => {
      row.classList.remove('selected');
    });
    
    // Highlight the selected row
    const selectedRow = document.querySelector(`[onclick*="${checkpointId}"]`);
    if (selectedRow) {
      selectedRow.classList.add('selected');
    }
  }

  async showCheckpointDetails(checkpoint) {
    // Show details in right panel
    await this.renderCheckpointDetails();
  }

  async selectCheckpoint(checkpointId) {
    try {
      console.log(`📋 Selecting checkpoint: ${checkpointId}`);
      
      const response = await fetch('/api/checkpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ checkpointId })
      });
      const result = await response.json();
      
      if (result.success) {
        this.selectedCheckpoint = result.data;
        
        // Highlight selected row and show details
        this.highlightSelectedCheckpoint(checkpointId);
        await this.showCheckpointDetails(result.data);
        console.log('✅ Checkpoint selected');
      } else {
        throw new Error(result.error || 'Failed to load checkpoint details');
      }
    } catch (error) {
      console.error('Error selecting checkpoint:', error);
      this.showToast('Failed to load checkpoint details', 'error');
    }
  }

  // Checkpoint Details for Split Panel
  async renderCheckpointDetails() {
    const checkpoint = this.selectedCheckpoint;
    
    // Hide empty state and show details content
    const emptyDetails = document.querySelector('.empty-details');
    const detailsContent = document.getElementById('checkpoint-details-content');
    
    if (emptyDetails) emptyDetails.style.display = 'none';
    if (detailsContent) detailsContent.style.display = 'flex';
    
    // Update action buttons in split panel
    const diffBtn = detailsContent?.querySelector('#diff-btn');
    const restoreBtn = detailsContent?.querySelector('#restore-btn');
    const deleteBtn = detailsContent?.querySelector('#delete-checkpoint-btn');
    
    if (diffBtn) {
      await this.updateDiffButtonState(checkpoint);
      // Remove any existing event listeners and add new one
      diffBtn.onclick = null;
      diffBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showCheckpointDiff();
      };
    }
    
    if (restoreBtn) {
      restoreBtn.onclick = null;
      restoreBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.restoreCheckpoint();
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = null;
      deleteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.confirmDeleteCheckpoint();
      };
    }
    
    // Render checkpoint info in split panel
    const infoContainer = detailsContent?.querySelector('#checkpoint-info');
    if (infoContainer) {
      infoContainer.innerHTML = `
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Project</div>
            <div class="info-value">${checkpoint.projectName}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Created</div>
            <div class="info-value">${this.formatTimestamp(checkpoint.timestamp)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Files</div>
            <div class="info-value">${checkpoint.fileCount}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Total Size</div>
            <div class="info-value">${this.formatFileSize(checkpoint.totalSize)}</div>
          </div>
          ${checkpoint.userPrompt && checkpoint.userPrompt !== 'User prompt submitted' ? `
          <div class="info-item" style="grid-column: 1 / -1;">
            <div class="info-label">User Prompt</div>
            <div class="info-value user-prompt">${checkpoint.userPrompt}</div>
          </div>
          ` : ''}
        </div>
      `;
    }
    
    // Render changed files table in split panel
    const filesTbody = detailsContent?.querySelector('#files-tbody');
    if (filesTbody) {
      await this.renderChangedFilesInPanel(checkpoint, filesTbody);
    }
  }

  async renderChangedFilesInPanel(checkpoint, tbody) {
    try {
      // Get diff data to show only changed files
      const currentIndex = this.projectCheckpoints.findIndex(cp => cp.id === checkpoint.id);
      if (currentIndex === -1 || currentIndex === this.projectCheckpoints.length - 1) {
        // No previous checkpoint to compare with, show message
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="empty-row">
              <div class="empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-text">No changes to display</div>
                <div class="empty-subtext">This is the first checkpoint or no previous checkpoint available</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      const previousCheckpoint = this.projectCheckpoints[currentIndex + 1];
      
      // Get diff data
      const response = await fetch('/api/checkpoint/diff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentId: checkpoint.id,
          previousId: previousCheckpoint.id
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get diff data');
      }

      const changes = result.data.changes || [];
      
      if (changes.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="empty-row">
              <div class="empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-text">No file changes detected</div>
                <div class="empty-subtext">All files remained unchanged in this checkpoint</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      // Render changed files with color coding
      tbody.innerHTML = changes.map((change, index) => {
        const changeTypeColor = change.type === 'added' ? '#2ea043' : 
                               change.type === 'deleted' ? '#f85149' : '#1f6feb';
        const changeTypeIcon = change.type === 'added' ? '📄' : 
                              change.type === 'deleted' ? '🗑️' : '✏️';
        const changeTypeText = change.type === 'added' ? 'Added' : 
                              change.type === 'deleted' ? 'Deleted' : 'Modified';
        
        return `
          <tr class="table-row" style="cursor: pointer;" onclick="app.openDiffForFile('${change.file}')">
            <td class="row-number">${index + 1}</td>
            <td class="file-path">${change.file}</td>
            <td>
              <span class="${change.type}-badge" style="color: ${changeTypeColor};">
                ${changeTypeIcon} ${changeTypeText}
              </span>
            </td>
            <td class="file-info">
              <div class="file-size" style="color: var(--text-muted);">
                ${change.type === 'deleted' ? 'File removed' : 
                  change.type === 'added' ? 'New file' : 'Modified'}
              </div>
            </td>
          </tr>
        `;
      }).join('');
      
    } catch (error) {
      console.error('Error loading changed files:', error);
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-row">
            <div class="empty-state">
              <div class="empty-icon">⚠️</div>
              <div class="empty-text">Error loading changed files</div>
              <div class="empty-subtext">${error.message}</div>
            </div>
          </td>
        </tr>
      `;
    }
  }

  renderFilesTableInPanel(files, tbody) {
    if (files.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-row">
            <div class="empty-state">
              <div class="empty-icon">📄</div>
              <div class="empty-text">No file details available</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = files.map((file, index) => `
      <tr class="table-row">
        <td class="row-number">${index + 1}</td>
        <td class="file-path">${file.relativePath}</td>
        <td class="file-info">
          <div class="file-size">${this.formatFileSize(file.size)}</div>
          <div class="file-modified">Modified: ${this.formatTimestamp(file.modifiedTime)}</div>
        </td>
      </tr>
    `).join('');
  }

  clearCheckpointSelection() {
    // Clear selected checkpoint
    this.selectedCheckpoint = null;
    
    // Remove selection highlighting
    document.querySelectorAll('.table-row').forEach(row => {
      row.classList.remove('selected');
    });
    
    // Show empty state and hide details content
    const emptyDetails = document.querySelector('.empty-details');
    const detailsContent = document.getElementById('checkpoint-details-content');
    
    if (emptyDetails) emptyDetails.style.display = 'flex';
    if (detailsContent) detailsContent.style.display = 'none';
  }

  // Details View
  async renderDetailsView() {
    const checkpoint = this.selectedCheckpoint;
    
    // Update action buttons
    await this.updateDiffButtonState(checkpoint);
    
    // Render checkpoint info
    const infoContainer = document.getElementById('checkpoint-info');
    infoContainer.innerHTML = `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Project</div>
          <div class="info-value">${checkpoint.projectName}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Created</div>
          <div class="info-value">${this.formatTimestamp(checkpoint.timestamp)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Files</div>
          <div class="info-value">${checkpoint.fileCount}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Total Size</div>
          <div class="info-value">${this.formatFileSize(checkpoint.totalSize)}</div>
        </div>
        ${checkpoint.userPrompt && checkpoint.userPrompt !== 'User prompt submitted' ? `
        <div class="info-item" style="grid-column: 1 / -1;">
          <div class="info-label">User Prompt</div>
          <div class="info-value user-prompt">${checkpoint.userPrompt}</div>
        </div>
        ` : ''}
      </div>
    `;
    
    // Render files table
    this.renderFilesTable(checkpoint.files || []);
  }

  renderFilesTable(files) {
    const tbody = document.getElementById('files-tbody');
    
    if (files.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-row">
            <div class="empty-state">
              <div class="empty-icon">📄</div>
              <div class="empty-text">No file details available</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = files.map((file, index) => `
      <tr class="table-row">
        <td class="row-number">${index + 1}</td>
        <td class="file-path">${file.relativePath}</td>
        <td class="file-info">
          <div class="file-size">${this.formatFileSize(file.size)}</div>
          <div class="file-modified">Modified: ${this.formatTimestamp(file.modifiedTime)}</div>
        </td>
      </tr>
    `).join('');
  }

  // Navigation
  goBack() {
    switch (this.currentView) {
      case 'checkpoints':
        this.showProjects();
        break;
      case 'details':
        this.showCheckpoints();
        break;
    }
  }

  async showProjects() {
    this.selectedProject = null;
    this.selectedCheckpoint = null;
    this.clearCheckpointSelection();
    this.showView('projects');
    
    // Refresh stats when navigating back to projects view
    this.cachedStats = null;
    await this.loadInitialData();
  }

  showCheckpoints() {
    if (!this.selectedProject) return;
    this.selectedCheckpoint = null;
    this.clearCheckpointSelection();
    this.showView('checkpoints');
    this.renderCheckpointsView();
  }

  // Actions
  canShowDiff(checkpoint) {
    if (!this.projectCheckpoints) return false;
    const checkpointIndex = this.projectCheckpoints.findIndex(c => c.id === checkpoint.id);
    return checkpointIndex < this.projectCheckpoints.length - 1;
  }

  confirmDeleteProject(projectPath, projectName) {
    this.showModal(
      'Delete Project Checkpoints',
      `Are you sure you want to delete all checkpoints for "${projectName}"? This action cannot be undone.`,
      () => this.deleteProject(projectPath, projectName)
    );
  }

  confirmClearAllCheckpoints() {
    this.showModal(
      'Clear All Checkpoints',
      'Are you sure you want to delete ALL checkpoints from ALL projects? This will not delete the projects themselves, only their checkpoint history. This action cannot be undone.',
      () => this.clearAllCheckpoints()
    );
  }

  async deleteProject(projectPath, projectName) {
    try {
      console.log(`🗑️ Deleting project: ${projectName}`);
      
      const response = await fetch('/api/project/checkpoints', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showToast(`Deleted all checkpoints for ${projectName}`, 'success');
        
        // If we're viewing this project, go back to projects list
        if (this.selectedProject?.path === projectPath) {
          this.showProjects();
        }
        
        this.loadInitialData();
        console.log('✅ Project deleted successfully');
      } else {
        throw new Error(result.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      this.showToast('Failed to delete project checkpoints', 'error');
    }
  }

  async clearAllCheckpoints() {
    try {
      console.log('🗑️ Clearing all checkpoints from all projects...');
      
      const response = await fetch('/api/clear-all-checkpoints', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showToast(`Cleared ${result.data.deletedCheckpoints} checkpoints from ${result.data.projectCount} projects`, 'success');
        
        // Refresh the projects view
        this.showProjects();
        this.loadInitialData();
        
        console.log('✅ All checkpoints cleared successfully');
      } else {
        throw new Error(result.error || 'Failed to clear all checkpoints');
      }
    } catch (error) {
      console.error('Error clearing all checkpoints:', error);
      this.showToast('Failed to clear all checkpoints', 'error');
    }
  }

  confirmDeleteCheckpoint() {
    if (!this.selectedCheckpoint) return;
    
    this.showModal(
      'Delete Checkpoint',
      `Are you sure you want to delete the checkpoint "${this.selectedCheckpoint.message}"? This action cannot be undone.`,
      () => this.deleteCheckpoint(this.selectedCheckpoint.id)
    );
  }

  async deleteCheckpoint(checkpointId) {
    try {
      console.log(`🗑️ Deleting checkpoint: ${checkpointId}`);
      
      const response = await fetch(`/api/checkpoint/${checkpointId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showToast('Checkpoint deleted successfully', 'success');
        
        // Go back to checkpoints view
        this.showCheckpoints();
        this.loadProjectCheckpoints(this.selectedProject.path);
        
        console.log('✅ Checkpoint deleted successfully');
      } else {
        throw new Error(result.error || 'Failed to delete checkpoint');
      }
    } catch (error) {
      console.error('Error deleting checkpoint:', error);
      this.showToast('Failed to delete checkpoint', 'error');
    }
  }

  async restoreCheckpoint() {
    if (!this.selectedCheckpoint) return;
    
    try {
      console.log(`🔄 Restoring checkpoint: ${this.selectedCheckpoint.id}`);
      
      const response = await fetch(`/api/checkpoint/${this.selectedCheckpoint.id}/restore`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showToast(`Restored ${result.data.filesRestored} files successfully!`, 'success');
        console.log('✅ Checkpoint restored successfully');
      } else {
        throw new Error(result.error || 'Failed to restore checkpoint');
      }
    } catch (error) {
      console.error('Error restoring checkpoint:', error);
      this.showToast('Failed to restore checkpoint', 'error');
    }
  }


  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDiffLine(line) {
    const trimmedLine = line.trim();
    
    if (line.startsWith('+')) {
      // Added line - green background with proper padding and spacing
      return `<div style="background-color: rgba(46, 160, 67, 0.15); color: #2ea043; padding: 2px 8px; margin: 1px 0; border-left: 3px solid #2ea043; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace; font-size: 13px; line-height: 1.4;">${this.escapeHtml(line)}</div>`;
    } else if (line.startsWith('-')) {
      // Removed line - red background with proper padding and spacing  
      return `<div style="background-color: rgba(248, 81, 73, 0.15); color: #f85149; padding: 2px 8px; margin: 1px 0; border-left: 3px solid #f85149; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace; font-size: 13px; line-height: 1.4;">${this.escapeHtml(line)}</div>`;
    } else {
      // Context line - neutral color with subtle styling
      return `<div style="color: #7d8590; padding: 2px 8px; margin: 1px 0; border-left: 3px solid transparent; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace; font-size: 13px; line-height: 1.4;">${this.escapeHtml(line)}</div>`;
    }
  }

  formatDiffContent(diffText, changeType) {
    if (changeType === 'added') {
      return `<div style="background-color: rgba(46, 160, 67, 0.1); border: 1px solid rgba(46, 160, 67, 0.3); border-radius: 6px; padding: 12px; margin: 8px 0;">
        <div style="color: #2ea043; font-weight: 600; font-size: 14px; margin-bottom: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;">✅ File added</div>
        <div style="color: #656d76; font-size: 13px;">New file was created in this checkpoint</div>
      </div>`;
    } else if (changeType === 'deleted') {
      return `<div style="background-color: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 6px; padding: 12px; margin: 8px 0;">
        <div style="color: #f85149; font-weight: 600; font-size: 14px; margin-bottom: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;">🗑️ File deleted</div>
        <div style="color: #656d76; font-size: 13px;">File was removed in this checkpoint</div>
      </div>`;
    } else {
      // For modified files, clean up the diff and format nicely
      const lines = diffText.split('\n').filter(line => line.trim() !== '');
      
      // Remove any leading numbers or artifacts
      const cleanLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed !== '' && !(/^\d+$/.test(trimmed));
      });
      
      return `<div style="background-color: #0d1117; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; margin: 8px 0;">
        <div style="background-color: #21262d; padding: 8px 12px; border-bottom: 1px solid #30363d; font-size: 12px; font-weight: 600; color: #f0f6fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;">
          📝 Changes
        </div>
        <div style="padding: 0;">
          ${cleanLines.map(line => this.formatDiffLine(line)).join('')}
        </div>
      </div>`;
    }
  }

  showDiffModal(diffData, preSelectedFile = null) {
    try {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay active';
      
      // Filter out files with no actual changes
      const filteredChanges = diffData.changes.filter(change => {
        if (change.type === 'added' || change.type === 'deleted') {
          return true; // Always show added/deleted files
        }
        // For modified files, check if there's actual content difference
        return change.diff && change.diff.trim() && !change.diff.includes('No content changes detected');
      });

    // If no files have changes, show message
    if (filteredChanges.length === 0) {
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">No Changes Found</div>
          </div>
          <div class="modal-content" style="text-align: center;">
            <div style="color: var(--text-muted); font-size: 16px;">
              This checkpoint contains no file changes to display.
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      return;
    }

    // Update diffData to use filtered changes
    diffData.changes = filteredChanges;
    
    // Create file list for sidebar with color coding
    let initialActiveIndex = 0;
    if (preSelectedFile) {
      const preSelectedIndex = diffData.changes.findIndex(change => change.file === preSelectedFile);
      if (preSelectedIndex !== -1) {
        initialActiveIndex = preSelectedIndex;
      }
    } else {
      const firstSelectableIndex = diffData.changes.findIndex(change => change.type !== 'deleted');
      initialActiveIndex = firstSelectableIndex !== -1 ? firstSelectableIndex : 0;
    }
    
    const fileListHtml = diffData.changes.map((change, index) => `
      <div class="diff-file-item ${index === initialActiveIndex ? 'active' : ''} ${change.type} ${change.type === 'deleted' ? 'disabled' : ''}" data-index="${index}">
        <div class="diff-file-icon">
          ${change.type === 'added' ? '📄' : change.type === 'deleted' ? '🗑️' : '✏️'}
        </div>
        <div class="diff-file-name">${change.file}</div>
        <div class="diff-file-changes ${change.type}-badge">
          ${change.type === 'added' ? 'added' : 
            change.type === 'deleted' ? 'deleted' : 
            'modified'}
        </div>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="modal diff-modal">
        <div class="modal-header">
          <div class="modal-title">
            Checkpoint Comparison
            <span class="diff-summary">
              ${diffData.summary.added} added, ${diffData.summary.modified} modified, ${diffData.summary.deleted} deleted
            </span>
          </div>
        </div>
        <div class="modal-content" style="padding: 0;">
          <div class="diff-container">
            <div class="diff-sidebar">
              <div class="diff-files-header">Files changed (${diffData.changes.length})</div>
              <div class="diff-files-list">
                ${fileListHtml}
              </div>
            </div>
            <div class="diff-content">
              <div id="diff-file-content">
                ${this.renderSingleFileDiff(diffData.changes[initialActiveIndex] || null)}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>
    `;
    
    // Add event listeners for file selection
    modal.querySelectorAll('.diff-file-item').forEach(item => {
      item.addEventListener('click', () => {
        // Don't allow clicking on deleted files
        if (item.classList.contains('disabled')) {
          return;
        }
        
        const index = parseInt(item.dataset.index);
        const fileData = diffData.changes[index];
        
        // Update active state
        modal.querySelectorAll('.diff-file-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Update content
        modal.querySelector('#diff-file-content').innerHTML = this.renderSingleFileDiff(fileData);
      });
    });
    
    document.body.appendChild(modal);
  } catch (error) {
    console.error('Error in showDiffModal:', error);
    this.showToast('Error displaying diff: ' + error.message, 'error');
  }
  }

  async checkpointHasChanges(checkpoint, index) {
    try {
      // First checkpoint or last checkpoint always considered as having changes
      if (index === this.projectCheckpoints.length - 1) {
        return true; // First checkpoint in the project
      }

      const previousCheckpoint = this.projectCheckpoints[index + 1];
      
      // Get diff data to check for changes
      const response = await fetch('/api/checkpoint/diff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentId: checkpoint.id,
          previousId: previousCheckpoint.id
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        // If diff fails, assume it has changes to be safe
        return true;
      }

      const changes = result.data.changes || [];
      
      // Filter out files with no actual changes (same logic as showDiffModal)
      const actualChanges = changes.filter(change => {
        if (change.type === 'added' || change.type === 'deleted') {
          return true; // Always show added/deleted files
        }
        // For modified files, check if there's actual content difference
        return change.diff && change.diff.trim() && !change.diff.includes('No content changes detected');
      });

      return actualChanges.length > 0;
      
    } catch (error) {
      console.error('Error checking checkpoint changes:', error);
      // If error, assume it has changes to be safe
      return true;
    }
  }

  async openDiffForFile(fileName) {
    try {
      // Get the current checkpoint's diff data
      if (!this.selectedCheckpoint) {
        this.showToast('No checkpoint selected', 'error');
        return;
      }

      const currentIndex = this.projectCheckpoints.findIndex(cp => cp.id === this.selectedCheckpoint.id);
      if (currentIndex === -1 || currentIndex === this.projectCheckpoints.length - 1) {
        this.showToast('No previous checkpoint to compare with', 'error');
        return;
      }

      const previousCheckpoint = this.projectCheckpoints[currentIndex + 1];
      
      // Get diff data
      const response = await fetch('/api/checkpoint/diff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentId: this.selectedCheckpoint.id,
          previousId: previousCheckpoint.id
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get diff data');
      }

      // Open diff modal with the specific file pre-selected
      this.showDiffModal(result.data, fileName);
      
    } catch (error) {
      console.error('Error opening diff for file:', error);
      this.showToast('Error opening diff: ' + error.message, 'error');
    }
  }

  renderSingleFileDiff(fileData) {
    if (!fileData) {
      return '<div class="no-file-selected">Select a file to view changes</div>';
    }

    return `
      <div class="single-file-diff">
        <div class="file-header">
          <div class="file-path">${fileData.file}</div>
          <div class="file-status ${fileData.type}">
            ${fileData.type === 'added' ? '📄 Added' : 
              fileData.type === 'deleted' ? '🗑️ Deleted' : 
              '✏️ Modified'}
          </div>
        </div>
        <div class="file-diff-content">
          ${this.formatGitHubStyleDiff(fileData.diff, fileData.type)}
        </div>
      </div>
    `;
  }

  setupEventHandlers() {
    console.log('🎛️ Setting up event handlers...');
    
    // Removed auto-refresh to prevent infinite API loops
    // Data will refresh via WebSocket messages instead

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ws.readyState !== WebSocket.OPEN) {
        this.setupWebSocket();
      }
    });

    // Back button
    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.goBack();
    });

    // Logo click handler - return to projects view
    document.querySelector('.logo')?.addEventListener('click', () => {
      this.showProjects();
    });

    // Clear all checkpoints button
    document.getElementById('clear-all-btn')?.addEventListener('click', () => {
      this.confirmClearAllCheckpoints();
    });

    // Diff/Compare buttons - delegate to handle dynamically created buttons
    document.body.addEventListener('click', (e) => {
      if (e.target.id === 'diff-btn' && !e.target.disabled) {
        this.showCheckpointDiff();
      }
    });

    // Modal handlers
    document.getElementById('modal-cancel')?.addEventListener('click', () => {
      this.hideModal();
    });

    document.getElementById('modal-confirm')?.addEventListener('click', () => {
      if (this.pendingAction) {
        this.pendingAction();
        this.pendingAction = null;
      }
      this.hideModal();
    });

    // Close modal on overlay click
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        this.hideModal();
      }
    });

    console.log('✅ Event handlers setup complete');
  }

  showModal(title, message, confirmAction) {
    const modal = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.add('active');
    this.pendingAction = confirmAction;
  }

  hideModal() {
    const modal = document.getElementById('modal-overlay');
    modal.classList.remove('active');
    this.pendingAction = null;
  }

  showToast(message, type = 'info') {
    console.log(`🍞 Toast: ${message} (${type})`);
    
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    
    // Show info toasts for shorter duration (2s), success/error for longer (3s)
    const duration = type === 'info' ? 2000 : 3000;
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 400);
    }, duration);
  }

  // Utility functions
  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  truncateMessage(message, maxLength) {
    if (!message || message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  }

  formatGitHubStyleDiff(diffText, changeType) {
    if (changeType === 'added') {
      // Show full content for added files
      if (!diffText) {
        return `<div class="github-diff added-file">
          <div class="hunk-info">New file (content not available)</div>
        </div>`;
      }
      const lines = diffText.split('\n');
      return `<div class="github-diff added-file">
        <div class="hunk-info">New file</div>
        <div class="diff-lines">
          ${lines.map((line, index) => `
            <div class="diff-line added-line">
              <span class="line-number">${index + 1}</span>
              <span class="line-marker added">+</span>
              <span class="line-content">${this.escapeHtml(line)}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    } else if (changeType === 'deleted') {
      // Show full content for deleted files
      if (!diffText) {
        return `<div class="github-diff deleted-file">
          <div class="hunk-info">File deleted</div>
          <div class="diff-content" style="padding: 1rem; color: var(--text-muted); text-align: center;">
            This file was deleted in this checkpoint.
          </div>
        </div>`;
      }
      const lines = diffText.split('\n');
      return `<div class="github-diff deleted-file">
        <div class="hunk-info">File deleted</div>
        <div class="diff-lines">
          ${lines.map((line, index) => `
            <div class="diff-line deleted-line">
              <span class="line-number">${index + 1}</span>
              <span class="line-marker deleted">-</span>
              <span class="line-content">${this.escapeHtml(line)}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    } else {
      // Parse and group unified diff for modified files
      if (!diffText) {
        return `<div class="github-diff modified-file">
          <div class="hunk-info">No changes detected</div>
          <div class="diff-content" style="padding: 1rem; color: var(--text-muted); text-align: center;">
            This file was modified but no diff content is available.
          </div>
        </div>`;
      }
      const lines = diffText.split('\n').filter(line => line.trim() !== '');
      const grouped = this.groupDiffLines(lines);
      
      return `<div class="github-diff modified-file">
        <div class="diff-lines">
          ${grouped.map(group => {
            if (group.type === 'hunk') {
              return `<div class="hunk-info">${this.escapeHtml(group.content)}</div>`;
            } else if (group.type === 'context') {
              return group.lines.map(line => `
                <div class="diff-line context-line">
                  <span class="line-marker"> </span>
                  <span class="line-content">${this.escapeHtml(line)}</span>
                </div>
              `).join('');
            } else if (group.type === 'change') {
              // Group deletions and additions together
              let html = '';
              if (group.deletions.length > 0) {
                html += group.deletions.map(line => `
                  <div class="diff-line deleted-line">
                    <span class="line-marker deleted">-</span>
                    <span class="line-content">${this.escapeHtml(line)}</span>
                  </div>
                `).join('');
              }
              if (group.additions.length > 0) {
                html += group.additions.map(line => `
                  <div class="diff-line added-line">
                    <span class="line-marker added">+</span>
                    <span class="line-content">${this.escapeHtml(line)}</span>
                  </div>
                `).join('');
              }
              return html;
            }
            return '';
          }).join('')}
        </div>
      </div>`;
    }
  }

  groupDiffLines(lines) {
    const groups = [];
    let currentGroup = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('@@')) {
        // Finish current group and start hunk header
        if (currentGroup) groups.push(currentGroup);
        groups.push({ type: 'hunk', content: line });
        currentGroup = null;
      } else if (trimmed.startsWith('+')) {
        // Addition
        const content = line.substring(1);
        if (!currentGroup || currentGroup.type !== 'change') {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { type: 'change', deletions: [], additions: [] };
        }
        currentGroup.additions.push(content);
      } else if (trimmed.startsWith('-')) {
        // Deletion
        const content = line.substring(1);
        if (!currentGroup || currentGroup.type !== 'change') {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { type: 'change', deletions: [], additions: [] };
        }
        currentGroup.deletions.push(content);
      } else if (trimmed.startsWith(' ') || (!trimmed.startsWith('+') && !trimmed.startsWith('-'))) {
        // Context line
        const content = line.startsWith(' ') ? line.substring(1) : line;
        if (!currentGroup || currentGroup.type !== 'context') {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { type: 'context', lines: [] };
        }
        currentGroup.lines.push(content);
      }
    }
    
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async showCheckpointDiff() {
    if (!this.selectedCheckpoint) {
      this.showToast('No checkpoint selected', 'error');
      return;
    }

    // Find previous checkpoint for comparison
    const currentIndex = this.projectCheckpoints.findIndex(c => c.id === this.selectedCheckpoint.id);
    if (currentIndex >= this.projectCheckpoints.length - 1) {
      this.showToast('No previous checkpoint for comparison', 'error');
      return;
    }

    const previousCheckpoint = this.projectCheckpoints[currentIndex + 1];

    try {
      console.log(`📊 Getting diff between ${this.selectedCheckpoint.id} and ${previousCheckpoint.id}`);
      
      const response = await fetch('/api/checkpoint/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentId: this.selectedCheckpoint.id,
          previousId: previousCheckpoint.id
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showDiffModal(result.data);
      } else {
        throw new Error(result.error || 'Failed to get diff');
      }
    } catch (error) {
      console.error('Error getting checkpoint diff:', error);
      this.showToast('Failed to load checkpoint diff', 'error');
    }
  }

  canShowDiff(checkpoint) {
    if (!this.projectCheckpoints) return false;
    const checkpointIndex = this.projectCheckpoints.findIndex(c => c.id === checkpoint.id);
    return checkpointIndex < this.projectCheckpoints.length - 1;
  }

  hasChanges(checkpoint) {
    // Check if checkpoint has any files and file count > 0
    if (!checkpoint.fileCount || checkpoint.fileCount === 0) {
      return false;
    }
    
    // Additional check: if we have files array, ensure there are actual files
    if (checkpoint.files && Array.isArray(checkpoint.files)) {
      return checkpoint.files.length > 0;
    }
    
    // For a more accurate check, we could call the diff API, but for performance
    // we'll assume fileCount > 0 means there are changes
    // The final filtering will happen in showDiffModal() anyway
    return true;
  }

  // Async method to check if checkpoint has actual content changes
  async hasActualChanges(checkpoint) {
    if (!this.canShowDiff(checkpoint)) return false;
    
    const currentIndex = this.projectCheckpoints.findIndex(c => c.id === checkpoint.id);
    if (currentIndex >= this.projectCheckpoints.length - 1) return false;
    
    const previousCheckpoint = this.projectCheckpoints[currentIndex + 1];
    
    try {
      const response = await fetch('/api/checkpoint/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentId: checkpoint.id,
          previousId: previousCheckpoint.id
        })
      });
      
      const result = await response.json();
      
      if (result.success && result.data.changes) {
        // Filter out files with no actual changes (same logic as showDiffModal)
        const filteredChanges = result.data.changes.filter(change => {
          if (change.type === 'added' || change.type === 'deleted') {
            return true;
          }
          return change.diff && change.diff.trim() && !change.diff.includes('No content changes detected');
        });
        
        return filteredChanges.length > 0;
      }
      
      return false;
    } catch (error) {
      console.warn('Error checking for actual changes:', error);
      return true; // Assume there are changes if we can't check
    }
  }

  async updateDiffButtonState(checkpoint) {
    const diffBtns = document.querySelectorAll('#diff-btn');
    
    // First, do a quick sync check
    if (!this.canShowDiff(checkpoint)) {
      diffBtns.forEach(btn => {
        btn.disabled = true;
        btn.textContent = '📊 Compare (No Previous)';
        btn.title = 'No previous checkpoint to compare with';
      });
      return;
    }
    
    if (!this.hasChanges(checkpoint)) {
      diffBtns.forEach(btn => {
        btn.disabled = true;
        btn.textContent = '📊 Compare (No Files)';
        btn.title = 'This checkpoint has no files';
      });
      return;
    }
    
    // Set initial state while checking
    diffBtns.forEach(btn => {
      btn.disabled = true;
      btn.textContent = '📊 Checking...';
      btn.title = 'Checking for changes...';
    });
    
    // Now do the async check for actual content changes
    const hasActualChanges = await this.hasActualChanges(checkpoint);
    
    diffBtns.forEach(btn => {
      if (hasActualChanges) {
        btn.disabled = false;
        btn.textContent = '📊 Compare';
        btn.title = 'Compare with previous checkpoint';
      } else {
        btn.disabled = true;
        btn.textContent = '📊 Compare (No Changes)';
        btn.title = 'This checkpoint has no actual content changes';
      }
    });
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('🌟 DOM loaded, initializing CCheckpoint App...');
  window.app = new CCheckpointApp();
});

// Global error handler
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  if (window.app) {
    window.app.showToast('An unexpected error occurred', 'error');
  }
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  if (window.app) {
    window.app.showToast('An unexpected error occurred', 'error');
  }
  e.preventDefault();
});