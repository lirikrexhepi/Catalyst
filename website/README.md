# Orchestrator website

One static page for the desktop app and the phone app. No build step: open `index.html` through any static server, or deploy this folder as its own Vercel project (root directory `website`).

Set the download link in `js/site.js` (`LINKS.download`). While it is empty the download buttons scroll to the end of the page.

## Layout

- `index.html`, `css/site.css`, `js/site.js`: the page
- `js/kit.js`: glass rim, squircle clip and spring helpers, bundled from the lirik-skills `performant-glass` kit
- `assets/`: optimized screenshots (`shots/`), wallpapers, icons
- `fonts/`: Geist and Geist Mono
- `tools/`: everything used to generate the screenshots and assets

## Regenerating the screenshots

The screenshots are the real apps running in headless Chromium against mocked backends, so they show the current UI.

```
cd tools
npm install

node serve-demo.mjs 5317
npm run dev --prefix ../../desktop/frontend
npm run dev --prefix ../../internal/remote/mobile -- --port 5199 --strictPort

node shoot-desktop.mjs
node shoot-mobile.mjs
node build-assets.mjs
node extra-assets.mjs
node serve-site.mjs 4173
```

- `desk-story.mjs` and `story.mjs` hold the demo data (agents, chats, diffs, quotas)
- `desktop.mjs` and `mobile.mjs` mock the Wails bindings and the phone API
- `demo/` is the small fictional web app shown in the preview panes
- Raw captures land in `shots/raw/` (not committed), `build-assets.mjs` turns them into `assets/shots/`
