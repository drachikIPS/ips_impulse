# ImPulSe Promotional Video — Production Kit

Everything you need to produce a ~80-second promotional video of the ImPulSe platform, using the **DEMO-2026-A** seeded project.

## Files

| File | Purpose |
|---|---|
| `script.md` | Narration script + scene-by-scene shot list with timings. |
| `intro-outro.html` | ImPulSe animation used for both intro and outro. ~10 s: dark pulse → wordmark build → hold. The outro simply replays this file identically. |
| `storyboard.html` | Self-running ~80 s demo reel: intro → 8 module scenes (each with two screenshots, the second flying in) → module wall → Group IPS tagline card → reverse outro. |
| `logo-ips.png` | Group IPS logo used on the tagline card. |
| `captures/` | Drop the sixteen screenshots here (two per module). `storyboard.html` will replace its placeholders automatically. See `captures/README.md`. |

## Timing (~92 s total)

| Window | Scene |
|---|---|
| 0:00 – 0:10 | Intro — dark pulse, wordmark build, 2 s hold |
| 0:10 – 1:12 | 9 module scenes (7 s each, second screenshot flies in at ~3 s): Dashboard · Packages · Approvals · Budget · Schedule · Risk · Documents · Quality Control · My Action Points |
| 1:12 – 1:17 | Module wall — 3×3 grid with the nine module views we've just seen, stagger-in |
| 1:17 – 1:22 | Group IPS logo + *"For Project Managers, made by Project Managers"* |
| 1:22 – 1:32 | Outro — replays the intro identically (dark pulse → logo builds → hold) |

## Workflow

1. Drop the sixteen screenshots into `captures/` (see `captures/README.md`).
2. Open `storyboard.html` at 1920×1080 in a Chromium-based browser full-screen.
3. Record the screen with OBS at 30 fps.
4. Generate voice-over from `script.md` (ElevenLabs "Charlie" or "George" male voice, 1.0×, slight studio reverb).
5. In any editor (DaVinci Resolve, Premiere, CapCut, Descript):
   - Drop the screen recording on the timeline.
   - Drop the voice track below it; snap each sentence to the scene marker from `script.md`.
   - Add soft drone/cinematic underscore at −18 dB.
6. Export 1920×1080, H.264, 8–10 Mbps.

## Voice-over specs

- **Voice**: professional male, warm, confident, mid-40s timbre.
- **Pace**: measured; the script is comfortable at ~130 words / minute total over 80 seconds.
- **Tone**: educational, not salesy. Every sentence states a fact.
- **Pauses**: honour the `[pause]` markers in the script; they align with scene changes.
