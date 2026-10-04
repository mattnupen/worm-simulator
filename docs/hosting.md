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
- The page makes no network requests after it loads, so it keeps working if the Wi-Fi drops.

## Cost

Render static sites are free. Custom domains are included in the free (Hobby) workspace. The only
cost is the domain registration itself.
