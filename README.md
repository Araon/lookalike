# Lookalike

A Chrome extension that automatically groups tabs by theme using AI-powered content analysis. No external APIs required - all processing happens client-side for maximum privacy.


## Installation

### From Source

1. Clone or download this repository
2. Generate the icons:
   ```bash
   node scripts/generate-icons.js
   ```
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right corner
5. Click "Load unpacked" and select the extension directory
6. The Lookalike icon should appear in your extensions bar


### Theme Detection

The extension uses a sophisticated keyword extraction and category matching system:

1. **Content Extraction**: Extracts meaningful text from pages (excluding navigation, ads, scripts)
2. **Keyword Analysis**: Identifies important keywords using TF-IDF-like weighting
3. **Category Matching**: Matches keywords against 25+ predefined theme categories
4. **Similarity Scoring**: Uses Jaccard similarity and category relationships to group related tabs



## File Structure

```
lookalike/
├── manifest.json              # Extension manifest (Manifest V3)
├── background/
│   ├── service-worker.js      # Main background logic
│   ├── llm-processor.js       # Theme analysis engine
│   ├── storage-manager.js     # Persistent storage handling
│   └── error-handler.js       # Error handling utilities
├── content/
│   └── content-script.js      # Page content extraction
├── popup/
│   ├── popup.html             # Popup UI structure
│   ├── popup.js               # Popup logic
│   └── popup.css              # Popup styling
├── scripts/
│   └── generate-icons.js      # Icon generation utility
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```


