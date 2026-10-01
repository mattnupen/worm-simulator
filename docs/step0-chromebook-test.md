# Step 0: Chromebook speed test

This checks whether the 3D forest floor runs at 30 fps on a student Chromebook.
It takes about 30 seconds.

## Get the file onto the Chromebook

1. On the Mac, run `npm run verify:build`. This makes `dist/index.html`, one file.
2. Copy that file to the Chromebook in either of these ways:
   - **USB stick:** copy `index.html` onto it, plug it in, then open it from the Files app.
   - **Google Drive:** upload `index.html`. On the Chromebook, open the Files app, then
     Google Drive, then right-click the file and choose **Open with Chrome**.
     (Opening it on the drive.google.com website shows a preview instead of running it.)

## Run it

1. Plug the Chromebook in. Battery saver can slow it down.
2. Close other tabs.
3. Click **Start speed test** and don't touch anything for about 30 seconds.
4. Read the big **PASS** or **FAIL**.
   - The report also lists the longest pause during the automatic test, and, if it
     happened, how many times the measurement restarted. If it says the restart limit
     was reached, the tab kept losing focus. Keep the tab open and visible, then run
     it again.
5. Click **Copy results** and paste them into the Claude session.
6. Optional: click **Try driving the worm**. A small card in the top left says how to
   steer. Use the arrow keys, or the round joystick pad in the bottom left (it only
   shows up while driving). Drag the pad with the trackpad, or with a finger if the
   screen is a touchscreen. Note how steering feels. Click **Back to results** (or
   press Esc) to return to the report.

## Extra runs (optional)

Add these to the end of the file's address in Chrome's address bar:
- `?leaves=4000`: twice the leaves, to see how much room there is. This draws more
  than the game's planned detail budget, so a lower score here is expected and is
  not a FAIL for the real game.
- `?leaves=1000`: half the leaves

## What happens next

- **PASS at quality 0 or 1:** build the 3D forest floor as planned.
- **PASS at quality 2 or 3:** build it in 3D, but plan for the simpler look on these Chromebooks.
- **FAIL:** the forest floor uses the side view too. The art and code carry over.
