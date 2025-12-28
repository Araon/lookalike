# Lookalike - Smart Tab Grouping Chrome Extension

A Chrome extension that automatically groups tabs by theme using AI-powered content analysis. No external APIs required - all processing happens client-side for maximum privacy.

## Features

- **Automatic Tab Grouping**: Tabs are automatically grouped based on their content theme
- **Client-Side Processing**: All content analysis happens locally in your browser
- **Smart Theme Detection**: Analyzes page titles, headings, meta descriptions, and main content
- **Multiple Theme Categories**: Supports 25+ categories including technology, programming, news, finance, entertainment, and more
- **Beautiful UI**: Modern, dark-themed popup with real-time updates
- **Privacy-First**: No data is sent to external servers

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

### Icons

If you don't have Node.js installed, you can manually create PNG icons (16x16, 48x48, 128x128) and place them in the `icons/` folder with names `icon16.png`, `icon48.png`, and `icon128.png`.

## Usage

1. **Automatic Grouping**: Simply browse the web! As you open pages, the extension analyzes their content and automatically groups related tabs.

2. **Manual Controls**: Click the extension icon to open the popup:
   - **Regroup All**: Re-analyze and group all tabs
   - **Ungroup**: Remove all tab groups
   - **Analyze Current Tab**: Force analysis of the current tab

3. **View Groups**: The popup shows all your tab groups with:
   - Theme name and color
   - Number of tabs in each group
   - Keywords associated with the theme
   - Expandable list of tabs

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Tab                               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Content Script (content-script.js)              │ │
│  │  • Extracts page title, meta, headings                      │ │
│  │  • Cleans and processes main content                        │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │           Background Service Worker                          │ │
│  │  ┌──────────────────┐  ┌─────────────────────────────────┐  │ │
│  │  │  LLM Processor   │  │     Tab Grouping Logic          │  │ │
│  │  │  • Keyword       │  │  • Similarity calculation       │  │ │
│  │  │    extraction    │──▶│  • Chrome Tab Groups API       │  │ │
│  │  │  • Category      │  │  • Group management             │  │ │
│  │  │    matching      │  │                                 │  │ │
│  │  └──────────────────┘  └─────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Theme Detection

The extension uses a sophisticated keyword extraction and category matching system:

1. **Content Extraction**: Extracts meaningful text from pages (excluding navigation, ads, scripts)
2. **Keyword Analysis**: Identifies important keywords using TF-IDF-like weighting
3. **Category Matching**: Matches keywords against 25+ predefined theme categories
4. **Similarity Scoring**: Uses Jaccard similarity and category relationships to group related tabs

### Supported Categories

- **Technology**: programming, web-development, mobile-development, AI/ML, data-science
- **News & Politics**: news, politics, world-news
- **Business & Finance**: business, finance, investing, cryptocurrency
- **Science & Education**: science, research, education, tutorials
- **Entertainment**: movies, music, gaming, streaming
- **Lifestyle**: health, fitness, food, travel, shopping
- **Social**: social-media, communication

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

## Permissions

The extension requires the following permissions:

- `tabs`: Access tab information and URLs
- `tabGroups`: Create and manage tab groups
- `storage`: Store theme data and settings
- `activeTab`: Access the current tab's content
- `scripting`: Inject content scripts
- `<all_urls>`: Analyze content from any website

## Privacy

- All content analysis happens locally in your browser
- No data is sent to external servers
- Theme data is stored locally using Chrome's storage API
- You can clear all cached data at any time

## Development

### Prerequisites

- Node.js (for icon generation)
- Chrome browser (Manifest V3 support)

### Building

```bash
# Generate icons
node scripts/generate-icons.js
```

### Testing

1. Load the extension in developer mode
2. Open multiple tabs from similar topics
3. Click the extension icon to see grouped tabs

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - feel free to use and modify as needed.

## Roadmap

- [ ] Add WebLLM integration for more accurate theme detection
- [ ] Custom theme categories
- [ ] Export/import group configurations
- [ ] Keyboard shortcuts
- [ ] Options page for settings
- [ ] Sync across devices

