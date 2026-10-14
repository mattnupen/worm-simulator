# Hosting at wormsimulator.com (Render)

The game builds to one file, `dist/index.html`. Render serves it as a free static site at
wormsimulator.com. Students only ever load wormsimulator.com. GitHub is just where Render pulls
the code from, so the school's GitHub block doesn't affect students.

## One-time setup

1. **Create a Render account** at render.com. Choose "Sign up with GitHub" so Render can read the
   private `worm-simulator` repo.
2. **Create the site from the Blueprint:** in the Render Dashboard choose **New → Blueprint**,
   pick the `worm-simulator` repo, and approve. Render reads `render.yaml` and creates a static
   site called `wormsimulator`. It builds `main` with
   `npm ci && npm run build && node scripts/copy-releases.mjs` and publishes `dist/`.
   The first build takes about a minute. When it finishes the game is live at
   `https://wormsimulator.onrender.com` (the exact name is shown in the Dashboard).
3. **Point the domain at Render.** At the company where you bought wormsimulator.com, open DNS
   settings and set:

   | Type | Host / Name | Value |
   |---|---|---|
   | A | `@` (the root) | `216.24.57.1` |
   | CNAME | `www` | your site's `….onrender.com` address from step 2 |

   Delete any **AAAA** records and any "parking page" or forwarding records for `@` and `www`.
   If your registrar offers ALIAS/ANAME for the root, you can point that at the `….onrender.com`
   address instead of using the A record.
4. In Render, open the site → **Settings → Custom Domains** and click **Verify** next to
   wormsimulator.com. Render issues the HTTPS certificate on its own (usually within minutes,
   sometimes up to an hour after DNS updates). `www.wormsimulator.com` redirects to the root.

## Updating the game

Every push to `main` on GitHub rebuilds and redeploys automatically. The root,
`wormsimulator.com/`, always shows the newest `main`: it is your preview.

## Versions students play (`/v1/`, `/v2/`, ...)

Students only ever get a version link such as `https://wormsimulator.com/v1/`
(docs/codev/README.md). Each one is a frozen copy of the single-file build:

1. When you have checked the root build, freeze it: `npm run release -- 1` (the version number).
   It builds, checks that the Start-screen label says V1, and copies `dist/index.html` to
   `releases/v1/index.html`.
2. Commit that file and push. Render's build (`render.yaml`) copies each `releases/vN/index.html`
   into the site, so the snapshot is served at `/v1/` and `/v1`, next to the root build.
3. Check `https://wormsimulator.com/v1/` loads and shows "V1 · …" on the Start screen, and that
   `https://wormsimulator.com/v1` (without the slash) opens it too.

The first time, check the site's **Settings → Build Command** in the Render Dashboard reads
`npm ci && npm run build && node scripts/copy-releases.mjs`. A Blueprint with auto-sync picks up the
`render.yaml` change on its own; if it still shows the old command, paste the new one in.

A released version is never rebuilt. `npm run release` refuses to overwrite `releases/vN/` unless
you run `npm run release -- N --emergency-fix` (without the `--`, npm eats the flag), and an
emergency fix is noted in that version's doc and changelog entry. Every version runs on the same
site, so they share saved settings (see CLAUDE.md, "One origin, shared saves").

## Before using it with a class

- **Test the version link students will use** (such as `wormsimulator.com/v1/`) on a student
  account and a student Chromebook. School web filters (GoGuardian, Securly, Lightspeed and
  others) often block *newly registered* or *uncategorized* domains.
  If wormsimulator.com is blocked, ask district IT to allowlist `wormsimulator.com` (and
  `www.wormsimulator.com`). Doing this a week ahead avoids a surprise on class day.
- The game itself makes no network requests after it loads, so it keeps working if the Wi-Fi
  drops. Only links students click and embedded YouTube videos (youtube-nocookie.com) go online.
  If YouTube is blocked at school, the videos won't play but the game still works.

## Burrow Board at wormsimulator.com/burrow/

Burrow Board (`burrow-board/`) is a separate Render service called `burrow-board`, defined in
`render.yaml`. It's a small Node server with a 1 GB disk that holds every board in one file. The
game's static site passes `wormsimulator.com/burrow/…` through to it (the `routes` in
`render.yaml`), so students only ever see wormsimulator.com. Round boards live at
`wormsimulator.com/burrow/v4`, `/burrow/v5` and so on.

### One-time setup (Matt)

1. **Add a payment card** if Render doesn't have one: Dashboard → your avatar → **Billing**. The
   board costs about $7.25 a month ($7 for an always-on Starter service, $0.25 for the disk).
2. **Create the service.** Once the Burrow Board pull request is merged, open the Dashboard →
   **Blueprints** → the worm-simulator Blueprint. If it shows changes waiting, click
   **Manual Sync** and approve. Render creates `burrow-board` and its disk, then builds it (a few
   minutes).
3. **Set the teacher password.** Open the `burrow-board` service → **Environment** →
   `TEACHER_PASSWORD` → type a password only you know → **Save Changes**. Render restarts the
   service. Never put this password in the repo.
4. **Check the service's address.** At the top of the `burrow-board` page Render shows an address
   like `https://burrow-board.onrender.com`. If it's different (for example
   `burrow-board-a1b2.onrender.com`), tell Claude, which updates the two `routes` lines in
   `render.yaml`.
5. **Try it:** open `https://wormsimulator.com/burrow/teacher` and sign in with your teacher
   password. If `/burrow` doesn't load, the board also works at the service's own address plus
   `/burrow/`, while Claude looks into it.

### Each round

In the teacher view: make the round's board (Round 4 makes `/burrow/v4`), set it up, and tick
"This is the board students open". Make student logins once (Student logins → Make logins and
download CSV), print or share the CSV privately, and hand each student their login.

### Good to know

- Deploys of a service with a disk restart it, so the board is down for about a minute while a
  new version starts. Merge board changes outside class time.
- Render takes a daily snapshot of the disk. To get the data out, use **Export for Claude** on
  each board.
- At the end of the project, **Delete everything** in the teacher view, then delete the
  `burrow-board` service in Render to stop the charge.

## Cost

Render static sites are free. Custom domains are included in the free (Hobby) workspace. The game
itself only costs the domain registration. Burrow Board adds about $7.25 a month while it runs.
