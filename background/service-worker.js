/**
 * Background Service Worker for Lookalike Tab Grouping Extension
 * Manages tab analysis, semantic grouping, and coordination
 * Uses offscreen document for ML model inference
 */

// Store tab semantic data
const tabSemantics = new Map(); // tabId -> semantic data (embedding, keyPhrases, etc.)
const activeGroups = new Map(); // groupId -> { tabIds, groupName, color }

// Similarity threshold for semantic grouping
const SIMILARITY_THRESHOLD = 0.45;

// Track model and offscreen state
let modelStatus = 'idle';
let offscreenCreated = false;
let offscreenReady = false;
let modelInitPromise = null;
let offscreenReadyPromise = null;
let offscreenReadyResolve = null;

// Create promise for offscreen ready state
function resetOffscreenReadyPromise() {
  offscreenReadyPromise = new Promise((resolve) => {
    offscreenReadyResolve = resolve;
  });
}
resetOffscreenReadyPromise();

/**
 * Create offscreen document if not already created
 */
async function ensureOffscreen() {
  // Check if offscreen document already exists
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen/offscreen.html')]
    });
    
    if (existingContexts.length > 0) {
      offscreenCreated = true;
      // If it exists but we don't know if it's ready, wait a bit
      if (!offscreenReady) {
        // Give existing offscreen document time to signal ready
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }
  } catch (e) {
    console.log('Lookalike: Error checking offscreen contexts', e);
  }
  
  if (offscreenCreated) return;
  
  try {
    // Create offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run ML model inference with DOM APIs (URL.createObjectURL for WASM)'
    });
    
    offscreenCreated = true;
    console.log('Lookalike: Offscreen document created');
  } catch (e) {
    if (e.message?.includes('single offscreen')) {
      // Already exists, that's fine
      offscreenCreated = true;
      console.log('Lookalike: Offscreen document already exists');
    } else {
      throw e;
    }
  }
}

/**
 * Wait for offscreen document to be ready
 */
async function waitForOffscreen() {
  await ensureOffscreen();
  
  if (offscreenReady) return;
  
  // Wait for ready signal with timeout
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Offscreen ready timeout')), 10000)
  );
  
  try {
    await Promise.race([offscreenReadyPromise, timeout]);
  } catch (e) {
    console.log('Lookalike: Offscreen ready timeout, attempting anyway...');
  }
}

/**
 * Send message to offscreen document
 */
