# Capsid Wasteland: online squad server (v21)

This folder is the game's online home. One free web service on Render does three things:

- **Serves the game.** Everyone opens one web address to play. No file to pass around, and everyone always has the same version.
- **Connects squads.** Invite codes and invite links work from anywhere.
- **Relays game traffic** when two players can't connect to each other directly (school, work or mobile networks).

Only the person who sets it up needs accounts: GitHub and Render, both free. It takes about 10 minutes, once.

**In this folder:**

| File | What it is |
|---|---|
| `capsid_wasteland_v21.html` | The game. The server always serves the highest `vNN` it finds. |
| `relay_server.js` | The squad server: one file, no dependencies, Node 18+. |
| `package.json` | Tells Render this is a Node app. |
| `render.yaml` | The Render Blueprint: every setting filled in for you. |
| `Dockerfile` | For container hosts other than Render (optional). |
| `extras/` | Files for running it on your own server (optional). |
| `README.md`, `setup_guide.html` | This guide. |

## Already set up with an earlier package?

Update in two uploads. You don't need to touch Render.

1. In your GitHub repository, click **Add file → Upload files**. Drop in `relay_server.js` and `capsid_wasteland_v21.html` from this folder, then click **Commit changes**. The new `relay_server.js` replaces the old one.
2. Optional: delete the old `capsid_wasteland_vNN.html` files (open one, then **⋯ → Delete file**). The server ignores them anyway.

Render redeploys by itself within a couple of minutes. Open your address, then **⚙ → Test**: it should say **serves v21**.

## First-time setup (free, on Render)

### 1. Put this folder on GitHub

1. Sign in at **github.com**. Click **+** (top right) → **New repository**.
2. Name it `capsid-squad`. Choose **Public** or **Private** (both work), then click **Create repository**.
3. On the empty repository page, click **uploading an existing file**.
4. Select **everything inside this folder** (not the folder itself) and drag it onto the page. That includes `extras` and the hidden `.dockerignore`; if those two don't come along, that's fine.
5. Click **Commit changes**.

### 2. Create the service on Render

1. Go to **render.com** → **Get Started** and sign up with **GitHub**. When asked, give Render access to the `capsid-squad` repository (or to all repositories).
2. In the Render dashboard, click **New** (top right) → **Blueprint**.
3. Pick `capsid-squad`. Render reads `render.yaml` and shows one free web service called **capsid-squad**. Click **Deploy Blueprint** (or **Apply**).
4. Open the service. When the status says **Live** (1–3 minutes), its address is at the top, something like `https://capsid-squad-ab12.onrender.com`.

No Blueprint option? Use **New → Web Service**, pick the repository, and set:

| Setting | Value |
|---|---|
| Language / Runtime | Node |
| Build command | `echo ok` |
| Start command | `node relay_server.js` |
| Instance type | Free |
| Health check path (Advanced) | `/health` |

### 3. Check it

- `https://<your address>/health` should show `ok 0` (the number is players connected).
- `https://<your address>/info` should show `"gameVersion":"v21"`.

### 4. Play

1. Open your Render address. The game loads, and the front screen says **Connection: squad server …**.
2. Click **Create Private Squad**, then **Copy invite link** in the lobby, and send the link to your friends. It opens the game with the code already filled in.
3. Friends pick a squad member and a name, then press **Join Squad**.

Anyone who plays from a downloaded game file can still use the server: **⚙ → Private server**, paste your address (`https://…` works), then press **Test** and **Save**. Their file must be the same version as the one the server serves.

## Updating the game later

1. Upload the new `capsid_wasteland_vNN.html` to the repository (**Add file → Upload files**). If a new `relay_server.js` comes with it, upload that too.
2. Render redeploys automatically. Update between play sessions: a redeploy restarts the server, which ends squads that are playing.
3. Everyone just reloads your address.

## The free plan

- **It sleeps when nobody plays.** After 15 minutes with no visits and no game traffic, the server goes to sleep. The next visitor waits about a minute (Render shows a loading page), and players from a file see "Waking up the squad server… N s". While anyone is connected, even in the lobby, the game's heartbeats keep it awake.
- **Hours:** 750 free instance hours a month per workspace. That's enough for this one service all month, so don't run other free services in the same workspace.
- **Always awake:** a paid instance never sleeps. Change **Instance type** in the service's settings.
- **Download size:** the server sends the game compressed, about 3.5 MB instead of 5.4 MB.

## Settings (optional)

In Render, open the service, then **Environment → Add environment variable**. Saving restarts the server.

| Variable | What it does | Default |
|---|---|---|
| `KEY` | A password for the server. Players type it in **⚙ → Key** | not set |
| `MAX_PLAYERS` | Most players connected at once, across all squads | 300 |
| `PER_IP` | Most connections from one home network | 12 |
| `GAME_FILE` | Serve a specific file instead of the newest `capsid_wasteland_vNN.html` | newest |
| `PORT` | The port. Render sets this for you | 8787 |

## Troubleshooting

| You see | Do this |
|---|---|
| The page takes about a minute to load | The server was asleep. That's normal on the free plan. |
| Render deploy fails | Open **Logs**. Check that `relay_server.js` and `package.json` are at the top of the repository, not inside a subfolder. |
| `/info` shows an old `gameVersion` | The new html wasn't uploaded, or its name doesn't end in `_vNN.html`. |
| "Different game version" when joining | Everyone should open your address rather than an old file. |
| "This squad server needs a key" | `KEY` is set: share it, or delete the variable. |
| **⚙ → Test** says no server answered | Check the address, and that the service is **Live** in Render. |
| Anything else | **Connection log** (in the lobby or ⚙) → **Copy debug log**, and send it along. |

Render's **Logs** tab shows `+ id` when someone connects, `- id` when they leave, and a line when the game file is compressed.

## Other hosts

The server is a single Node file with no dependencies, so any host that runs Node or Docker works:

- **Railway:** New Project → Deploy from GitHub repo, then Settings → Networking → Generate Domain. It gives a small monthly credit, then it's paid.
- **Fly.io:** run `fly launch` in this folder (it uses the `Dockerfile`, port 8787). Paid, a few dollars a month.
- **Your own Linux server:** install Node 18+, copy the folder to `/opt/capsid-squad`, and use `extras/capsid-squad.service` (systemd). Put `extras/Caddyfile` in front of it for HTTPS on your own domain.

Static-only hosts (GitHub Pages, Netlify) can't run the squad server.

## What the server stores

Nothing. There are no accounts and no saved games. It only knows who is connected right now, by random ids, and its logs show those ids with times. Invite codes are 6 random characters, and a squad is gone when its host leaves.
