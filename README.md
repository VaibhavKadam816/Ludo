# Ludo

Ad-free online Ludo for 2–6 friends, running entirely on GitHub Pages. No server, no accounts, nothing to pay for.

- The host picks how many players (2–6), creates a room and shares the **invite link** (or the room number and passcode).
  The game starts by itself once everyone has joined; the host can also start early.
- 2–4 players get the classic board; 5–6 players get a 5- or 6-armed board.
- Moves with only one real choice are played automatically.
- Effects: pawns hop square by square, captures explode and the captured pawn marches back to its yard,
  plus banners for SIX, HOME and the winner, with sounds and a volume slider.
- Voice chat: mute your mic, mute any player, leave voice, or exit the game.
- Stats (games, wins, captures, time played, recent games) are saved on each player's own device.

## How it works

The host's browser runs the game. Other players connect straight to it (peer-to-peer, WebRTC).
To find each other, browsers use free public Nostr relays through the open-source [Trystero](https://github.com/dmotz/trystero) library.
The room passcode encrypts that handshake, so only people with the link or passcode can join.

Things to know:
- **The host must keep the game open.** If the host closes the page, the game ends for everyone.
  If the host only refreshes, the game resumes where it was and everyone reconnects automatically.
- **Some networks block direct connections**: some mobile-data carriers and strict office or school Wi-Fi.
  Players on those networks can't connect; home Wi-Fi usually works. (Fixing this needs a TURN relay server, which isn't included.)
- The host's browser rolls the dice, so a tech-savvy host could cheat. Fine among friends.
- If the public relays are unreachable, players can't find each other until they're back.

## Deploy on GitHub Pages

1. Put these files in a **public** GitHub repository (Pages on a free account needs a public repo).
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`, then **Save**.
3. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

Every push to `main` updates the site.

## Run locally

The page uses JavaScript modules, so open it through a local web server rather than double-clicking the file:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Rule tests (needs Node.js 18+): `npm test`

## Files

- `index.html`: the whole client (board, lobby, die, effects, sound, voice, stats, networking)
- `game.js`: the game rules the host runs
- `test.js`: rule tests
