# Orchestrator

Run and supervise AI coding agents from your desktop and your phone. A native Windows app built with Go and React ([Wails](https://wails.io/)), plus an installable iOS home-screen app that connects back to your PC.

![Orchestrator deck](website/assets/shots/desktop-deck-hero-2000.webp)

## Desktop

| | |
|---|---|
| ![Grid](website/assets/shots/desktop-grid-1000.webp) | ![Plan](website/assets/shots/desktop-plan-1000.webp) |
| ![Git](website/assets/shots/desktop-git-1000.webp) | ![Preview](website/assets/shots/desktop-preview-1000.webp) |
| ![Models](website/assets/shots/desktop-models-1000.webp) | ![Usage](website/assets/shots/desktop-usage-1000.webp) |
| ![Tasks](website/assets/shots/desktop-tasks-1000.webp) | ![Question](website/assets/shots/desktop-question-1000.webp) |

## Phone

<p>
  <img src="website/assets/shots/mobile-chat-live-780.webp" width="180">
  <img src="website/assets/shots/mobile-approval-780.webp" width="180">
  <img src="website/assets/shots/mobile-diff-780.webp" width="180">
  <img src="website/assets/shots/mobile-drawer-780.webp" width="180">
</p>
<p>
  <img src="website/assets/shots/mobile-files-780.webp" width="180">
  <img src="website/assets/shots/mobile-models-780.webp" width="180">
  <img src="website/assets/shots/mobile-preview-780.webp" width="180">
  <img src="website/assets/shots/mobile-chat-light-780.webp" width="180">
</p>

## Layout

- `desktop/`: the Wails app (Go entry point, React frontend in `desktop/frontend`, build assets)
- `internal/`: Go packages shared by the desktop app and the phone server
- `internal/remote/mobile/`: the phone app (React + Vite), embedded into the desktop binary at build time
- `cmd/`: developer tools
- `scripts/`: Windows install and update scripts
- `tools/`: Vite plugins shared by both UIs
- `website/`: landing page

## Development

Run from `desktop/`:

- Live development: `wails dev`
- Production build: `wails build` (also builds the phone app, which is not committed)
- Update the installed exe: `scripts/update-exe.ps1`

Phone app on its own: `cd internal/remote/mobile && npm install && npm run dev`.
