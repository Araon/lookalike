/**
 * Background Service Worker for Lookalike Tab Grouping Extension
 * Manages tab analysis, grouping, and coordination
 */

import { llmProcessor, GROUP_COLORS } from './llm-processor.js';

// Store tab themes and groups
const tabThemes = new Map(); // tabId -> theme data
const themeGroups = new Map(); // theme -> { groupId, tabIds }

// Similarity threshold for grouping tabs
const SIMILARITY_THRESHOLD = 0.6;

/**
 * Initialize the extension
 */
async function initialize() {
  console.log('Lookalike: Initializing extension...');
  
  try {
    await llmProcessor.initialize();
    await loadStoredData();
    console.log('Lookalike: Extension initialized successfully');
  } catch (error) {
    console.error('Lookalike: Failed to initialize', error);
  }
}

/**
 * Load stored theme data from Chrome storage
 */
async function loadStoredData() {
  try {
    const data = await chrome.storage.local.get(['tabThemes', 'themeGroups']);
    
    if (data.tabThemes) {
      Object.entries(data.tabThemes).forEach(([tabId, theme]) => {
        tabThemes.set(parseInt(tabId), theme);
      });
    }
    
    if (data.themeGroups) {
      Object.entries(data.themeGroups).forEach(([theme, groupData]) => {
        themeGroups.set(theme, groupData);
      });
    }
  } catch (error) {
    console.error('Lookalike: Error loading stored data', error);
  }
}

/**
 * Save theme data to Chrome storage
 */
async function saveStoredData() {
  try {
    const tabThemesObj = Object.fromEntries(tabThemes);
    const themeGroupsObj = Object.fromEntries(themeGroups);
    
    await chrome.storage.local.set({
      tabThemes: tabThemesObj,
      themeGroups: themeGroupsObj
    });
  } catch (error) {
    console.error('Lookalike: Error saving data', error);
  }
}

/**
 * Process page content and extract theme
 */
async function processPageContent(tabId, content) {
  try {
    console.log(`Lookalike: Processing content for tab ${tabId}:`, content.title);
    
    // Extract theme from content
    const theme = await llmProcessor.extractTheme(content);
    
    // Store theme for this tab
    tabThemes.set(tabId, {
      ...theme,
      url: content.url,
      title: content.title,
      timestamp: Date.now()
    });
    
    // Find similar tabs and group
    await findAndGroupSimilarTabs(tabId, theme);
    
    // Save data
    await saveStoredData();
    
    // Notify popup if open
    notifyPopup();
    
    return theme;
  } catch (error) {
    console.error(`Lookalike: Error processing content for tab ${tabId}`, error);
    throw error;
  }
}

/**
 * Find tabs with similar themes and group them
 */
async function findAndGroupSimilarTabs(tabId, theme) {
  const similarTabs = [];
  
  // Find tabs with similar themes
  for (const [existingTabId, existingTheme] of tabThemes.entries()) {
    if (existingTabId === tabId) continue;
    
    // Check if tab still exists
    try {
      await chrome.tabs.get(existingTabId);
    } catch {
      // Tab doesn't exist, remove from map
      tabThemes.delete(existingTabId);
      continue;
    }
    
    const similarity = llmProcessor.calculateSimilarity(theme, existingTheme);
    
    if (similarity >= SIMILARITY_THRESHOLD) {
      similarTabs.push({
        tabId: existingTabId,
        theme: existingTheme,
        similarity
      });
    }
  }
  
  if (similarTabs.length === 0) {
    // No similar tabs, check if this tab should start a new potential group
    return;
  }
  
  // Group tabs together
  const allTabIds = [tabId, ...similarTabs.map(t => t.tabId)];
  await createOrUpdateTabGroup(theme, allTabIds);
}

/**
 * Create or update a Chrome tab group
 */
