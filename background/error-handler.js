/**
 * Error Handler for Lookalike Extension
 * Centralized error handling, logging, and recovery
 */

// Error types
export const ErrorTypes = {
  CONTENT_EXTRACTION: 'CONTENT_EXTRACTION',
  LLM_PROCESSING: 'LLM_PROCESSING',
  TAB_GROUPING: 'TAB_GROUPING',
  STORAGE: 'STORAGE',
  NETWORK: 'NETWORK',
  PERMISSION: 'PERMISSION',
  UNKNOWN: 'UNKNOWN'
};

// Error severity levels
export const Severity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Error log storage
const errorLog = [];
const MAX_LOG_SIZE = 100;

/**
 * Custom error class for Lookalike errors
 */
export class LookalikeError extends Error {
  constructor(type, message, originalError = null, severity = Severity.MEDIUM) {
    super(message);
    this.name = 'LookalikeError';
    this.type = type;
    this.severity = severity;
    this.originalError = originalError;
    this.timestamp = Date.now();
  }
}

/**
 * Log an error
 */
export function logError(error, context = {}) {
  const logEntry = {
    timestamp: Date.now(),
    type: error.type || ErrorTypes.UNKNOWN,
    message: error.message,
    severity: error.severity || Severity.MEDIUM,
    context,
    stack: error.stack
  };

  // Add to log
  errorLog.push(logEntry);
  
  // Trim log if too large
  if (errorLog.length > MAX_LOG_SIZE) {
    errorLog.shift();
  }

  // Console log based on severity
  switch (logEntry.severity) {
    case Severity.CRITICAL:
    case Severity.HIGH:
      console.error(`[Lookalike Error] ${logEntry.type}:`, logEntry.message, context);
      break;
    case Severity.MEDIUM:
      console.warn(`[Lookalike Warning] ${logEntry.type}:`, logEntry.message);
      break;
    case Severity.LOW:
      console.debug(`[Lookalike Debug] ${logEntry.type}:`, logEntry.message);
      break;
  }

  return logEntry;
}

/**
 * Get recent errors
 */
export function getRecentErrors(count = 10) {
  return errorLog.slice(-count);
}

/**
 * Clear error log
 */
export function clearErrorLog() {
  errorLog.length = 0;
}

/**
 * Handle content extraction errors
 */
export function handleContentError(error, tabId, url) {
  const lookalikeError = new LookalikeError(
    ErrorTypes.CONTENT_EXTRACTION,
    `Failed to extract content from tab ${tabId}: ${error.message}`,
    error,
    Severity.LOW
  );

  logError(lookalikeError, { tabId, url });

  // Return a default content object
  return {
    title: 'Unknown',
    url: url || '',
    metaDescription: '',
    mainContent: '',
    headings: [],
    error: true
  };
}

/**
 * Handle LLM processing errors
 */
export function handleLLMError(error, content) {
  const lookalikeError = new LookalikeError(
    ErrorTypes.LLM_PROCESSING,
    `LLM processing failed: ${error.message}`,
    error,
    Severity.MEDIUM
  );

  logError(lookalikeError, { 
    contentTitle: content?.title,
    contentUrl: content?.url 
  });

  // Return a fallback theme
  return {
    primary: 'general',
    secondary: [],
    keywords: [],
    confidence: 0,
    groupName: 'General',
    color: 'grey',
    error: true
  };
}

/**
 * Handle tab grouping errors
 */
export function handleGroupingError(error, tabIds, theme) {
  const lookalikeError = new LookalikeError(
    ErrorTypes.TAB_GROUPING,
    `Failed to group tabs: ${error.message}`,
    error,
    Severity.MEDIUM
  );

  logError(lookalikeError, { 
    tabIds, 
    theme: theme?.primary 
  });

  return null;
}

/**
 * Handle storage errors
 */
export function handleStorageError(error, operation) {
  const lookalikeError = new LookalikeError(
    ErrorTypes.STORAGE,
    `Storage ${operation} failed: ${error.message}`,
    error,
    Severity.HIGH
  );

  logError(lookalikeError, { operation });

  return false;
}

/**
 * Handle permission errors
 */
export function handlePermissionError(error, permission) {
  const lookalikeError = new LookalikeError(
    ErrorTypes.PERMISSION,
    `Permission denied: ${permission}`,
    error,
    Severity.HIGH
  );

  logError(lookalikeError, { permission });

  return false;
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling(fn, errorType = ErrorTypes.UNKNOWN) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const lookalikeError = new LookalikeError(
        errorType,
        error.message,
        error,
        Severity.MEDIUM
      );
      
      logError(lookalikeError);
      throw lookalikeError;
    }
  };
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.debug(`[Lookalike] Retry attempt ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Safe wrapper for Chrome API calls
 */
export async function safeChromeCall(apiCall, fallback = null) {
  try {
    return await apiCall();
  } catch (error) {
    // Check for specific Chrome error messages
    if (error.message?.includes('Extension context invalidated')) {
      // Extension was reloaded/updated
      console.debug('[Lookalike] Extension context invalidated');
      return fallback;
    }
    
    if (error.message?.includes('No tab with id')) {
      // Tab was closed
      console.debug('[Lookalike] Tab no longer exists');
      return fallback;
    }
    
    if (error.message?.includes('Cannot access')) {
      // Page not accessible (chrome://, etc.)
      console.debug('[Lookalike] Page not accessible');
      return fallback;
    }
    
    throw error;
  }
}

/**
 * Validate tab before operations
 */
export async function validateTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    // Check if tab URL is accessible
    if (!tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('file://')) {
      return { valid: false, reason: 'inaccessible_url' };
    }
    
    return { valid: true, tab };
  } catch (error) {
    return { valid: false, reason: 'tab_not_found' };
  }
}

/**
 * Health check for the extension
 */
export async function healthCheck() {
  const results = {
    storage: false,
    tabs: false,
    tabGroups: false,
    timestamp: Date.now()
  };

  try {
    // Test storage
    await chrome.storage.local.set({ __health_check: true });
    await chrome.storage.local.remove('__health_check');
    results.storage = true;
  } catch (e) {
    logError(new LookalikeError(ErrorTypes.STORAGE, 'Storage health check failed', e));
  }

  try {
    // Test tabs API
    await chrome.tabs.query({ currentWindow: true });
    results.tabs = true;
  } catch (e) {
    logError(new LookalikeError(ErrorTypes.PERMISSION, 'Tabs API health check failed', e));
  }

  try {
    // Test tabGroups API
    await chrome.tabGroups.query({});
    results.tabGroups = true;
  } catch (e) {
    logError(new LookalikeError(ErrorTypes.PERMISSION, 'TabGroups API health check failed', e));
  }

  return results;
}

