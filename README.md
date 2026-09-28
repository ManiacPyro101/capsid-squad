# Capsid Wasteland · private squad server

The game finds squadmates through a small "signalling" server. By default it uses the **free public PeerJS server**
(nothing to set up). This folder is the **private** option: your own server, which the game talks to in exactly the same
way, plus one extra: if two players can't connect directly (strict school, work or mobile networks), it relays their
game traffic itself.

It is a single file with **no dependencies**: you only need Node.js 18 or newer.

## Quick start (Windows): one PC, or friends on the same Wi-Fi

1. Install **Node.js LTS** from https://nodejs.org (one time).
2. Put the game file (`capsid_wasteland_vNN.html` or newer) in this `server` folder, next to `relay_server.js`.
3. Double-click **`start_squad_server.bat`** (macOS/Linux: `start_squad_server.command`). A window opens with the
   addresses and your browser opens `http://localhost:8787/`.
4. Every player opens the game **from that address**, not from the file on disk:
   - on this PC: `http://localhost:8787/` (open it in two browser windows to test a squad by yourself)
   - on other computers on the same Wi-Fi: the `http://192.168.x.x:8787/` address printed in the window.
   A game page opened from the server uses that server automatically: nothing to change in ⚙.
5. Keep the window open while playing. Windows may ask to let Node.js through the firewall: allow **Private networks**.

## Run it by hand

    node relay_server.js

It listens on port 8787 and serves the newest `capsid_wasteland_vNN.html` it finds (this folder, the folder above it,
or the current folder). Players who open the game from a file instead can still use it: **⚙** → **Private server** →
`ws://<this computer's IP>:8787`.

Optional:

    KEY=mysecret node relay_server.js                          # players must also type the key in ⚙
    GAME_FILE=/path/to/capsid_wasteland_vNN.html node relay_server.js
    PORT=9000 node relay_server.js

## Put it on the internet (play with friends anywhere)

**Easiest:** use the ready-made online package (`capsid_online_server_vNN.zip`, the `deploy/` folder in the source). It includes a Render Blueprint, a Dockerfile and a step-by-step `setup_guide.html`. A summary follows.

Any host that runs a Node.js web service works (Render, Railway, Fly.io, a small VPS…):

1. Upload this folder (`relay_server.js`, and the game file if you want it served at the address too).
2. Start command: `node relay_server.js` (the host sets `PORT` for you).
3. The host gives you an HTTPS address such as `https://capsid-squad.onrender.com`.
   Everyone opens that address to play (the page uses the server automatically), or, from a game file, enters it in ⚙
   with **wss://** instead of https:// → `wss://capsid-squad.onrender.com`.

Free tiers that "sleep" when idle take a few seconds to wake up; the first connection may time out once, just try again.

## What it does

- Speaks the PeerJS signalling protocol (`/peerjs?key=…&id=…`, `OPEN`, `OFFER`, `ANSWER`, `CANDIDATE`, `LEAVE`, `EXPIRE`,
  `HEARTBEAT`), so players connect peer-to-peer over WebRTC.
- Adds `RELAY`: if no direct link opens within 7 seconds, the game sends its traffic through the server instead.
- `/health` returns `ok <number of connected players>`.

## TURN (optional)

For the rare networks where even relaying signalling isn't enough for a direct link and you'd rather not relay through
this server, you can run a TURN server (e.g. coturn) and enter its address, user and password in the game's ⚙ settings.
The relay built into this server usually makes that unnecessary.
