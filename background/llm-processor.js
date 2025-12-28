/**
 * LLM Processor for theme analysis using Web LLM
 * Handles model loading, inference, and theme extraction
 */

// Theme categories for classification
const THEME_CATEGORIES = [
  'technology', 'programming', 'web-development', 'mobile-development',
  'artificial-intelligence', 'machine-learning', 'data-science',
  'news', 'politics', 'world-news', 'local-news',
  'business', 'finance', 'investing', 'cryptocurrency',
  'science', 'research', 'space', 'environment',
  'health', 'medicine', 'fitness', 'nutrition',
  'entertainment', 'movies', 'music', 'gaming', 'streaming',
  'sports', 'football', 'basketball', 'soccer',
  'education', 'learning', 'tutorials', 'courses',
  'shopping', 'e-commerce', 'deals', 'reviews',
  'travel', 'tourism', 'destinations', 'hotels',
  'food', 'recipes', 'restaurants', 'cooking',
  'social-media', 'communication', 'networking',
  'lifestyle', 'fashion', 'beauty', 'home-decor',
  'documentation', 'reference', 'wiki', 'how-to'
];

// Color palette for tab groups
const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

class LLMProcessor {
  constructor() {
    this.modelLoaded = false;
    this.modelLoading = false;
    this.themeCache = new Map();
    this.pendingRequests = [];
  }

  /**
   * Initialize the LLM processor
   * For client-side processing, we use keyword extraction and TF-IDF like approach
   * since full LLM in service worker is complex
   */
  async initialize() {
    if (this.modelLoaded) return true;
    if (this.modelLoading) {
      // Wait for model to load
      return new Promise((resolve) => {
        this.pendingRequests.push(resolve);
      });
    }

    this.modelLoading = true;
    
    try {
      // Initialize keyword extraction weights
      this.stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
        'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
        'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same',
        'so', 'than', 'too', 'very', 'just', 'about', 'into', 'over', 'after',
        'before', 'between', 'through', 'during', 'without', 'again', 'further',
        'then', 'once', 'here', 'there', 'any', 'our', 'your', 'their', 'its',
        'also', 'new', 'first', 'last', 'get', 'got', 'make', 'made', 'see',
        'know', 'take', 'come', 'think', 'look', 'want', 'give', 'use', 'find',
        'tell', 'ask', 'work', 'seem', 'feel', 'try', 'leave', 'call', 'keep',
        'let', 'begin', 'show', 'hear', 'play', 'run', 'move', 'like', 'live',
        'believe', 'hold', 'bring', 'happen', 'write', 'provide', 'sit', 'stand',
        'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change',
        'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak',
        'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk', 'win', 'offer',
        'remember', 'love', 'consider', 'appear', 'buy', 'wait', 'serve', 'die',
        'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill',
        'remain', 'suggest', 'raise', 'pass', 'sell', 'require', 'report',
        'decide', 'pull', 'click', 'page', 'site', 'website', 'home', 'menu',
        'search', 'sign', 'login', 'register', 'account', 'privacy', 'terms',
        'cookie', 'cookies', 'accept', 'close', 'skip', 'next', 'previous',
        'back', 'forward', 'loading', 'please', 'wait', 'error', 'success'
      ]);

      // Build category keywords map
      this.categoryKeywords = this.buildCategoryKeywords();
      
      this.modelLoaded = true;
      this.modelLoading = false;
      
      // Resolve pending requests
      this.pendingRequests.forEach(resolve => resolve(true));
      this.pendingRequests = [];
      