async function sendToOffscreen(message) {
  await waitForOffscreen();
  
  return new Promise((resolve, reject) => {
    // Add target to message so offscreen knows it's for them
    chrome.runtime.sendMessage({ ...message, target: 'offscreen' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Initialize the extension
 */
async function initialize() {
  console.log('Lookalike: Initializing extension...');
  
  try {
    // Create offscreen document and start loading model
    await ensureOffscreen();
    
    modelStatus = 'loading';
    modelInitPromise = sendToOffscreen({ type: 'INIT_MODEL' });
    
    modelInitPromise
      .then((result) => {
        if (result?.success) {
          modelStatus = 'ready';
          console.log('Lookalike: Semantic model ready');
          notifyPopup({ type: 'MODEL_READY' });
        } else {
          modelStatus = 'error';
          console.error('Lookalike: Model failed to load', result?.error);
          notifyPopup({ type: 'MODEL_ERROR', error: result?.error });
        }
      })
      .catch(err => {
        modelStatus = 'error';
        console.error('Lookalike: Model failed to load', err);
        notifyPopup({ type: 'MODEL_ERROR', error: err.message });
      });
    
    await loadStoredData();
    console.log('Lookalike: Extension initialized successfully');
  } catch (error) {
    console.error('Lookalike: Failed to initialize', error);
  }
}

/**
 * Load stored semantic data from Chrome storage
 */
async function loadStoredData() {
  try {
    const data = await chrome.storage.local.get(['tabSemantics', 'activeGroups']);
    
    if (data.tabSemantics) {
      Object.entries(data.tabSemantics).forEach(([tabId, semantics]) => {
        tabSemantics.set(parseInt(tabId), semantics);
      });
    }
    
    if (data.activeGroups) {
      Object.entries(data.activeGroups).forEach(([groupId, groupData]) => {
        activeGroups.set(parseInt(groupId), groupData);
      });
    }
  } catch (error) {
    console.error('Lookalike: Error loading stored data', error);
  }
}

/**
 * Save semantic data to Chrome storage
 */
async function saveStoredData() {
  try {
    const tabSemanticsObj = Object.fromEntries(tabSemantics);
    const activeGroupsObj = Object.fromEntries(activeGroups);
    
    await chrome.storage.local.set({
      tabSemantics: tabSemanticsObj,
      activeGroups: activeGroupsObj
    });
  } catch (error) {
    console.error('Lookalike: Error saving data', error);
  }
}

/**
 * Process page content using semantic analysis
 */
async function processPageContent(tabId, content) {
  try {
    console.log(`Lookalike: Processing content for tab ${tabId}:`, content.title);
    
    // Check if model is ready
    if (modelStatus !== 'ready') {
      console.log('Lookalike: Model still loading, queueing tab...');
      // Store basic info and process when model is ready
      tabSemantics.set(tabId, {
        pending: true,
        content,
        url: content.url,
        title: content.title,
        timestamp: Date.now()
      });
      
      // Wait for model and then process
      if (modelInitPromise) {
        await modelInitPromise;
        if (modelStatus === 'ready') {
          return await processTabWithModel(tabId, content);
        }
      }
      return null;
    }
    
    return await processTabWithModel(tabId, content);
  } catch (error) {
    console.error(`Lookalike: Error processing content for tab ${tabId}`, error);
    throw error;
  }
}

/**
 * Process tab with loaded semantic model
 */
async function processTabWithModel(tabId, content) {
  try {
    // Send content to offscreen document for processing
    const result = await sendToOffscreen({
      type: 'PROCESS_CONTENT',
      content
    });
    
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to process content');
    }
    
    const semantics = result.data;
    
    // Store semantic data
    tabSemantics.set(tabId, {
      ...semantics,
      pending: false
    });
    
    // Re-cluster all tabs with new data
    await reclusterTabs();
    
    // Save data
    await saveStoredData();
    
    // Notify popup
    notifyPopup();
    
    return semantics;
  } catch (error) {
    console.error(`Lookalike: Error processing tab ${tabId} with model`, error);
    throw error;
  }
}

/**
 * Re-cluster all tabs based on semantic similarity
 */
async function reclusterTabs() {
  try {
    // Get current window
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab) return;
    
    const windowId = currentTab.windowId;
    
    // Filter to processed tabs in current window
    const validTabs = {};
    
    for (const [tabId, data] of tabSemantics.entries()) {
      if (data.pending || !data.embedding) continue;
      
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId === windowId) {
          validTabs[tabId] = data;
        }
      } catch {
        // Tab doesn't exist, clean up
        tabSemantics.delete(tabId);
      }
    }
    
    if (Object.keys(validTabs).length < 2) return;
    
    // Send to offscreen for clustering
    const result = await sendToOffscreen({
      type: 'CLUSTER_TABS',
      tabsData: validTabs,
      threshold: SIMILARITY_THRESHOLD
    });
    
    if (!result?.success) {
      console.error('Lookalike: Clustering failed', result?.error);
      return;
    }
    
    const clusters = result.clusters;
    
    if (clusters.length === 0) return;
    
    // Apply clusters as Chrome tab groups
    for (const cluster of clusters) {
      await applyClusterAsGroup(cluster);
    }
    
  } catch (error) {
    console.error('Lookalike: Error reclustering tabs', error);
  }
}

/**
 * Apply a semantic cluster as a Chrome tab group
 */
async function applyClusterAsGroup(cluster) {
  try {
    const tabIds = cluster.tabs.map(t => t.tabId);
    
    if (tabIds.length < 2) return;
    
    // Check if these tabs are already in a group together
    const existingGroups = new Map();
    for (const tabId of tabIds) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          const count = existingGroups.get(tab.groupId) || 0;
          existingGroups.set(tab.groupId, count + 1);
        }
      } catch {
        // Tab might be gone
      }
    }
    
    // Find if there's an existing group with most of these tabs
    let targetGroupId = null;
    let maxCount = 0;
    
    for (const [groupId, count] of existingGroups.entries()) {
      if (count > maxCount && count >= tabIds.length / 2) {
        maxCount = count;
        targetGroupId = groupId;
      }
    }
    
    if (targetGroupId) {
      // Add tabs to existing group
      await chrome.tabs.group({
        tabIds,
        groupId: targetGroupId
      });
      
      // Update group name if it's different
      await chrome.tabGroups.update(targetGroupId, {
        title: cluster.groupName,
        color: cluster.color
      });
      
      // Update tracking
      activeGroups.set(targetGroupId, {
        tabIds,
        groupName: cluster.groupName,
        color: cluster.color
      });
    } else {
      // Create new group
      const groupId = await chrome.tabs.group({ tabIds });
      
      await chrome.tabGroups.update(groupId, {
        title: cluster.groupName,
        color: cluster.color,
        collapsed: false
      });
      
      activeGroups.set(groupId, {
        tabIds,
        groupName: cluster.groupName,
        color: cluster.color
      });
      
      console.log(`Lookalike: Created group "${cluster.groupName}" with ${tabIds.length} tabs`);
    }
  } catch (error) {
    console.error('Lookalike: Error applying cluster as group', error);
  }
}

