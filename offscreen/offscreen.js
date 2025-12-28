/**
 * Offscreen document for Lookalike Tab Grouping Extension
 * Runs the semantic model in an environment with DOM APIs (URL.createObjectURL, etc.)
 */

import { pipeline, env } from '../lib/transformers.js';

// Configure transformers.js for extension environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Color palette for tab groups
const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

// Cache configuration
const CACHE_CONFIG = {
  MAX_ENTRIES: 500,        // Maximum cached embeddings
  MAX_STORAGE_MB: 10,      // Maximum storage size in MB
  STORAGE_KEY: 'lookalike_embedding_cache',
  PERSIST_INTERVAL: 30000  // Save cache every 30 seconds
};

/**
 * LRU Cache with persistence support
 */
class LRUCache {
  constructor(maxSize = CACHE_CONFIG.MAX_ENTRIES) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = []; // Track access order for LRU
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    // Move to end (most recently used)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
    
    return this.cache.get(key);
  }

  set(key, value) {
    // If key exists, update and move to end
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
      return;
    }

    // Evict if at capacity
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift();
      this.cache.delete(lruKey);
    }

    this.cache.set(key, value);
    this.accessOrder.push(key);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  size() {
    return this.cache.size;
  }

  // Serialize for storage
  toJSON() {
    const entries = [];
    for (const key of this.accessOrder) {
      if (this.cache.has(key)) {
        entries.push([key, this.cache.get(key)]);
      }
    }
    return entries;
  }

  // Restore from storage
  fromJSON(entries) {
    this.clear();
    if (!Array.isArray(entries)) return;
    
    // Only load up to maxSize entries (most recent ones)
    const toLoad = entries.slice(-this.maxSize);
    for (const [key, value] of toLoad) {
      this.cache.set(key, value);
      this.accessOrder.push(key);
    }
  }
}

class SemanticProcessor {
  constructor() {
    this.embedder = null;
    this.modelLoading = false;
    this.modelLoaded = false;
    this.pendingRequests = [];
    this.embeddingCache = new LRUCache(CACHE_CONFIG.MAX_ENTRIES);
    this.colorIndex = 0;
    this.cacheModified = false;
    this.persistTimer = null;
    
    // Load cached embeddings from storage
    this.loadCacheFromStorage();
    
    // Set up periodic cache persistence
    this.persistTimer = setInterval(() => {
      this.saveCacheToStorage();
    }, CACHE_CONFIG.PERSIST_INTERVAL);
  }

  /**
   * Load embedding cache from Chrome storage
   */
  async loadCacheFromStorage() {
    try {
      const data = await chrome.storage.local.get([CACHE_CONFIG.STORAGE_KEY]);
      if (data[CACHE_CONFIG.STORAGE_KEY]) {
        this.embeddingCache.fromJSON(data[CACHE_CONFIG.STORAGE_KEY]);
      }
    } catch {
      // Ignore storage errors - start with empty cache
    }
  }

