/**
 * Storage Manager for Lookalike Extension
 * Handles persistent storage with caching and optimization
 */

// Cache for quick access
const memoryCache = {
  tabThemes: new Map(),
  themeGroups: new Map(),
  settings: null,
  lastSync: 0
};

// Sync interval (5 minutes) - reserved for future use
// eslint-disable-next-line no-unused-vars
const SYNC_INTERVAL = 5 * 60 * 1000;

// Storage keys
const STORAGE_KEYS = {
  TAB_THEMES: 'lookalike_tab_themes',
  THEME_GROUPS: 'lookalike_theme_groups',
  SETTINGS: 'lookalike_settings',
  CACHE_VERSION: 'lookalike_cache_version'
};

// Current cache version (increment to invalidate old cache)
const CACHE_VERSION = 1;

/**
 * Initialize storage and load cached data
 */
export async function initStorage() {
  try {
    // Check cache version
    const stored = await chrome.storage.local.get([STORAGE_KEYS.CACHE_VERSION]);
    const storedVersion = stored[STORAGE_KEYS.CACHE_VERSION];
    
    if (storedVersion !== CACHE_VERSION) {
      // Cache version mismatch, clear old data
      await clearAllData();
      await chrome.storage.local.set({ [STORAGE_KEYS.CACHE_VERSION]: CACHE_VERSION });
      return;
    }
    
    // Load data into memory cache
    await loadFromStorage();
  } catch (error) {
    console.error('Lookalike: Storage initialization failed', error);
  }
}

/**
 * Load all data from Chrome storage into memory cache
 */
async function loadFromStorage() {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.TAB_THEMES,
      STORAGE_KEYS.THEME_GROUPS,
      STORAGE_KEYS.SETTINGS
    ]);
    
    // Load tab themes
    if (data[STORAGE_KEYS.TAB_THEMES]) {
      const themes = data[STORAGE_KEYS.TAB_THEMES];
      Object.entries(themes).forEach(([tabId, theme]) => {
        memoryCache.tabThemes.set(parseInt(tabId), theme);
      });
    }
    
    // Load theme groups
    if (data[STORAGE_KEYS.THEME_GROUPS]) {
      const groups = data[STORAGE_KEYS.THEME_GROUPS];
      Object.entries(groups).forEach(([theme, groupData]) => {
        memoryCache.themeGroups.set(theme, groupData);
      });
    }
    
    // Load settings
    memoryCache.settings = data[STORAGE_KEYS.SETTINGS] || getDefaultSettings();
    
    memoryCache.lastSync = Date.now();
  } catch (error) {
    console.error('Lookalike: Failed to load from storage', error);
  }
}

/**
 * Save all cached data to Chrome storage
 */
export async function saveToStorage() {
  try {
    const data = {
      [STORAGE_KEYS.TAB_THEMES]: Object.fromEntries(memoryCache.tabThemes),
      [STORAGE_KEYS.THEME_GROUPS]: Object.fromEntries(memoryCache.themeGroups),
      [STORAGE_KEYS.SETTINGS]: memoryCache.settings
    };
    
    await chrome.storage.local.set(data);
    memoryCache.lastSync = Date.now();
  } catch (error) {
    console.error('Lookalike: Failed to save to storage', error);
    throw error;
  }
}

/**
 * Get tab theme from cache
 */
export function getTabTheme(tabId) {
  return memoryCache.tabThemes.get(tabId);
}

/**
 * Set tab theme in cache
 */
export function setTabTheme(tabId, theme) {
  memoryCache.tabThemes.set(tabId, theme);
  debouncedSave();
}

/**
 * Remove tab theme from cache
 */
export function removeTabTheme(tabId) {
  memoryCache.tabThemes.delete(tabId);
  debouncedSave();
}

/**
 * Get all tab themes
 */
export function getAllTabThemes() {
  return new Map(memoryCache.tabThemes);
}

/**
 * Get theme group from cache
 */
export function getThemeGroup(themeName) {
  return memoryCache.themeGroups.get(themeName);
}

/**
 * Set theme group in cache
 */
export function setThemeGroup(themeName, groupData) {
  memoryCache.themeGroups.set(themeName, groupData);
  debouncedSave();
}

/**
 * Remove theme group from cache
 */
export function removeThemeGroup(themeName) {
  memoryCache.themeGroups.delete(themeName);
  debouncedSave();
}

/**
 * Get all theme groups
 */
export function getAllThemeGroups() {
  return new Map(memoryCache.themeGroups);
}

/**
 * Get settings
 */
export function getSettings() {
  return memoryCache.settings || getDefaultSettings();
}

/**
 * Update settings
 */
export function updateSettings(newSettings) {
  memoryCache.settings = {
    ...getDefaultSettings(),
    ...memoryCache.settings,
    ...newSettings
  };
  debouncedSave();
}

/**
 * Get default settings
 */
function getDefaultSettings() {
  return {
    autoGroup: true,
    similarityThreshold: 0.6,
    minTabsForGroup: 2,
    analyzeOnLoad: true,
    showNotifications: false
  };
}

/**
 * Clear all stored data
 */
export async function clearAllData() {
  memoryCache.tabThemes.clear();
  memoryCache.themeGroups.clear();
  memoryCache.settings = getDefaultSettings();
  
  try {
    await chrome.storage.local.remove([
      STORAGE_KEYS.TAB_THEMES,
      STORAGE_KEYS.THEME_GROUPS
    ]);
  } catch (error) {
    console.error('Lookalike: Failed to clear storage', error);
  }
}

/**
 * Clean up stale data (tabs that no longer exist)
 */
export async function cleanupStaleData() {
  try {
    const tabs = await chrome.tabs.query({});
    const existingTabIds = new Set(tabs.map(t => t.id));
    
    let cleaned = false;
    
    // Remove themes for tabs that don't exist
    for (const tabId of memoryCache.tabThemes.keys()) {
      if (!existingTabIds.has(tabId)) {
        memoryCache.tabThemes.delete(tabId);
        cleaned = true;
      }
    }
    
    // Clean up theme groups
    for (const [themeName, groupData] of memoryCache.themeGroups.entries()) {
      const validTabIds = groupData.tabIds.filter(id => existingTabIds.has(id));
      
      if (validTabIds.length !== groupData.tabIds.length) {
        if (validTabIds.length < 2) {
          memoryCache.themeGroups.delete(themeName);
        } else {
          groupData.tabIds = validTabIds;
        }
        cleaned = true;
      }
    }
    
    if (cleaned) {
      await saveToStorage();
    }
    
    return cleaned;
  } catch (error) {
    console.error('Lookalike: Failed to cleanup stale data', error);
    return false;
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    
    return {
      bytesUsed: bytesInUse,
      tabThemesCount: memoryCache.tabThemes.size,
      themeGroupsCount: memoryCache.themeGroups.size,
      lastSync: memoryCache.lastSync
    };
  } catch (error) {
    console.error('Lookalike: Failed to get storage stats', error);
    return null;
  }
}

// Debounced save to prevent excessive writes
let saveTimeout = null;

function debouncedSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    saveToStorage().catch(console.error);
    saveTimeout = null;
  }, 1000);
}

// Export memory cache for direct access if needed
export { memoryCache };