      console.log('Lookalike: LLM Processor initialized');
      return true;
    } catch (error) {
      this.modelLoading = false;
      console.error('Lookalike: Failed to initialize LLM processor', error);
      throw error;
    }
  }

  /**
   * Build keyword mappings for each category
   */
  buildCategoryKeywords() {
    return {
      'technology': ['tech', 'software', 'hardware', 'computer', 'digital', 'device', 'gadget', 'innovation', 'startup', 'silicon'],
      'programming': ['code', 'coding', 'developer', 'programming', 'javascript', 'python', 'java', 'rust', 'golang', 'typescript', 'react', 'vue', 'angular', 'node', 'api', 'backend', 'frontend', 'fullstack', 'debug', 'git', 'github', 'repository', 'commit', 'branch', 'merge', 'function', 'class', 'variable', 'algorithm', 'data structure'],
      'web-development': ['html', 'css', 'javascript', 'web', 'website', 'frontend', 'backend', 'responsive', 'browser', 'dom', 'http', 'rest', 'graphql', 'webpack', 'npm', 'yarn'],
      'mobile-development': ['ios', 'android', 'mobile', 'app', 'swift', 'kotlin', 'flutter', 'react native', 'xamarin', 'cordova'],
      'artificial-intelligence': ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'nlp', 'computer vision', 'chatgpt', 'gpt', 'llm', 'openai', 'anthropic', 'claude', 'gemini', 'transformer', 'bert', 'model', 'training', 'inference'],
      'machine-learning': ['ml', 'machine learning', 'tensorflow', 'pytorch', 'scikit', 'keras', 'model', 'training', 'dataset', 'feature', 'regression', 'classification', 'clustering', 'neural'],
      'data-science': ['data', 'analytics', 'statistics', 'visualization', 'pandas', 'numpy', 'jupyter', 'notebook', 'dataset', 'analysis', 'insights', 'dashboard', 'metrics'],
      'news': ['news', 'breaking', 'headline', 'report', 'journalist', 'article', 'press', 'media', 'coverage', 'update', 'latest', 'today', 'yesterday'],
      'politics': ['politics', 'political', 'government', 'election', 'vote', 'congress', 'senate', 'president', 'democrat', 'republican', 'policy', 'legislation', 'law', 'campaign'],
      'business': ['business', 'company', 'corporate', 'enterprise', 'startup', 'ceo', 'management', 'strategy', 'revenue', 'profit', 'market', 'industry', 'commerce'],
      'finance': ['finance', 'financial', 'money', 'bank', 'banking', 'investment', 'stock', 'market', 'trading', 'portfolio', 'wealth', 'asset', 'credit', 'loan', 'mortgage'],
      'cryptocurrency': ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'token', 'nft', 'defi', 'wallet', 'mining', 'coin', 'altcoin', 'exchange', 'binance', 'coinbase'],
      'science': ['science', 'scientific', 'research', 'study', 'experiment', 'discovery', 'laboratory', 'physics', 'chemistry', 'biology', 'astronomy', 'quantum'],
      'health': ['health', 'medical', 'medicine', 'doctor', 'hospital', 'treatment', 'disease', 'symptom', 'diagnosis', 'therapy', 'wellness', 'healthcare', 'patient'],
      'fitness': ['fitness', 'exercise', 'workout', 'gym', 'training', 'muscle', 'cardio', 'strength', 'weight', 'diet', 'nutrition', 'protein', 'calories'],
      'entertainment': ['entertainment', 'celebrity', 'hollywood', 'show', 'performance', 'comedy', 'drama', 'actor', 'actress', 'star', 'fame'],
      'movies': ['movie', 'film', 'cinema', 'director', 'actor', 'actress', 'trailer', 'review', 'box office', 'oscar', 'netflix', 'streaming', 'imdb'],
      'music': ['music', 'song', 'album', 'artist', 'singer', 'band', 'concert', 'spotify', 'playlist', 'genre', 'rock', 'pop', 'hip hop', 'jazz', 'classical'],
      'gaming': ['game', 'gaming', 'video game', 'playstation', 'xbox', 'nintendo', 'steam', 'esports', 'multiplayer', 'fps', 'rpg', 'mmorpg', 'gamer', 'twitch'],
      'sports': ['sports', 'game', 'match', 'team', 'player', 'score', 'championship', 'tournament', 'league', 'season', 'coach', 'athlete', 'win', 'victory'],
      'education': ['education', 'learning', 'school', 'university', 'college', 'student', 'teacher', 'course', 'class', 'degree', 'academic', 'study', 'exam', 'curriculum'],
      'shopping': ['shop', 'shopping', 'buy', 'purchase', 'cart', 'checkout', 'price', 'discount', 'sale', 'deal', 'product', 'order', 'delivery', 'amazon', 'ebay'],
      'travel': ['travel', 'trip', 'vacation', 'holiday', 'destination', 'flight', 'hotel', 'booking', 'tourism', 'tourist', 'adventure', 'explore', 'journey'],
      'food': ['food', 'recipe', 'cooking', 'restaurant', 'cuisine', 'meal', 'ingredient', 'chef', 'kitchen', 'dish', 'taste', 'flavor', 'delicious', 'eat'],
      'social-media': ['social', 'twitter', 'facebook', 'instagram', 'tiktok', 'linkedin', 'reddit', 'post', 'share', 'follow', 'like', 'comment', 'viral', 'trend'],
      'documentation': ['documentation', 'docs', 'guide', 'tutorial', 'manual', 'reference', 'api', 'specification', 'wiki', 'readme', 'getting started', 'installation']
    };
  }

  /**
   * Extract theme from page content
   */
  async extractTheme(content) {
    await this.initialize();

    // Check cache first
    const cacheKey = this.generateCacheKey(content.url);
    if (this.themeCache.has(cacheKey)) {
      return this.themeCache.get(cacheKey);
    }

    // Combine all text content
    const fullText = [
      content.title,
      content.ogTitle,
      content.metaDescription,
      content.metaKeywords,
      content.headings?.map(h => h.text).join(' ') || '',
      content.mainContent
    ].join(' ').toLowerCase();

    // Extract keywords and their frequencies
    const keywords = this.extractKeywords(fullText);
    
    // Match to categories
    const categoryScores = this.matchCategories(keywords, fullText);
    
    // Get top categories
    const sortedCategories = Object.entries(categoryScores)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const primaryTheme = sortedCategories[0]?.[0] || 'general';
    const secondaryThemes = sortedCategories.slice(1).map(([cat]) => cat);
    
    // Extract top keywords for display
    const topKeywords = Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    const result = {
      primary: primaryTheme,
      secondary: secondaryThemes,
      keywords: topKeywords,
      confidence: sortedCategories[0]?.[1] || 0,
      groupName: this.formatGroupName(primaryTheme),
      color: this.assignColor(primaryTheme)
    };

    // Cache the result
    this.themeCache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    // Tokenize and clean
    const words = text
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 2 && 
        word.length < 30 &&
        !this.stopWords.has(word) &&
        !/^\d+$/.test(word)
      );

    // Count frequencies
    const frequencies = {};
    words.forEach(word => {
      frequencies[word] = (frequencies[word] || 0) + 1;
    });

    return frequencies;
  }

  /**
   * Match keywords to categories
   */
  matchCategories(keywords, fullText) {
    const scores = {};

    for (const [category, categoryWords] of Object.entries(this.categoryKeywords)) {
      let score = 0;
      
      for (const keyword of categoryWords) {
        // Check if keyword exists in the text
        if (fullText.includes(keyword)) {
          // Weight by keyword frequency if it's a single word
          const singleWordMatch = keywords[keyword];
          if (singleWordMatch) {
            score += singleWordMatch * 2;
          } else {
            // Multi-word keyword match
            score += 3;
          }
        }
      }
      
      scores[category] = score;
    }

    return scores;
  }

  /**
   * Calculate similarity between two themes
   */
  calculateSimilarity(theme1, theme2) {
    if (theme1.primary === theme2.primary) {
      return 1.0;
    }

    // Check if primary matches any secondary
    if (theme2.secondary?.includes(theme1.primary) || 
        theme1.secondary?.includes(theme2.primary)) {
      return 0.7;
    }

    // Check keyword overlap
    const keywords1 = new Set(theme1.keywords || []);
    const keywords2 = new Set(theme2.keywords || []);
    
    const intersection = [...keywords1].filter(k => keywords2.has(k)).length;
    const union = new Set([...keywords1, ...keywords2]).size;
    
    if (union === 0) return 0;
    
    const jaccardSimilarity = intersection / union;
    
    // Check if in same category family
    const relatedCategories = {
      'programming': ['web-development', 'mobile-development', 'technology'],
      'web-development': ['programming', 'technology'],
      'mobile-development': ['programming', 'technology'],
      'artificial-intelligence': ['machine-learning', 'data-science', 'technology'],
      'machine-learning': ['artificial-intelligence', 'data-science', 'technology'],
      'data-science': ['machine-learning', 'artificial-intelligence', 'technology'],
      'news': ['politics', 'world-news', 'local-news'],
      'politics': ['news', 'government'],
      'business': ['finance', 'investing'],
      'finance': ['business', 'investing', 'cryptocurrency'],
      'investing': ['finance', 'business', 'cryptocurrency'],
      'cryptocurrency': ['finance', 'investing', 'technology'],
      'health': ['medicine', 'fitness', 'nutrition'],
      'fitness': ['health', 'nutrition', 'sports'],
      'entertainment': ['movies', 'music', 'gaming'],
      'movies': ['entertainment', 'streaming'],
      'music': ['entertainment'],
      'gaming': ['entertainment', 'technology']
    };

    const related1 = relatedCategories[theme1.primary] || [];
    const related2 = relatedCategories[theme2.primary] || [];

    if (related1.includes(theme2.primary) || related2.includes(theme1.primary)) {
      return Math.max(0.5, jaccardSimilarity);
    }

    return jaccardSimilarity * 0.5;
  }

  /**
   * Generate cache key from URL
   */
  generateCacheKey(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Format category name for display
   */
  formatGroupName(category) {
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Assign a color to a theme
   */
  assignColor(theme) {
    // Use consistent colors for categories
    const colorMap = {
      'technology': 'blue',
      'programming': 'cyan',
      'web-development': 'cyan',
      'mobile-development': 'purple',
      'artificial-intelligence': 'purple',
      'machine-learning': 'purple',
      'data-science': 'blue',
      'news': 'red',
      'politics': 'red',
      'business': 'green',
      'finance': 'green',
      'cryptocurrency': 'orange',
      'science': 'blue',
      'health': 'pink',
      'fitness': 'orange',
      'entertainment': 'yellow',
      'movies': 'yellow',
      'music': 'pink',
      'gaming': 'purple',
      'sports': 'green',
      'education': 'blue',
      'shopping': 'orange',
      'travel': 'cyan',
      'food': 'orange',
      'social-media': 'blue',
      'documentation': 'grey'
    };

    return colorMap[theme] || 'grey';
  }

  /**
   * Clear the theme cache
   */
  clearCache() {
    this.themeCache.clear();
  }
}

// Export for use in service worker
export const llmProcessor = new LLMProcessor();
export { THEME_CATEGORIES, GROUP_COLORS };

