# OBS Graphics Control System MVP

Real-time broadcast graphics control for OBS with a React panel, an Express API and WebSocket-driven overlays.

## Architecture

- `client/`: React + Vite control panel.
- `server/`: Express API, image processing, upload persistence and WebSocket sync.
- `overlay/`: static OBS browser-source pages served by the backend at `/overlay/*`.

The deployment target for this repository is:

- GitHub as the single repository.
- Vercel for `client/`.
- Render Web Service for `server/`.

## Local Setup

### 1. Start the backend

```bash
cd server
npm install
npm start
```

By default, the backend runs at `http://localhost:3000` and serves both HTTP and WebSocket traffic from the same origin.

### 2. Start the panel

```bash
cd client
npm install
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173`.

### 3. Configure OBS sources

Create two Browser Sources in OBS:

- Text source: `http://localhost:3000/overlay/text.html`
- Image source: `http://localhost:3000/overlay/image.html`

Optional combined preview:

- `http://localhost:3000/overlay/index.html`

Source size should be `1920x1080`.

## Environment Variables

### Client

Copy `client/.env.example` to `.env` when needed.

- `VITE_API_BASE_URL`: public backend base URL used by the control panel.
- `VITE_OVERLAY_BASE_URL`: public backend base URL shown in the OBS source cards. If omitted, it falls back to `VITE_API_BASE_URL`.
- `VITE_KEEPALIVE_INTERVAL_MS`: how often the panel pings `/health` during an active session.
- `VITE_WAKE_MAX_RETRY_MS`: max backoff used while waiting for the backend to wake up.

### Server

Copy `server/.env.example` to `.env` when needed.

- `PORT`: HTTP port used by Express and WebSocket.
- `PUBLIC_BASE_URL`: public origin used to build absolute image URLs returned by the API.
- `DATA_DIR`: optional directory for persistent uploads and `image-metadata.json`. On Render, point this to the mounted disk path.

## Session Wake Strategy

The panel is responsible for keeping the backend warm during real usage.

- On load, the panel retries `GET /health` until the backend is available.
- Once the backend responds, the panel loads `/state` and starts the normal workflow.
- During an active session, the panel sends periodic keepalives to reduce the chance of sleep on Render.
- If the backend becomes unavailable, the panel enters reconnect mode and retries automatically.

This is a mitigation for cold starts, not a guarantee. If you need instant availability during live operation, use a Render plan without service sleep.

## Deployment

### GitHub

- Push the repository root as a single monorepo.
- Keep `client/`, `server/` and `overlay/` in the same repository.

### Vercel

- Import the repository.
- Set the root directory to `client`.
- Build command: `npm run build`.
- Output directory: `dist`.
- Configure the client environment variables with the public backend URL.

### Render

- Create a Web Service from the same repository.
- Set the root directory to `server`.
- Build command: `npm install`.
- Start command: `npm start`.
- Attach a persistent disk and set `DATA_DIR` to the mount path.
- Set `PUBLIC_BASE_URL` to the public Render URL or your custom backend domain.

Render must serve the backend and overlays from the same public origin so that:

- `/state` and `/uploads/*` resolve correctly.
- WebSocket uses `ws://` locally and `wss://` in production.
- OBS overlays can load without mixed-content issues.

## API Summary

- `GET /health`: backend readiness check.
- `GET /state`: current full state.
- `GET /images`: uploaded image library.
- `POST /zocalo`: update lower-third text.
- `POST /title`: update title strap.
- `POST /quote`: update quote card.
- `POST /upload`: upload one image.
- `POST /image/select`: choose active image.
- `PATCH /image/:imageId/meta`: update favorite and tags.
- `DELETE /image/:imageId`: remove image from library and disk.
- `POST /text/visibility`: show or hide the text source.
- `POST /text-layer-visibility`: show or hide a specific text layer.
- `POST /image/visibility`: show or hide the image source.
- `POST /scene`: helper for `lower_third`, `image_full` and `hidden`.

## Notes

- Uploaded images are normalized to `1920x1080 PNG`.
- Text and image visibility are controlled independently.
- Overlays reconnect automatically if the WebSocket drops.
- Keyboard shortcuts in the panel:
  - `1` show text
  - `2` hide text
  - `3` show image
  - `4` hide image

## Requirements

- Node.js 18+
- OBS Studio
- A modern browser
