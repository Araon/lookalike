/**
 * Popup UI Controller for Lookalike Extension
 */

// DOM Elements
const elements = {
  totalTabs: document.getElementById('total-tabs'),
  totalGroups: document.getElementById('total-groups'),
  analyzedTabs: document.getElementById('analyzed-tabs'),
  regroupBtn: document.getElementById('regroup-btn'),
  ungroupBtn: document.getElementById('ungroup-btn'),
  groupsList: document.getElementById('groups-list'),
  ungroupedList: document.getElementById('ungrouped-list'),
  loading: document.getElementById('loading'),
  emptyState: document.getElementById('empty-state'),
  analyzeCurrentBtn: document.getElementById('analyze-current'),
  clearCacheBtn: document.getElementById('clear-cache')
};

// State
let state = {
  tabThemes: {},
  themeGroups: {},
  allTabs: []
};

/**
 * Initialize the popup
 */
async function init() {
  showLoading(true);
  
  try {
    // Get all tabs in current window
    state.allTabs = await chrome.tabs.query({ currentWindow: true });
    
    // Get state from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    
    if (response) {
      state.tabThemes = response.tabThemes || {};
      state.themeGroups = response.themeGroups || {};
    }
    
    renderUI();
  } catch (error) {
    console.error('Lookalike Popup: Error initializing', error);
    showToast('Failed to load tab data', 'error');
  } finally {
    showLoading(false);
  }
  
  // Set up event listeners
  setupEventListeners();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  elements.regroupBtn.addEventListener('click', handleRegroup);
  elements.ungroupBtn.addEventListener('click', handleUngroup);
  elements.analyzeCurrentBtn.addEventListener('click', handleAnalyzeCurrent);
  elements.clearCacheBtn.addEventListener('click', handleClearCache);
  
  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'THEME_UPDATE') {
      state.tabThemes = message.data.tabThemes || {};
      state.themeGroups = message.data.themeGroups || {};
      renderUI();
    }
  });
}

/**
 * Render the entire UI
 */
function renderUI() {
  updateStats();
  renderGroups();
  renderUngroupedTabs();
  
  const hasData = Object.keys(state.tabThemes).length > 0 || Object.keys(state.themeGroups).length > 0;
  elements.emptyState.classList.toggle('visible', !hasData);
}

/**
 * Update statistics display
 */
function updateStats() {
  elements.totalTabs.textContent = state.allTabs.length;
  elements.totalGroups.textContent = Object.keys(state.themeGroups).length;
  elements.analyzedTabs.textContent = Object.keys(state.tabThemes).length;
}

/**
 * Render tab groups
 */
function renderGroups() {
  elements.groupsList.innerHTML = '';
  
  if (Object.keys(state.themeGroups).length === 0) {
    return;
  }
  
  for (const [themeName, groupData] of Object.entries(state.themeGroups)) {
    const groupCard = createGroupCard(themeName, groupData);
    elements.groupsList.appendChild(groupCard);
  }
}

/**
 * Create a group card element
 */
function createGroupCard(themeName, groupData) {
  const card = document.createElement('div');
  card.className = 'group-card';
  
  // Get tabs in this group
  const groupTabs = groupData.tabIds
    .map(tabId => {
      const tab = state.allTabs.find(t => t.id === tabId);
      const theme = state.tabThemes[tabId];
      return { tab, theme };
    })
    .filter(({ tab }) => tab);
  
  // Get keywords from first tab's theme
  const keywords = state.tabThemes[groupData.tabIds[0]]?.keywords || [];
  
  card.innerHTML = `
    <div class="group-header">
      <div class="group-color ${groupData.color || 'grey'}"></div>
      <div class="group-info">
        <div class="group-name">${escapeHtml(groupData.groupName || themeName)}</div>
        <div class="group-count">${groupTabs.length} tabs</div>
      </div>
      <svg class="group-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 9l-7 7-7-7"/>
      </svg>
    </div>
    ${keywords.length > 0 ? `
    <div class="keywords">
      ${keywords.slice(0, 5).map(k => `<span class="keyword">${escapeHtml(k)}</span>`).join('')}
    </div>
    ` : ''}
    <div class="group-tabs">
      ${groupTabs.map(({ tab }) => createTabItemHTML(tab)).join('')}
    </div>
  `;
  
  // Toggle expansion
  const header = card.querySelector('.group-header');
  header.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });
  
  // Tab click handlers
  card.querySelectorAll('.tab-item').forEach((tabItem, index) => {
    tabItem.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = groupTabs[index].tab;
      if (tab) {
        chrome.tabs.update(tab.id, { active: true });
        window.close();
      }
    });
  });
  
  return card;
}

