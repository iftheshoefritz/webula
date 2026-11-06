# The video of a bot game

`scripts/record_bot_attempt.sh` records a whole bot game on a 1280×720 screen, in
`public/videos/bot-attempt-<mouse|touch>.mp4`. The site serves the file at
`/videos/bot-attempt-mouse.mp4`. The video shows Load deck with the TNG beginner deck against the bot
with the Klingon beginner deck's dilemmas. It uses the screencast and the ffmpeg steps of
`record_controls.mjs`.

The script plays by the turn rules:

1. It draws an opening hand of 7.
2. Each turn has 7 counters. A draw costs 1, and a personnel or a ship costs its cost.
3. While the cards in the hand that the table still needs cost less than the counters left, it draws.
4. It plays the first ship at the headquarters, mission 0. It plays the cheapest personnel that fit
   at the headquarters, in one drag: it taps each card of the open hand to select it, then drags one.
5. When the counters are spent and the hand holds more than 7 cards, it discards the rest in one
   drag. It discards the cards the table needs least first: cards that are not personnel or ships.
6. It closes the hand and taps the next-turn button.

When a ship and 8 personnel are in play, the personnel at the headquarters board the ship in one drag
from the away team panel. Then the ship moves to mission 1, the attempt starts, and the bot's first
dilemma is revealed.

```bash
NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev                # in another shell
bash scripts/record_bot_attempt.sh                  # mouse, into public/videos
bash scripts/record_bot_attempt.sh touch            # touch
```

Before each press the pointer glides to the target and rests on it, 0.2 s by default. On each screen
of the deck picker it rests for 1.5 s, so a caption has time to say what to press. The video
cuts every still gap to 0.25 s, so a wait that must show in the video uses `pause` and not `sleep`. The
drags move in 40 px steps: `cdp_input.mjs` reads the step from `CDP_INPUT_STEP_PX`, 8 px by default.

The deck shuffle is random, so each run shows other cards. The script stops with an error when the
bot chooses no dilemmas: run it again. With fewer personnel the bot often chooses none.

The script sizes the page with `Emulation.setDeviceMetricsOverride` on its own CDP session, as well
as with `agent-browser set viewport`. The viewport alone left the screencast at the size of the
browser's window, 800×513, so the video showed only the top-left of the page. The script stops
with an error when a frame is not 1280×720.
