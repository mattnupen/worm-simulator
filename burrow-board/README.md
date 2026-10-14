# Burrow Board

Students share ideas for each Worm Simulator round and build on each other's ideas. Every idea is
a card with a title, words and an optional drawing. Only the person who made a card can change
it. Anyone can **Dig from here**, which makes their own new card linked to the original, so
ideas grow into branches on a whiteboard.

It's a separate app from the game. The game only links to it, and the game's own rules (no data
collected, `connect-src 'none'`) don't change. The plan and decisions behind it are in the build
brief (project files: `codev/burrow-board-next.md`) and `codev/burrow-board-decisions.md`.

## What's here

| Folder | What it is |
|---|---|
| `client/` | The page: the whiteboard (`board.ts`), the guided Think card and drawing tool (`composer.ts`), and the teacher screens (`teacher.ts`). |
| `server/` | A small Node server with no extra packages. It saves everything in one SQLite file (`db.ts`) and answers the page (`app.ts`). |
| `shared/` | What both sides agree on, including how areas are built from students' answers (`model.ts`). |
| `scripts/seed.ts` | Fills a local board with made-up sample ideas. |
| `tests/` | Server and area tests (`npm test`) and browser tests (`npm run test:e2e`). |

## How a round works

1. **Setup** (teacher view at `/teacher`): name the board, write the first question and its
   starting groups (for example Birds, Mammals…), tick the fact cards to use from the game's
   lesson, and pick "This is the board students open".
2. **Think:** students go to the board's address, type the class code, pick their period and get
   a random nickname (like "Swift Robin 42"). They post their own idea first, in four short steps:
   group, fact, words, picture. They see only their own cards.
3. **Areas** (teacher view): see every answer to the first question and how many students gave
   it, then save the areas. Until you save, the board suggests them: one per starting group that
   someone picked, one for any "Something else" answer two or more students wrote, and
   "Other ideas" for the rest.
4. **Share and dig:** switch the phase. Students who posted see everyone's ideas and dig from them.
   Anyone who hasn't posted yet still sees "Think first, then share".
5. **Close:** switch the phase to Closed, then **Export for Claude** on the teacher home page. The
   zip holds `board.md` (an outline of every area and branch), `board.json` and the pictures.

The teacher can mark any card Built, Parked, Myth to teach or Spotlight, hide it, change it,
delete it, or move a whole branch to another area.

## Privacy (framework P14)

- No accounts, no names, no emails. A student is a random nickname and a class period, and a
  secret cookie lets only that browser change their cards.
- No IP addresses, analytics or trackers are stored, and the page loads nothing from other sites.
- Pictures are only shown to people who joined with the class code.
- The export for Claude has nicknames and periods only.
- **Delete everything** on the teacher home page empties the whole store.

## Run it on your computer

You need Node 22.18 or newer.

```bash
cd burrow-board
npm install
npm run seed      # optional: a sample board, class code SAMPLE-1
npm run dev       # then open http://localhost:5180
```

The local teacher password is `teacher`. Your local board is saved in `burrow-board/data/`
(ignored by git).

```bash
npm test                                   # server and area tests
npm run test:e2e                           # builds, then runs the browser tests
npm run build && npm start                 # the same way Render runs it, on port 8787
```

## Hosting on Render

Not set up yet: it waits on Matt's hosting choice (see `codev/burrow-board-decisions.md`). The
recommended setup is one Render web service in this folder with a small disk for the SQLite file.
