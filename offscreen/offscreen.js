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

class SemanticProcessor {
  constructor() {
    this.embedder = null;
    this.modelLoading = false;
    this.modelLoaded = false;
    this.pendingRequests = [];
    this.embeddingCache = new Map();
    this.colorIndex = 0;
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
      console.log('Lookalike Offscreen: Loading semantic embedding model...');
      
      // Use a small, fast embedding model optimized for semantic similarity
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { 
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              console.log(`Lookalike Offscreen: Model loading ${Math.round(progress.progress)}%`);
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

      console.log('Lookalike Offscreen: Semantic model loaded successfully');
      return true;
    } catch (error) {
      this.modelLoading = false;
      console.error('Lookalike Offscreen: Failed to load semantic model', error);
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
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
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

      // Cache the result
      this.embeddingCache.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      console.error('Lookalike Offscreen: Error computing embedding', error);
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
    console.log(`Lookalike Offscreen: Processing "${content.title}"`);
    
    const semanticText = this.extractSemanticContent(content);
    console.log(`Lookalike Offscreen: Extracted ${semanticText.length} chars of semantic text`);
    
    // Compute embedding
    const embedding = await this.computeEmbedding(semanticText);
    console.log(`Lookalike Offscreen: Generated embedding (${embedding.length} dimensions)`);
    
    // Extract key phrases for group naming
    const keyPhrases = this.extractKeyPhrases(content);
    console.log(`Lookalike Offscreen: Key phrases: ${keyPhrases.slice(0, 5).join(', ')}`);
    
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
   * Cluster tabs based on semantic similarity
   */
  async clusterTabs(tabsData, similarityThreshold = 0.5) {
    // Convert from object format to array
    const tabs = Object.entries(tabsData).map(([tabId, data]) => ({
      tabId: parseInt(tabId),
      ...data
    }));

    console.log(`Lookalike Offscreen: Clustering ${tabs.length} tabs with threshold ${similarityThreshold}`);

    if (tabs.length === 0) return [];

    // Log similarity matrix for debugging
    console.log('Lookalike Offscreen: Similarity matrix:');
    for (let i = 0; i < Math.min(tabs.length, 5); i++) {
      for (let j = i + 1; j < Math.min(tabs.length, 5); j++) {
        const sim = this.cosineSimilarity(tabs[i].embedding, tabs[j].embedding);
        console.log(`  "${tabs[i].title?.slice(0, 30)}..." ↔ "${tabs[j].title?.slice(0, 30)}...": ${sim.toFixed(3)}`);
      }
    }

    // Build similarity matrix
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < tabs.length; i++) {
      if (assigned.has(tabs[i].tabId)) continue;

      const cluster = {
        tabs: [tabs[i]],
        centroid: tabs[i].embedding
      };

      // Find all tabs similar to this one
      for (let j = i + 1; j < tabs.length; j++) {
        if (assigned.has(tabs[j].tabId)) continue;

        const similarity = this.cosineSimilarity(tabs[i].embedding, tabs[j].embedding);
        
        if (similarity >= similarityThreshold) {
          console.log(`Lookalike Offscreen: Matched! "${tabs[i].title?.slice(0, 25)}" ↔ "${tabs[j].title?.slice(0, 25)}" (${similarity.toFixed(3)})`);
          cluster.tabs.push(tabs[j]);
          assigned.add(tabs[j].tabId);
        }
      }

      // Mark first tab as assigned
      assigned.add(tabs[i].tabId);

      // Only create cluster if 2+ tabs
      if (cluster.tabs.length >= 2) {
        // Calculate cluster centroid (average embedding)
        cluster.centroid = this.averageEmbeddings(cluster.tabs.map(t => t.embedding));
        
        // Generate group name from cluster content (now async)
        cluster.groupName = await this.generateGroupName(cluster.tabs, cluster.centroid);
        cluster.color = this.assignColor();
        
        console.log(`Lookalike Offscreen: Created cluster "${cluster.groupName}" with ${cluster.tabs.length} tabs`);
        clusters.push(cluster);
      }
    }

    console.log(`Lookalike Offscreen: Total clusters created: ${clusters.length}`);
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
      } catch (error) {
        console.log('Lookalike: Error in semantic title matching', error);
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
   * Clear all caches
   */
  clearCache() {
    this.embeddingCache.clear();
    this.resetColors();
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
        semanticProcessor.clearCache();
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
console.log('Lookalike Offscreen: Document loaded and ready');

// Don't auto-initialize model - wait for explicit INIT_MODEL message from service worker
// This prevents race conditions