async function createOrUpdateTabGroup(theme, tabIds) {
  try {
    // Get current window
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab) return;
    
    const windowId = currentTab.windowId;
    
    // Filter to tabs in the same window
    const tabsInWindow = [];
    for (const tabId of tabIds) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId === windowId) {
          tabsInWindow.push(tabId);
        }
      } catch {
        // Tab doesn't exist
      }
    }
    
    if (tabsInWindow.length < 2) return;
    
    // Check if a group already exists for this theme
    const existingGroup = themeGroups.get(theme.primary);
    
    if (existingGroup && existingGroup.groupId) {
      // Try to add tabs to existing group
      try {
        await chrome.tabs.group({
          tabIds: tabsInWindow,
          groupId: existingGroup.groupId
        });
        
        // Update stored tab IDs
        existingGroup.tabIds = [...new Set([...existingGroup.tabIds, ...tabsInWindow])];
        themeGroups.set(theme.primary, existingGroup);
        
        return existingGroup.groupId;
      } catch {
        // Group might have been deleted, create new one
      }
    }
    
    // Create new group
    const groupId = await chrome.tabs.group({
      tabIds: tabsInWindow
    });
    
    // Update group properties
    await chrome.tabGroups.update(groupId, {
      title: theme.groupName,
      color: theme.color,
      collapsed: false
    });
    
    // Store group info
    themeGroups.set(theme.primary, {
      groupId,
      tabIds: tabsInWindow,
      theme: theme.primary,
      groupName: theme.groupName,
      color: theme.color
    });
    
    console.log(`Lookalike: Created group "${theme.groupName}" with ${tabsInWindow.length} tabs`);
    
    return groupId;
  } catch (error) {
    console.error('Lookalike: Error creating tab group', error);
  }
}

/**
 * Handle tab removal
 */
async function handleTabRemoved(tabId) {
  // Remove from tabThemes
  tabThemes.delete(tabId);
  
  // Update themeGroups
  for (const [theme, groupData] of themeGroups.entries()) {
    if (groupData.tabIds.includes(tabId)) {
      groupData.tabIds = groupData.tabIds.filter(id => id !== tabId);
      
      // If only one tab left, the group will be automatically removed by Chrome
      if (groupData.tabIds.length <= 1) {
        themeGroups.delete(theme);
      }
    }
  }
  
  await saveStoredData();
  notifyPopup();
}

/**
 * Handle tab update (URL change)
 */
async function handleTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    // Tab has finished loading, content script will send content
    // We don't need to do anything here as content script handles it
  }
}

/**
 * Notify popup about updates
 */
function notifyPopup() {
  chrome.runtime.sendMessage({
    type: 'THEME_UPDATE',
    data: {
      tabThemes: Object.fromEntries(tabThemes),
      themeGroups: Object.fromEntries(themeGroups)
    }
  }).catch(() => {
    // Popup might not be open
  });
}

/**
 * Get current state for popup
 */
function getCurrentState() {
  return {
    tabThemes: Object.fromEntries(tabThemes),
    themeGroups: Object.fromEntries(themeGroups)
  };
}

/**
 * Manually trigger regrouping of all tabs
 */
async function regroupAllTabs() {
  try {
    // Get all tabs in current window
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    // Clear existing groups tracking (Chrome groups will persist)
    themeGroups.clear();
    
    // Group tabs by theme
    const themeMap = new Map();
    
    for (const [tabId, themeData] of tabThemes.entries()) {
      // Verify tab exists
      try {
        await chrome.tabs.get(tabId);
      } catch {
        tabThemes.delete(tabId);
        continue;
      }
      
      const themeName = themeData.primary;
      if (!themeMap.has(themeName)) {
        themeMap.set(themeName, {
          theme: themeData,
          tabIds: []
        });
      }
      themeMap.get(themeName).tabIds.push(tabId);
    }
    
    // Create groups for themes with multiple tabs
    for (const [themeName, data] of themeMap.entries()) {
      if (data.tabIds.length >= 2) {
        await createOrUpdateTabGroup(data.theme, data.tabIds);
      }
    }
    
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
    
    themeGroups.clear();
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
    // Inject content script and get content
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // This function runs in the context of the page
        const title = document.title || '';
        const metaDescription = document.querySelector('meta[name="description"]')?.content || 
                               document.querySelector('meta[property="og:description"]')?.content || '';
        
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

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        
      case 'CLEAR_CACHE':
        llmProcessor.clearCache();
        tabThemes.clear();
        themeGroups.clear();
        await saveStoredData();
        return { success: true };
        
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
  for (const [theme, groupData] of themeGroups.entries()) {
    if (groupData.groupId === group.id) {
      themeGroups.delete(theme);
      break;
    }
  }
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