/**
 * Render ungrouped tabs
 */
function renderUngroupedTabs() {
  elements.ungroupedList.innerHTML = '';
  
  // Find tabs that are analyzed but not in any group
  const groupedTabIds = new Set();
  for (const groupData of Object.values(state.themeGroups)) {
    groupData.tabIds.forEach(id => groupedTabIds.add(id));
  }
  
  const ungroupedTabs = state.allTabs.filter(tab => {
    return state.tabThemes[tab.id] && !groupedTabIds.has(tab.id);
  });
  
  if (ungroupedTabs.length === 0) {
    elements.ungroupedList.innerHTML = '<div class="tab-item" style="justify-content: center; color: var(--text-muted);">No ungrouped analyzed tabs</div>';
    return;
  }
  
  ungroupedTabs.forEach(tab => {
    const tabItem = createTabItem(tab);
    elements.ungroupedList.appendChild(tabItem);
  });
}

/**
 * Create a tab item element
 */
function createTabItem(tab) {
  const div = document.createElement('div');
  div.className = 'tab-item';
  div.innerHTML = createTabItemHTML(tab);
  
  div.addEventListener('click', () => {
    chrome.tabs.update(tab.id, { active: true });
    window.close();
  });
  
  return div;
}

/**
 * Create tab item HTML
 */
function createTabItemHTML(tab) {
  const theme = state.tabThemes[tab.id];
  const favicon = tab.favIconUrl;
  const url = new URL(tab.url || 'about:blank').hostname;
  
  return `
    ${favicon ? 
      `<img class="tab-favicon" src="${escapeHtml(favicon)}" alt="">` :
      `<div class="tab-favicon-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>`
    }
    <div class="tab-info">
      <div class="tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
      <div class="tab-url">${escapeHtml(url)}</div>
    </div>
    ${theme ? `<span class="tab-theme">${escapeHtml(theme.primary)}</span>` : ''}
  `;
}

/**
 * Handle regroup all button
 */
async function handleRegroup() {
  elements.regroupBtn.disabled = true;
  showToast('Regrouping tabs...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'REGROUP_ALL' });
    
    if (response.success) {
      showToast('Tabs regrouped successfully!', 'success');
      
      // Refresh state
      const stateResponse = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (stateResponse) {
        state.tabThemes = stateResponse.tabThemes || {};
        state.themeGroups = stateResponse.themeGroups || {};
        state.allTabs = await chrome.tabs.query({ currentWindow: true });
        renderUI();
      }
    } else {
      showToast(response.error || 'Failed to regroup', 'error');
    }
  } catch (error) {
    showToast('Error regrouping tabs', 'error');
  } finally {
    elements.regroupBtn.disabled = false;
  }
}

/**
 * Handle ungroup all button
 */
async function handleUngroup() {
  elements.ungroupBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'UNGROUP_ALL' });
    
    if (response.success) {
      showToast('All tabs ungrouped', 'success');
      
      // Refresh state
      state.themeGroups = {};
      state.allTabs = await chrome.tabs.query({ currentWindow: true });
      renderUI();
    } else {
      showToast(response.error || 'Failed to ungroup', 'error');
    }
  } catch (error) {
    showToast('Error ungrouping tabs', 'error');
  } finally {
    elements.ungroupBtn.disabled = false;
  }
}

/**
 * Handle analyze current tab button
 */
async function handleAnalyzeCurrent() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab) {
      showToast('No active tab found', 'error');
      return;
    }
    
    showToast('Analyzing tab...', 'info');
    
    const response = await chrome.runtime.sendMessage({ 
      type: 'ANALYZE_TAB', 
      tabId: activeTab.id 
    });
    
    if (response && !response.error) {
      showToast(`Theme: ${response.primary}`, 'success');
      
      // Refresh state
      const stateResponse = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (stateResponse) {
        state.tabThemes = stateResponse.tabThemes || {};
        state.themeGroups = stateResponse.themeGroups || {};
        renderUI();
      }
    } else {
      showToast(response?.error || 'Failed to analyze', 'error');
    }
  } catch (error) {
    showToast('Error analyzing tab', 'error');
  }
}

/**
 * Handle clear cache button
 */
async function handleClearCache() {
  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    state.tabThemes = {};
    state.themeGroups = {};
    renderUI();
    showToast('Cache cleared', 'success');
  } catch (error) {
    showToast('Error clearing cache', 'error');
  }
}

/**
 * Show/hide loading state
 */
function showLoading(show) {
  elements.loading.classList.toggle('visible', show);
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  
  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

