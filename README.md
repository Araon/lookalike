# lookalike

a chrome extension that groups related tabs by comparing their page content

lookalike creates embeddings in your browser with `Xenova/all-MiniLM-L6-v2` and uses chrome tab groups. page content stays on your device

## install

1. clone or download this repository
2. open `chrome://extensions/`
3. enable developer mode
4. choose **load unpacked** and select this directory

the model downloads on first use and chrome caches it

## use

open the extension and select **analyze all**. use **regroup** after opening more tabs or **ungroup** to remove the groups

## development

```bash
npm install
npm run lint
```
