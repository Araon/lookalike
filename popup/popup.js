/**
 * Popup UI Controller for Lookalike Extension
 * Updated for semantic grouping
 */

// DOM Elements
const elements = {
  totalTabs: document.getElementById('total-tabs'),
  totalGroups: document.getElementById('total-groups'),
  modelStatus: document.getElementById('model-status'),
  analyzeAllBtn: document.getElementById('analyze-all-btn'),
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
  modelStatus: 'idle',
  tabs: [],
  groups: [],
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
      state.modelStatus = response.modelStatus || 'idle';
      state.tabs = response.tabs || [];
      state.groups = response.groups || [];
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
  elements.analyzeAllBtn.addEventListener('click', handleAnalyzeAll);
  elements.regroupBtn.addEventListener('click', handleRegroup);
  elements.ungroupBtn.addEventListener('click', handleUngroup);
  elements.analyzeCurrentBtn.addEventListener('click', handleAnalyzeCurrent);
  elements.clearCacheBtn.addEventListener('click', handleClearCache);
  
  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      state.modelStatus = message.data.modelStatus || state.modelStatus;
      state.tabs = message.data.tabs || [];
      state.groups = message.data.groups || [];
      renderUI();
    } else if (message.type === 'MODEL_READY') {
      state.modelStatus = 'ready';
      updateModelStatus();
      showToast('Semantic model ready', 'success');
    } else if (message.type === 'MODEL_ERROR') {
      state.modelStatus = 'error';
      updateModelStatus();
      showToast('Model failed to load', 'error');
    } else if (message.type === 'MODEL_PROGRESS') {
      updateModelProgress(message.progress);
    } else if (message.type === 'ANALYSIS_PROGRESS') {
      updateAnalysisProgress(message.progress, message.completed, message.total);
    }
  });
}

/**
 * Update model loading progress
 */
function updateModelProgress(progress) {
  const statusEl = elements.modelStatus;
  const textEl = statusEl.querySelector('.model-status-text');
  
  if (textEl) {
    textEl.textContent = `Loading model... ${progress}%`;
  }
}

/**
 * Update analysis progress
 */
function updateAnalysisProgress(progress, completed, total) {
  const btn = elements.analyzeAllBtn;
  if (!btn) return;
  
  // Update button text with progress
  const originalText = btn.dataset.originalText || btn.textContent;
  if (!btn.dataset.originalText) {
    btn.dataset.originalText = originalText;
  }
  
  btn.textContent = `Analyzing... ${completed}/${total} (${progress}%)`;
}

/**
 * Render the entire UI
 */
function renderUI() {
  updateModelStatus();
  updateStats();
  renderGroups();
  renderUngroupedTabs();
  
  const hasData = state.tabs.length > 0 || state.groups.length > 0;
  elements.emptyState.classList.toggle('visible', !hasData);
}

/**
 * Update model status display
 */
function updateModelStatus() {
  const statusEl = elements.modelStatus;
  const textEl = statusEl.querySelector('.model-status-text');
  const iconEl = statusEl.querySelector('.model-status-icon');
  
  switch (state.modelStatus) {
    case 'loading':
      statusEl.className = 'model-status loading';
      textEl.textContent = 'Loading semantic model...';
      iconEl.innerHTML = '<div class="spinner-small"></div>';
      break;
    case 'ready':
      statusEl.className = 'model-status ready';
      textEl.textContent = 'Semantic AI ready';
      iconEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
      `;
      // Hide after a delay
      setTimeout(() => {
        statusEl.classList.add('hidden');
      }, 2000);
      break;
    case 'error':
      statusEl.className = 'model-status error';
      textEl.textContent = 'Model failed to load';
      iconEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M15 9l-6 6M9 9l6 6"></path>
        </svg>
      `;
      break;
    default:
      statusEl.className = 'model-status';
      textEl.textContent = 'Initializing...';
      iconEl.innerHTML = '<div class="spinner-small"></div>';
  }
}

/**
 * Update statistics display
 */
function updateStats() {
  const analyzedCount = state.tabs.filter(t => !t.pending).length;
  if (elements.totalTabs) elements.totalTabs.textContent = analyzedCount;
  if (elements.totalGroups) elements.totalGroups.textContent = state.groups.length;
}

/**
 * Render tab groups
 */
function renderGroups() {
  elements.groupsList.innerHTML = '';
  
  if (state.groups.length === 0) {
    return;
  }
  
  for (const group of state.groups) {
    const groupCard = createGroupCard(group);
    elements.groupsList.appendChild(groupCard);
  }
}

/**
 * Create a group card element
 */
