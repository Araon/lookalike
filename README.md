# Lookalike

<div align="center">
  <img src="icons/icon128.png" alt="Lookalike Icon" width="128" height="128">
  <p><strong>Intelligent tab grouping using semantic AI</strong></p>
</div>

A Chrome extension that automatically groups similar tabs by understanding their content meaning, not just keywords. All AI processing runs locally in your browser for maximum privacy.

## Why This Extension?

When you have dozens of browser tabs open, manually organizing them is time-consuming and tedious. Traditional grouping methods rely on keywords or domains, but they miss the actual meaning behind the content. 

**Lookalike solves this by:**
- Understanding the semantic meaning of each page (not just matching words)
- Automatically grouping related content, even when it's from different websites
- Creating meaningful group names based on shared themes
- Processing everything locally—your browsing data never leaves your computer

For example, tabs about "JavaScript tutorials", "React documentation", and "Node.js guides" will be grouped together as "Web Development", even though they share few common keywords.

## How Tabs Are Grouped

The grouping process happens in 4 steps:

### 1. Content Extraction
The extension extracts meaningful text from each page:
- Page title and meta descriptions
- Headings and main content
- Key phrases that represent the page's topic

### 2. Semantic Embeddings
Each tab's content is converted into a 384-dimensional vector (embedding) using the `all-MiniLM-L6-v2` AI model. This numerical representation captures the semantic meaning of the content.

### 3. Similarity Matching
The extension compares all tab embeddings using cosine similarity:
- Tabs with similarity ≥ 0.45 are considered related
- Related tabs are clustered together into groups
- Only groups with 2+ tabs are created

### 4. Group Naming
Each group gets an intelligent name:
- Finds key phrases shared across multiple tabs in the cluster
- Uses the most common shared phrase as the group name
- Falls back to domain-based names if no shared phrases exist

**Example:** Tabs about "Python programming", "JavaScript tutorials", and "Ruby guides" might be grouped as "Programming" because they share the semantic theme of coding education, even with different keywords.

## Installation

1. Clone or download this repository
2. Generate icons (if not present):
   ```bash
   node scripts/generate-icons.js
   ```
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" and select this directory

**First Run:** The extension downloads the AI model (~23MB) on first load. This happens once and is cached for future use.

## Usage

- **Analyze All**: Click to process all open tabs and group them automatically
- **Regroup**: Re-cluster tabs after opening new ones
- **Ungroup**: Remove all groups


## Technical Details

- **Model**: `Xenova/all-MiniLM-L6-v2` via transformers.js
- **Embedding Size**: 384 dimensions
- **Similarity Threshold**: 0.45 (cosine similarity)
- **Minimum Cluster Size**: 2 tabs
