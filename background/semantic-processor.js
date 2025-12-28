/**
 * Semantic Processor for intelligent tab grouping
 * Uses transformers.js for embeddings and semantic similarity
 */

// Import transformers.js from CDN-compatible source
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/75c167fb-7d96-4feb-ab76-dd1cae42b50d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'semantic-processor.js:32',message:'initialize() called',data:{modelLoaded:this.modelLoaded,modelLoading:this.modelLoading},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (this.modelLoaded) return true;
    if (this.modelLoading) {
      return new Promise((resolve) => {
        this.pendingRequests.push(resolve);
      });
    }

    this.modelLoading = true;

    try {
      console.log('Lookalike: Loading semantic embedding model...');
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/75c167fb-7d96-4feb-ab76-dd1cae42b50d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'semantic-processor.js:47',message:'Starting pipeline() call',data:{model:'Xenova/all-MiniLM-L6-v2'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,E'})}).catch(()=>{});
      // #endregion
      
      // Use a small, fast embedding model optimized for semantic similarity
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { 
          progress_callback: (progress) => {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/75c167fb-7d96-4feb-ab76-dd1cae42b50d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'semantic-processor.js:56',message:'Model progress callback',data:{status:progress.status,progress:progress.progress,file:progress.file,loaded:progress.loaded,total:progress.total},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D,E'})}).catch(()=>{});
            // #endregion
            if (progress.status === 'progress') {
              console.log(`Lookalike: Model loading ${Math.round(progress.progress)}%`);
            }
          }
        }
      );

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/75c167fb-7d96-4feb-ab76-dd1cae42b50d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'semantic-processor.js:67',message:'Pipeline succeeded',data:{embedderExists:!!this.embedder},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion

      this.modelLoaded = true;
      this.modelLoading = false;

      // Resolve pending requests
      this.pendingRequests.forEach(resolve => resolve(true));
      this.pendingRequests = [];

      console.log('Lookalike: Semantic model loaded successfully');
      return true;
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/75c167fb-7d96-4feb-ab76-dd1cae42b50d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'semantic-processor.js:81',message:'Pipeline FAILED',data:{errorName:error.name,errorMessage:error.message,errorStack:error.stack?.slice(0,500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C'})}).catch(()=>{});
      // #endregion
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
    console.log(`Lookalike: Processing "${content.title}"`);
    
    const semanticText = this.extractSemanticContent(content);
    console.log(`Lookalike: Extracted ${semanticText.length} chars of semantic text`);
    
    // Compute embedding
    const embedding = await this.computeEmbedding(semanticText);
    console.log(`Lookalike: Generated embedding (${embedding.length} dimensions)`);
    
    // Extract key phrases for group naming
    const keyPhrases = this.extractKeyPhrases(content);
    console.log(`Lookalike: Key phrases: ${keyPhrases.slice(0, 5).join(', ')}`);
    
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
  clusterTabs(tabsData, similarityThreshold = 0.5) {
    const tabs = Array.from(tabsData.entries()).map(([tabId, data]) => ({
      tabId,
      ...data
    }));

    console.log(`Lookalike: Clustering ${tabs.length} tabs with threshold ${similarityThreshold}`);

    if (tabs.length === 0) return [];

    // Log similarity matrix for debugging
    console.log('Lookalike: Similarity matrix:');
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
          console.log(`Lookalike: Matched! "${tabs[i].title?.slice(0, 25)}" ↔ "${tabs[j].title?.slice(0, 25)}" (${similarity.toFixed(3)})`);
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
        
        // Generate group name from cluster content
        cluster.groupName = this.generateGroupName(cluster.tabs);
        cluster.color = this.assignColor();
        
        console.log(`Lookalike: Created cluster "${cluster.groupName}" with ${cluster.tabs.length} tabs`);
        clusters.push(cluster);
      }
    }

    console.log(`Lookalike: Total clusters created: ${clusters.length}`);
    return clusters;
  }

  /**
   * Generate a meaningful group name from cluster tabs
   */
  generateGroupName(tabs) {
    // Collect all key phrases from tabs
    const allPhrases = tabs.flatMap(t => t.keyPhrases || []);
    
    // Count phrase frequency
    const phraseCount = {};
    allPhrases.forEach(phrase => {
      phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
    });

    // Find phrases that appear in multiple tabs (shared themes)
    const sharedPhrases = Object.entries(phraseCount)
      .filter(([, count]) => count >= Math.min(2, tabs.length))
      .sort((a, b) => b[1] - a[1]);

    if (sharedPhrases.length > 0) {
      // Use the most common shared phrase
      return this.formatGroupName(sharedPhrases[0][0]);
    }

    // Fallback: use domain-based naming
    const domains = tabs.map(t => {
      try {
        return new URL(t.url).hostname.replace('www.', '').split('.')[0];
      } catch {
        return null;
      }
    }).filter(Boolean);

    const domainCount = {};
    domains.forEach(d => {
      domainCount[d] = (domainCount[d] || 0) + 1;
    });

    const topDomain = Object.entries(domainCount)
      .sort((a, b) => b[1] - a[1])[0];

    if (topDomain && topDomain[1] >= 2) {
      return this.formatGroupName(topDomain[0]);
    }

    // Last resort: use first tab's most prominent key phrase
    if (tabs[0]?.keyPhrases?.[0]) {
      return this.formatGroupName(tabs[0].keyPhrases[0]);
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

// Export singleton instance
export const semanticProcessor = new SemanticProcessor();
export { GROUP_COLORS };