/**
 * Handle tab removal
 */
async function handleTabRemoved(tabId) {
  tabSemantics.delete(tabId);
  
  // Update active groups
  for (const [groupId, groupData] of activeGroups.entries()) {
    if (groupData.tabIds.includes(tabId)) {
      groupData.tabIds = groupData.tabIds.filter(id => id !== tabId);
      if (groupData.tabIds.length <= 1) {
        activeGroups.delete(groupId);
      }
    }
  }
  
  await saveStoredData();
  notifyPopup();
}

/**
 * Handle tab update
 */
async function handleTabUpdated(_tabId, _changeInfo, _tab) {
  // Content script will send updated content
}

/**
 * Notify popup about updates
 */
function notifyPopup(customData = null) {
  const message = customData || {
    type: 'STATE_UPDATE',
    data: getCurrentState()
  };
  
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might not be open
  });
}

/**
 * Get current state for popup
 */
function getCurrentState() {
  const semanticsArray = Array.from(tabSemantics.entries()).map(([tabId, data]) => ({
    tabId,
    title: data.title,
    url: data.url,
    keyPhrases: data.keyPhrases?.slice(0, 5) || [],
    pending: data.pending || false
  }));
  
  const groupsArray = Array.from(activeGroups.entries()).map(([groupId, data]) => ({
    groupId,
    ...data
  }));
  
  return {
    modelStatus,
    tabs: semanticsArray,
    groups: groupsArray,
    totalTabs: tabSemantics.size
  };
}

/**
 * Force regroup all analyzed tabs
 */
async function regroupAllTabs() {
  try {
    // First, ungroup all
    await ungroupAllTabs();
    
    // Reset colors in offscreen
    await sendToOffscreen({ type: 'RESET_COLORS' });
    
    // Re-cluster with semantic analysis
    await reclusterTabs();
    
    await saveStoredData();
    notifyPopup();
    
    return { success: true };
  } catch (error) {
    console.error('Lookalike: Error regrouping tabs', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ungroup all tabs
 */
async function ungroupAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    for (const tab of tabs) {
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        try {
          await chrome.tabs.ungroup(tab.id);
        } catch {
          // Tab might already be ungrouped
        }
      }
    }
    
    activeGroups.clear();
    await saveStoredData();
    notifyPopup();
    
    return { success: true };
  } catch (error) {
    console.error('Lookalike: Error ungrouping tabs', error);
    return { success: false, error: error.message };
  }
}

/**
 * Analyze a specific tab
 */
async function analyzeTab(tabId) {
  try {
    // Ensure model is loaded
    if (modelStatus !== 'ready') {
      if (modelInitPromise) {
        await modelInitPromise;
        if (modelStatus !== 'ready') {
          throw new Error('Model not available');
        }
      } else {
        throw new Error('Model not available');
      }
    }
    
    // Inject content script and get content
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title || '';
        const metaDescription = document.querySelector('meta[name="description"]')?.content || 
                               document.querySelector('meta[property="og:description"]')?.content || '';
        const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
        
        // Get main content
        const mainSelectors = ['main', 'article', '[role="main"]', '#content', '.content'];
        let mainContent = '';
        
        for (const selector of mainSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            mainContent = el.textContent?.substring(0, 5000) || '';
            break;
          }
        }
        
        if (!mainContent) {
          mainContent = document.body?.textContent?.substring(0, 5000) || '';
        }
        
        return {
          title,
          url: window.location.href,
          metaDescription,
          ogTitle,
          mainContent: mainContent.replace(/\s+/g, ' ').trim(),
          headings: Array.from(document.querySelectorAll('h1, h2, h3'))
            .slice(0, 10)
            .map(h => ({ level: parseInt(h.tagName[1]), text: h.textContent?.trim() }))
        };
      }
    });
    
    if (results && results[0]?.result) {
      return await processPageContent(tabId, results[0].result);
    }
  } catch (error) {
    console.error(`Lookalike: Error analyzing tab ${tabId}`, error);
    throw error;
  }
}

