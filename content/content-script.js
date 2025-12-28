// Content script to extract meaningful text content from web pages

(function() {
  'use strict';

  // Avoid running multiple times
  if (window.__lookalikeContentScriptLoaded) return;
  window.__lookalikeContentScriptLoaded = true;

  /**
   * Extract clean text content from the page
   */
  function extractPageContent() {
    // Get basic page info
    const title = document.title || '';
    const url = window.location.href;
    
    // Get meta description
    const metaDescription = document.querySelector('meta[name="description"]')?.content || 
                           document.querySelector('meta[property="og:description"]')?.content || '';
    
    // Get meta keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]')?.content || '';
    
    // Get OpenGraph title if different from page title
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    
    // Extract main content - try to find the main content area
    const mainContent = extractMainContent();
    
    // Get headings for context
    const headings = extractHeadings();
    
    return {
      title,
      url,
      metaDescription,
      metaKeywords,
      ogTitle,
      mainContent,
      headings,
      timestamp: Date.now()
    };
  }

  /**
   * Extract the main content from the page, avoiding navigation, ads, etc.
   */
  function extractMainContent() {
    // Priority order for finding main content
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '#content',
      '#main-content',
      '.main-content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content'
    ];

    let contentElement = null;
    
    // Try to find the main content container
    for (const selector of mainSelectors) {
      contentElement = document.querySelector(selector);
      if (contentElement) break;
    }

    // Fallback to body if no specific content area found
    if (!contentElement) {
      contentElement = document.body;
    }

    // Clone the element to avoid modifying the actual page
    const clone = contentElement.cloneNode(true);
    
    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'nav',
      'header',
      'footer',
      'aside',
      '.sidebar',
      '.navigation',
      '.nav',
      '.menu',
      '.advertisement',
      '.ad',
      '.ads',
      '.social-share',
      '.comments',
      '.comment-section',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[aria-hidden="true"]'
    ];

    unwantedSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Get text content and clean it up
    let text = clone.textContent || '';
    
    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n')  // Remove extra newlines
      .trim();

    // Limit content length to avoid sending too much data
    const maxLength = 5000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...';
    }

    return text;
  }

  /**
   * Extract headings from the page
   */
  function extractHeadings() {
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3');
    
    headingElements.forEach(heading => {
      const text = heading.textContent?.trim();
      if (text && text.length > 0 && text.length < 200) {
        headings.push({
          level: parseInt(heading.tagName.charAt(1)),
          text: text
        });
      }
    });

    // Limit to first 10 headings
    return headings.slice(0, 10);
  }

  /**
   * Send extracted content to the background service worker
   */
  function sendContentToBackground() {
    // Don't process special pages
    if (window.location.protocol === 'chrome:' || 
        window.location.protocol === 'chrome-extension:' ||
        window.location.protocol === 'about:' ||
        window.location.protocol === 'file:') {
      return;
    }

    const content = extractPageContent();
    
    // Send message to background script
    chrome.runtime.sendMessage({
      type: 'PAGE_CONTENT',
      data: content
    }).catch(err => {
      // Extension context might be invalidated, ignore error
      console.debug('Lookalike: Could not send content to background', err);
    });
  }

  /**
   * Handle SPA navigation by observing URL changes
   */
  function setupNavigationObserver() {
    let lastUrl = window.location.href;
    
    // Check for URL changes periodically (for SPAs that don't trigger popstate)
    const urlObserver = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        // Wait a bit for content to load
        setTimeout(sendContentToBackground, 1000);
      }
    }, 2000);

    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      setTimeout(sendContentToBackground, 500);
    });

    // Clean up on unload
    window.addEventListener('beforeunload', () => {
      clearInterval(urlObserver);
    });
  }

  // Initialize
  function init() {
    // Wait for page to be more complete
    if (document.readyState === 'complete') {
      sendContentToBackground();
    } else {
      window.addEventListener('load', () => {
        // Give dynamic content a bit more time to load
        setTimeout(sendContentToBackground, 500);
      });
    }

    // Set up SPA navigation observer
    setupNavigationObserver();
  }

  init();
})();