function createGroupCard(group) {
  const card = document.createElement('div');
  card.className = 'group-card';
  
  // Get tabs in this group
  const groupTabs = group.tabIds
    .map(tabId => {
      const tab = state.allTabs.find(t => t.id === tabId);
      const tabData = state.tabs.find(t => t.tabId === tabId);
      return { tab, tabData };
    })
    .filter(({ tab }) => tab);
  
  // Get key phrases for the group
  const keyPhrases = groupTabs
    .flatMap(({ tabData }) => tabData?.keyPhrases || [])
    .slice(0, 3);
  
  card.innerHTML = `
    <div class="group-header">
      <div class="group-color-dot" data-color="${group.color || 'grey'}"></div>
      <div class="group-info">
        <div class="group-name">${escapeHtml(group.groupName)}</div>
        ${keyPhrases.length > 0 ? `
          <div class="group-keywords">${keyPhrases.map(k => escapeHtml(k)).join(' · ')}</div>
        ` : ''}
      </div>
      <div class="group-meta">${groupTabs.length}</div>
      <svg class="group-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 9l-7 7-7-7"/>
      </svg>
    </div>
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
  for (const group of state.groups) {
    group.tabIds.forEach(id => groupedTabIds.add(id));
  }
  
  const ungroupedTabs = state.tabs
    .filter(t => !t.pending && !groupedTabIds.has(t.tabId))
    .map(t => ({
      tabData: t,
      tab: state.allTabs.find(at => at.id === t.tabId)
    }))
    .filter(({ tab }) => tab);
  
  if (ungroupedTabs.length === 0) {
    return;
  }
  
  const section = document.createElement('div');
  section.className = 'ungrouped-section';
  section.innerHTML = `
    <div class="section-title">
      <span>Ungrouped</span>
      <span class="section-count">${ungroupedTabs.length}</span>
    </div>
  `;
  
  ungroupedTabs.forEach(({ tab, tabData }) => {
    const tabItem = createTabItem(tab, tabData);
    section.appendChild(tabItem);
  });
  
  elements.ungroupedList.appendChild(section);
}

/**
 * Create a tab item element
 */
function createTabItem(tab, tabData) {
  const div = document.createElement('div');
  div.className = 'tab-item';
  div.innerHTML = createTabItemHTML(tab, tabData);
  
  div.addEventListener('click', () => {
    chrome.tabs.update(tab.id, { active: true });
  });
  
  return div;
}

/**
 * Create tab item HTML
 */
function createTabItemHTML(tab, _tabData = null) {
  const favicon = tab.favIconUrl;
  let hostname = '';
  try {
    hostname = new URL(tab.url || 'about:blank').hostname.replace('www.', '');
  } catch {
    hostname = '';
  }
  
  return `
    ${favicon ? 
      `<img class="tab-favicon" src="${escapeHtml(favicon)}" alt="" onerror="this.style.display='none'">` :
      `<div class="tab-favicon placeholder">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </div>`
    }
    <div class="tab-content">
      <div class="tab-title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title || 'Untitled')}</div>
      <div class="tab-url">${escapeHtml(hostname)}</div>
    </div>
  `;
}

/**
 * Handle analyze all tabs with progress feedback
 */
async function handleAnalyzeAll() {
  const btn = elements.analyzeAllBtn;
  const originalText = btn.textContent;
  btn.dataset.originalText = originalText;
  
  btn.disabled = true;
  btn.classList.add('loading');
  showToast('Analyzing all tabs...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_ALL' });
    
    if (response.success) {
      const resultMsg = response.errors > 0 
        ? `Analyzed ${response.analyzed} tabs (${response.errors} failed)`
        : `Analyzed ${response.analyzed} tabs`;
      showToast(resultMsg, response.errors > 0 ? 'info' : 'success');
      
      // Refresh state
      await refreshState();
    } else {
      showToast(response.error || 'Failed to analyze', 'error');
    }
  } catch (error) {
    showToast('Error analyzing tabs', 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = originalText;
    delete btn.dataset.originalText;
  }
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
      showToast('Tabs regrouped', 'success');
      await refreshState();
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
      showToast('Tabs ungrouped', 'success');
      state.groups = [];
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
      showToast('No active tab', 'error');
      return;
    }
    
    showToast('Analyzing...', 'info');
    
    const response = await chrome.runtime.sendMessage({ 
      type: 'ANALYZE_TAB', 
      tabId: activeTab.id 
    });
    
    if (response && !response.error) {
      showToast('Tab analyzed', 'success');
      await refreshState();
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
    state.tabs = [];
    state.groups = [];
    renderUI();
    showToast('All data cleared', 'success');
  } catch (error) {
    showToast('Error clearing cache', 'error');
  }
}

/**
 * Refresh state from background
 */
async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (response) {
    state.modelStatus = response.modelStatus || state.modelStatus;
    state.tabs = response.tabs || [];
    state.groups = response.groups || [];
    state.allTabs = await chrome.tabs.query({ currentWindow: true });
    renderUI();
  }
}

/**
 * Show/hide loading state
 */
function showLoading(show) {
  if (elements.loading) elements.loading.classList.toggle('visible', show);
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  
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