  /**
   * Save embedding cache to Chrome storage
   */
  async saveCacheToStorage() {
    if (!this.cacheModified) return;
    
    try {
      const cacheData = this.embeddingCache.toJSON();
      
      // Estimate size and truncate if too large
      const jsonStr = JSON.stringify(cacheData);
      const sizeMB = jsonStr.length / (1024 * 1024);
      
      if (sizeMB > CACHE_CONFIG.MAX_STORAGE_MB) {
        // Reduce cache size by half
        const entries = cacheData.slice(Math.floor(cacheData.length / 2));
        await chrome.storage.local.set({
          [CACHE_CONFIG.STORAGE_KEY]: entries
        });
      } else {
        await chrome.storage.local.set({
          [CACHE_CONFIG.STORAGE_KEY]: cacheData
        });
      }
      
      this.cacheModified = false;
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Initialize the embedding model
   */
  async initialize() {
    if (this.modelLoaded) return true;
    if (this.modelLoading) {
      return new Promise((resolve) => {
        this.pendingRequests.push(resolve);
      });
    }

    this.modelLoading = true;

    try {
      // Use a small, fast embedding model optimized for semantic similarity
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { 
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              // Notify service worker of progress
              chrome.runtime.sendMessage({
                type: 'MODEL_PROGRESS',
                progress: Math.round(progress.progress)
              }).catch(() => {});
            }
          }
        }
      );

      this.modelLoaded = true;
      this.modelLoading = false;

      // Resolve pending requests
      this.pendingRequests.forEach(resolve => resolve(true));
      this.pendingRequests = [];

      return true;
    } catch (error) {
      this.modelLoading = false;
      console.error('Lookalike: Failed to load semantic model', error);
      throw error;
    }
  }

  /**
   * Check if the model is ready
   */
  isReady() {
    return this.modelLoaded;
  }

  /**
   * Get the loading status
   */
  getStatus() {
    if (this.modelLoaded) return 'ready';
    if (this.modelLoading) return 'loading';
    return 'idle';
  }

  /**
   * Compute embedding for text content
   */
  async computeEmbedding(text) {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    // Check cache
    const cacheKey = this.hashText(text);
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Truncate text to model's max length (roughly 512 tokens ≈ 2000 chars)
    const truncatedText = text.slice(0, 2000);

    try {
      // Compute embedding
      const output = await this.embedder(truncatedText, {
        pooling: 'mean',
        normalize: true
      });

      // Convert to regular array
      const embedding = Array.from(output.data);

      // Cache the result and mark as modified for persistence
      this.embeddingCache.set(cacheKey, embedding);
      this.cacheModified = true;

      return embedding;
    } catch (error) {
      console.error('Lookalike: Error computing embedding', error);
      throw error;
    }
  }

  /**
   * Extract semantic content from page data
   */
  extractSemanticContent(content) {
    // Combine meaningful text in order of importance
    const parts = [
      content.title,
      content.ogTitle,
      content.metaDescription,
      // Get first few headings
      ...(content.headings?.slice(0, 5).map(h => h.text) || []),
      // First portion of main content
      content.mainContent?.slice(0, 1500) || ''
    ].filter(Boolean);

    return parts.join('. ').trim();
  }

  /**
   * Process page content and extract semantic features
   */
  async processContent(content) {
    const semanticText = this.extractSemanticContent(content);
    
    // Compute embedding
    const embedding = await this.computeEmbedding(semanticText);
    
    // Extract key phrases for group naming
    const keyPhrases = this.extractKeyPhrases(content);
    
    return {
      embedding,
      keyPhrases,
      title: content.title,
      url: content.url,
      semanticText: semanticText.slice(0, 500), // Keep summary for reference
      timestamp: Date.now()
    };
  }

  /**
   * Extract key phrases from content for group naming
   */
  extractKeyPhrases(content) {
    const text = [
      content.title,
      content.metaDescription,
      ...(content.headings?.slice(0, 3).map(h => h.text) || [])
    ].join(' ').toLowerCase();

    // Simple key phrase extraction using n-grams and frequency
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.isStopWord(w));

    // Count word frequency
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Also extract 2-grams
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }

    // Score phrases
    const phrases = [
      ...Object.entries(wordFreq)
        .filter(([, count]) => count >= 1)
        .map(([word, count]) => ({ phrase: word, score: count })),
      ...bigrams.reduce((acc, bg) => {
        const existing = acc.find(a => a.phrase === bg);
        if (existing) {
          existing.score += 2;
        } else {
          acc.push({ phrase: bg, score: 2 });
        }
        return acc;
      }, [])
    ];

    return phrases
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(p => p.phrase);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Optimized cosine similarity using pre-computed norms
   * Since embeddings are normalized (norm=1), dot product equals cosine similarity
   */
  fastCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }
    
    // For normalized vectors, cosine similarity = dot product
    let dotProduct = 0;
    const len = embedding1.length;
    
    // Unrolled loop for better performance (process 4 elements at a time)
    let i = 0;
    for (; i + 3 < len; i += 4) {
      dotProduct += embedding1[i] * embedding2[i] +
                    embedding1[i+1] * embedding2[i+1] +
                    embedding1[i+2] * embedding2[i+2] +
                    embedding1[i+3] * embedding2[i+3];
    }
    // Handle remaining elements
    for (; i < len; i++) {
      dotProduct += embedding1[i] * embedding2[i];
    }
    
    return dotProduct;
  }

  /**
   * Cluster tabs based on semantic similarity
   * Optimized with pre-computed similarity matrix and early termination
   */
  async clusterTabs(tabsData, similarityThreshold = 0.5) {
    // Convert from object format to array
    const tabs = Object.entries(tabsData).map(([tabId, data]) => ({
      tabId: parseInt(tabId),
      ...data
    }));

    const n = tabs.length;
    if (n === 0) return [];
    if (n === 1) return []; // Need at least 2 tabs for a cluster

    // Pre-compute similarity matrix (upper triangular) for efficiency
    // Store only pairs that meet threshold to save memory
    const similarPairs = [];
    
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const similarity = this.fastCosineSimilarity(tabs[i].embedding, tabs[j].embedding);
        if (similarity >= similarityThreshold) {
          similarPairs.push({ i, j, similarity });
        }
      }
    }

    // Sort by similarity (highest first) for better cluster quality
    similarPairs.sort((a, b) => b.similarity - a.similarity);

    // Build clusters using Union-Find for efficiency
    const parent = new Array(n).fill(-1).map((_, i) => i);
    const rank = new Array(n).fill(0);

    const find = (x) => {
      if (parent[x] !== x) {
        parent[x] = find(parent[x]); // Path compression
      }
      return parent[x];
    };

    const union = (x, y) => {
      const px = find(x);
      const py = find(y);
      if (px === py) return;
      
      // Union by rank
      if (rank[px] < rank[py]) {
        parent[px] = py;
      } else if (rank[px] > rank[py]) {
        parent[py] = px;
      } else {
        parent[py] = px;
        rank[px]++;
      }
    };

    // Union similar tabs
    for (const { i, j } of similarPairs) {
      union(i, j);
    }

    // Group tabs by their root parent
    const clusterMap = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!clusterMap.has(root)) {
        clusterMap.set(root, []);
      }
      clusterMap.get(root).push(tabs[i]);
    }

    // Build final clusters (only groups with 2+ tabs)
    const clusters = [];
    for (const clusterTabs of clusterMap.values()) {
      if (clusterTabs.length < 2) continue;

      const cluster = {
        tabs: clusterTabs,
        centroid: this.averageEmbeddings(clusterTabs.map(t => t.embedding))
      };
      
      // Generate group name from cluster content
      cluster.groupName = await this.generateGroupName(cluster.tabs, cluster.centroid);
      cluster.color = this.assignColor();
      
      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Extract clean title from page (remove site suffixes like " - Wikipedia")
   */
  extractCleanTitle(title) {
    if (!title) return '';
    
    // Remove common site suffixes and patterns
    const patterns = [
      /\s*[-–—|]\s*wikipedia.*$/i,
      /\s*[-–—|]\s*the\s+free\s+encyclopedia.*$/i,
      /\s*[-–—|]\s*.*$/i, // Generic separator
      /\s*\(.*film.*\)$/i, // Remove disambiguation like "(1978 film)"
      /\s*\(.*novel.*\)$/i,
      /\s*\(.*book.*\)$/i,
    ];
    
    let cleanTitle = title.trim();
    for (const pattern of patterns) {
      cleanTitle = cleanTitle.replace(pattern, '').trim();
    }
    
    return cleanTitle;
  }

  /**
   * Extract the main subject/noun from a title
   */
  extractMainSubject(title) {
    if (!title) return null;
    
    const cleanTitle = this.extractCleanTitle(title);
    if (!cleanTitle) return null;
    
    // Remove common prefixes
    const prefixes = /^(the|a|an)\s+/i;
    let subject = cleanTitle.replace(prefixes, '').trim();
    
    // Extract first meaningful phrase (up to 3 words)
    const words = subject.split(/\s+/).filter(w => {
      const lower = w.toLowerCase();
      return w.length > 2 && 
             !this.isStopWord(lower) &&
             !lower.match(/^\d+$/); // Not just numbers
    });
    
    if (words.length === 0) return null;
    
    // Take first 1-3 words that form a meaningful subject
    if (words.length <= 3) {
      return words.join(' ');
    }
    
    // For longer titles, try to find the main noun phrase
    // Look for capitalized words (proper nouns) or first significant phrase
    const capitalized = words.filter(w => /^[A-Z]/.test(w));
    if (capitalized.length > 0) {
      return capitalized.slice(0, 2).join(' ');
    }
    
    return words.slice(0, 2).join(' ');
  }

  /**
   * Find the most representative tab using cluster centroid
   */
  findMostRepresentativeTab(tabs, centroid) {
    if (!centroid || tabs.length === 0) return tabs[0];
    
    let bestTab = tabs[0];
    let bestSimilarity = -1;
    
    for (const tab of tabs) {
      if (!tab.embedding) continue;
      const similarity = this.cosineSimilarity(centroid, tab.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestTab = tab;
      }
    }
    
    return bestTab;
  }

  /**
   * Extract common semantic themes from titles
   */
  extractCommonThemes(tabs) {
    const subjects = tabs
      .map(t => this.extractMainSubject(t.title))
      .filter(s => s && s.length > 0);
    
    if (subjects.length === 0) return null;
    
    // Count subject frequency
    const subjectCount = {};
    subjects.forEach(subject => {
      const normalized = subject.toLowerCase();
      subjectCount[normalized] = (subjectCount[normalized] || 0) + 1;
    });
    
    // Find subjects that appear in multiple tabs
    const commonSubjects = Object.entries(subjectCount)
      .filter(([, count]) => count >= Math.min(2, subjects.length))
      .sort((a, b) => b[1] - a[1]);
    
    if (commonSubjects.length > 0) {
      return commonSubjects[0][0];
    }
    
    // If no exact matches, find similar subjects (fuzzy matching)
    const uniqueSubjects = [...new Set(subjects.map(s => s.toLowerCase()))];
    if (uniqueSubjects.length === 1) {
      return uniqueSubjects[0];
    }
    
    return null;
  }

  /**
   * Generate a meaningful group name from cluster tabs using semantic analysis
   */
  async generateGroupName(tabs, centroid = null) {
    if (!tabs || tabs.length === 0) return 'Related';
    
    // Strategy 1: Find most representative tab using centroid and use its clean title
    if (centroid) {
      const representativeTab = this.findMostRepresentativeTab(tabs, centroid);
      if (representativeTab?.title) {
        const cleanTitle = this.extractCleanTitle(representativeTab.title);
        const mainSubject = this.extractMainSubject(cleanTitle);
        if (mainSubject && mainSubject.length > 0 && mainSubject.length < 25) {
          return this.formatGroupName(mainSubject);
        }
        if (cleanTitle && cleanTitle.length > 0 && cleanTitle.length < 25) {
          return this.formatGroupName(cleanTitle);
        }
      }
    }
    
    // Strategy 2: Extract common themes from all titles
    const commonTheme = this.extractCommonThemes(tabs);
    if (commonTheme) {
      return this.formatGroupName(commonTheme);
    }
    
    // Strategy 3: Use semantic embeddings to find the best representative title
    // Find the tab whose title embedding is closest to the cluster centroid
    if (centroid && this.modelLoaded) {
      try {
        const titleEmbeddings = await Promise.all(
          tabs
            .filter(t => t.title)
            .map(async (tab) => {
              const cleanTitle = this.extractCleanTitle(tab.title);
              if (!cleanTitle) return null;
              const embedding = await this.computeEmbedding(cleanTitle);
              return { tab, embedding, title: cleanTitle };
            })
        );
        
        const validEmbeddings = titleEmbeddings.filter(e => e !== null);
        
        if (validEmbeddings.length > 0) {
          // Find embedding closest to centroid
          let bestMatch = validEmbeddings[0];
          let bestSimilarity = this.cosineSimilarity(centroid, bestMatch.embedding);
          
          for (const item of validEmbeddings.slice(1)) {
            const similarity = this.cosineSimilarity(centroid, item.embedding);
            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestMatch = item;
            }
          }
          
          const mainSubject = this.extractMainSubject(bestMatch.title);
          if (mainSubject && mainSubject.length < 25) {
            return this.formatGroupName(mainSubject);
          }
          if (bestMatch.title.length < 25) {
            return this.formatGroupName(bestMatch.title);
          }
        }
      } catch {
        // Error in semantic title matching - continue with other strategies
      }
    }
    
    // Strategy 4: Extract meaningful key phrases (filtered)
    const allPhrases = tabs.flatMap(t => t.keyPhrases || [])
      .filter(phrase => {
        const lower = phrase.toLowerCase();
        return !lower.includes('wikipedia') && 
               !lower.includes('www') && 
               !lower.includes('http') &&
               !lower.includes('page') &&
               !lower.includes('site') &&
               lower.length > 2 &&
               lower.length < 20;
      });
    
    if (allPhrases.length > 0) {
      const phraseCount = {};
      allPhrases.forEach(phrase => {
        phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
      });
      
      const sharedPhrases = Object.entries(phraseCount)
        .filter(([, count]) => count >= Math.min(2, tabs.length))
        .sort((a, b) => b[1] - a[1]);
      
      if (sharedPhrases.length > 0) {
        return this.formatGroupName(sharedPhrases[0][0]);
      }
      
      // Use most frequent phrase even if not shared
      const topPhrase = Object.entries(phraseCount)
        .sort((a, b) => b[1] - a[1])[0];
      if (topPhrase) {
        return this.formatGroupName(topPhrase[0]);
      }
    }
    
    // Strategy 5: Use shortest clean title
    const cleanTitles = tabs
      .map(t => this.extractCleanTitle(t.title))
      .filter(t => t.length > 0 && t.length < 30);
    
    if (cleanTitles.length > 0) {
      const bestTitle = cleanTitles
        .sort((a, b) => a.length - b.length)[0];
      const mainSubject = this.extractMainSubject(bestTitle);
      if (mainSubject) {
        return this.formatGroupName(mainSubject);
      }
      return this.formatGroupName(bestTitle.slice(0, 25));
    }
    
    return 'Related';
  }

  /**
   * Format group name for display
   */
  formatGroupName(name) {
    return name
      .split(/[\s-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .slice(0, 25); // Chrome limits group name length
  }

  /**
   * Calculate average of multiple embeddings
   */
  averageEmbeddings(embeddings) {
    if (embeddings.length === 0) return null;
    if (embeddings.length === 1) return embeddings[0];

    const dim = embeddings[0].length;
    const avg = new Array(dim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        avg[i] += emb[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      avg[i] /= embeddings.length;
    }

    return avg;
  }

  /**
   * Assign a color to a group (cycles through available colors)
   */
  assignColor() {
    const color = GROUP_COLORS[this.colorIndex % GROUP_COLORS.length];
    this.colorIndex++;
    return color;
  }

  /**
   * Reset color assignment for fresh grouping
   */
  resetColors() {
    this.colorIndex = 0;
  }

  /**
   * Check if a word is a stop word
   */
  isStopWord(word) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
      'you', 'your', 'our', 'their', 'its', 'all', 'some', 'any', 'each', 'every',
      'more', 'most', 'other', 'such', 'only', 'same', 'than', 'too', 'very',
      'just', 'about', 'also', 'new', 'first', 'last', 'get', 'got', 'make',
      'use', 'using', 'how', 'what', 'when', 'where', 'why', 'who', 'which',
      'page', 'site', 'website', 'home', 'menu', 'click', 'here', 'now', 'today'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Simple hash function for cache keys
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Clear all caches (memory and storage)
   */
  async clearCache() {
    this.embeddingCache.clear();
    this.cacheModified = false;
    this.resetColors();
    
    // Clear persistent storage
    try {
      await chrome.storage.local.remove([CACHE_CONFIG.STORAGE_KEY]);
    } catch {
      // Ignore storage errors
    }
  }
}

// Create singleton instance
const semanticProcessor = new SemanticProcessor();

// Message handler for communication with service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages meant for offscreen document
  if (message.target !== 'offscreen') {
    return false;
  }
  
  const handleAsync = async () => {
    switch (message.type) {
      case 'INIT_MODEL':
        try {
          await semanticProcessor.initialize();
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }

      case 'GET_MODEL_STATUS':
        return { status: semanticProcessor.getStatus() };

      case 'PROCESS_CONTENT':
        try {
          const result = await semanticProcessor.processContent(message.content);
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: error.message };
        }

      case 'CLUSTER_TABS':
        try {
          semanticProcessor.resetColors();
          const clusters = await semanticProcessor.clusterTabs(message.tabsData, message.threshold);
          return { success: true, clusters };
        } catch (error) {
          return { success: false, error: error.message };
        }

      case 'CLEAR_CACHE':
        await semanticProcessor.clearCache();
        return { success: true };

      case 'RESET_COLORS':
        semanticProcessor.resetColors();
        return { success: true };

      default:
        return { error: 'Unknown message type' };
    }
  };

  handleAsync()
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ error: error.message }));

  return true; // Keep channel open for async response
});

// Signal that offscreen document is ready to receive messages
chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' }).catch(() => {});

// Don't auto-initialize model - wait for explicit INIT_MODEL message from service worker
// This prevents race conditions

