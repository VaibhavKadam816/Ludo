# Ludo

Ad-free online Ludo for 2–6 friends in the browser. No accounts, no installs, no dependencies.

- The host creates a room and shares the **room number** and **passcode**.
- 2–4 players get the classic board; 5–6 players get a 5- or 6-armed board.
- The server rolls the dice and checks every move.

## Run locally

Needs Node.js 18 or later.

```bash
npm start
```

Open http://localhost:3000. Friends on the same Wi-Fi can use `http://<your-computer-ip>:3000`.

Rule tests: `npm test`

## Deploy (GitHub + Render, free)

GitHub Pages can't run this game because it needs a server. Keep the code on GitHub and let Render run it:

1. Push this folder to a GitHub repository.
2. Sign in at https://render.com with GitHub.
3. Click **New → Blueprint**, pick the repository, and click **Apply**. Render reads `render.yaml`.
4. When the deploy finishes, share the `https://ludo-xxxx.onrender.com` URL with friends.

Every push to the repo redeploys automatically.

Notes:
- On the free plan the server sleeps after about 15 minutes with nobody connected. The first visit afterwards takes about a minute, and any open rooms are lost.
- Rooms live in memory, so run a single instance only.

Railway, Fly.io or any Node host also works: the start command is `npm start`, and the port comes from the `PORT` environment variable.

## Files

- `server.js`: game server and rules (`node server.js test` runs the rule checks)
- `index.html`: the whole client (board, lobby, die)
- `render.yaml`: Render deploy config
