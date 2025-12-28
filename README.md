# Lookalike

A Chrome extension that intelligently groups tabs using **semantic AI** - it understands content meaning, not just keywords. All processing happens locally in your browser for maximum privacy.

## Features

- **Semantic Understanding**: Uses transformer-based embeddings (all-MiniLM-L6-v2) to understand the actual meaning of page content
- **Dynamic Group Names**: Group names are generated from the actual content, not predefined categories
- **Smart Clustering**: Tabs are grouped based on cosine similarity of their semantic embeddings
- **Privacy-First**: All AI processing runs locally in your browser - no data sent to external servers
- **Beautiful UI**: Modern, sleek dark interface with real-time status updates

## How It Works

1. **Content Extraction**: The extension extracts meaningful text from each page (title, meta, headings, main content)
2. **Semantic Embeddings**: Each tab's content is converted to a 384-dimensional embedding vector using transformers.js
3. **Similarity Matching**: Tabs with similar embeddings (cosine similarity > 0.45) are clustered together
4. **Intelligent Naming**: Group names are derived from shared key phrases across clustered tabs

## Installation

### From Source

1. Clone or download this repository
2. Generate the icons (if not present):
   ```bash
   node scripts/generate-icons.js
   ```
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right corner
5. Click "Load unpacked" and select the extension directory
6. The Lookalike icon should appear in your extensions bar

### First Run

On first load, the extension will download the semantic model (~23MB). This happens once and is cached for future use. You'll see "Loading semantic model..." in the popup until it's ready.

## Usage

1. **Analyze All**: Click "Analyze All" to process all open tabs in the current window
2. **Automatic Grouping**: Similar tabs will be automatically grouped with meaningful names
3. **Regroup**: Click the refresh button to re-cluster tabs after opening new ones
4. **Ungroup**: Click the X button to remove all groups

## File Structure

```
lookalike/
├── manifest.json              # Extension manifest (Manifest V3)
├── background/
│   ├── service-worker.js      # Main background logic & tab management
│   ├── semantic-processor.js  # Semantic embedding & clustering engine
│   ├── storage-manager.js     # Persistent storage handling
│   └── error-handler.js       # Error handling utilities
├── content/
│   └── content-script.js      # Page content extraction
├── popup/
│   ├── popup.html             # Popup UI structure
│   ├── popup.js               # Popup logic
│   └── popup.css              # Popup styling (dark theme)
├── scripts/
│   └── generate-icons.js      # Icon generation utility
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Technical Details

### Semantic Model

- **Model**: `Xenova/all-MiniLM-L6-v2` via transformers.js
- **Embedding Size**: 384 dimensions
- **Processing**: Mean pooling with L2 normalization

### Clustering Algorithm

- Uses agglomerative clustering based on cosine similarity
- Default similarity threshold: 0.45 (empirically tuned for web content)
- Minimum cluster size: 2 tabs

### Group Naming

1. Extract key phrases from all tabs in a cluster
2. Find phrases appearing in multiple tabs (shared themes)
3. Use the most common shared phrase as the group name
4. Fallback to domain-based naming if no shared phrases

## Privacy

All processing happens locally:
- The semantic model runs entirely in your browser via WebAssembly
- No page content is ever sent to external servers
- Tab data is stored locally in Chrome's extension storage