/**
 * Analyze all tabs in current window
 */
async function analyzeAllTabs() {
  try {
    // Ensure model is loaded first
    if (modelStatus !== 'ready') {
      if (modelInitPromise) {
        await modelInitPromise;
        if (modelStatus !== 'ready') {
          throw new Error('Model not available');
        }
      } else {
        throw new Error('Model not available');
      }
    }
    
    const tabs = await chrome.tabs.query({ currentWindow: true });
    let analyzed = 0;
    let errors = 0;
    
    for (const tab of tabs) {
      // Skip special pages
      if (!tab.url || 
          tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:')) {
        continue;
      }
      
      try {
        await analyzeTab(tab.id);
        analyzed++;
      } catch (err) {
        console.error(`Failed to analyze tab ${tab.id}:`, err);
        errors++;
      }
    }
    
    return { success: true, analyzed, errors };
  } catch (error) {
    console.error('Lookalike: Error analyzing all tabs', error);
    return { success: false, error: error.message };
  }
}

/**
 * Adjust similarity threshold
 */
function setSimilarityThreshold(threshold) {
  if (typeof threshold === 'number' && threshold >= 0 && threshold <= 1) {
    console.log(`Lookalike: Similarity threshold set to ${threshold}`);
    return { success: true };
  }
  return { success: false, error: 'Invalid threshold value' };
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages meant for offscreen document
  if (message.target === 'offscreen') {
    return false;
  }
  
  // Handle messages from offscreen document
  if (message.type === 'OFFSCREEN_READY') {
    console.log('Lookalike: Offscreen document ready');
    offscreenReady = true;
    if (offscreenReadyResolve) {
      offscreenReadyResolve();
    }
    return;
  }
  
  if (message.type === 'MODEL_READY') {
    modelStatus = 'ready';
    notifyPopup({ type: 'MODEL_READY' });
    return;
  }
  
  if (message.type === 'MODEL_ERROR') {
    modelStatus = 'error';
    notifyPopup({ type: 'MODEL_ERROR', error: message.error });
    return;
  }
  
  if (message.type === 'MODEL_PROGRESS') {
    notifyPopup({ type: 'MODEL_PROGRESS', progress: message.progress });
    return;
  }
  
  const handleAsync = async () => {
    switch (message.type) {
      case 'PAGE_CONTENT':
        if (sender.tab?.id) {
          return await processPageContent(sender.tab.id, message.data);
        }
        break;
        
      case 'GET_STATE':
        return getCurrentState();
        
      case 'REGROUP_ALL':
        return await regroupAllTabs();
        
      case 'UNGROUP_ALL':
        return await ungroupAllTabs();
        
      case 'ANALYZE_TAB':
        return await analyzeTab(message.tabId);
        
      case 'ANALYZE_ALL':
        return await analyzeAllTabs();
        
      case 'SET_THRESHOLD':
        return setSimilarityThreshold(message.threshold);
        
      case 'CLEAR_CACHE':
        await sendToOffscreen({ type: 'CLEAR_CACHE' });
        tabSemantics.clear();
        activeGroups.clear();
        await saveStoredData();
        return { success: true };
        
      case 'GET_MODEL_STATUS':
        return { status: modelStatus };
        
      default:
        console.log('Lookalike: Unknown message type', message.type);
    }
  };
  
  handleAsync()
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ error: error.message }));
  
  return true; // Keep message channel open for async response
});

// Tab event listeners
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onUpdated.addListener(handleTabUpdated);

// Clean up when a tab group is removed
chrome.tabGroups.onRemoved.addListener((group) => {
  activeGroups.delete(group.id);
  saveStoredData();
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Lookalike: Extension installed/updated');
  initialize();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Lookalike: Browser started');
  initialize();
});

// Initialize immediately
initialize();
