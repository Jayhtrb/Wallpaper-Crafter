# Wallpaper AI

A clean, fluid web app that generates AI wallpapers cropped exactly to your
phone's resolution — free, no sign-up, no backend. Pick a device (or enter a
custom size), describe what you want, and download a ready-to-set wallpaper.

It's a static site (plain HTML/CSS/JS, no build step, no framework), so you
can open it locally or deploy it anywhere that serves static files in about
a minute.

## How the AI image generation works

The app calls [Pollinations.ai](https://pollinations.ai)'s free public image
API directly from the browser — no API key, no account, no server of yours
in the loop:

```
https://image.pollinations.ai/prompt/<url-encoded prompt>?width=W&height=H&seed=N&nologo=true&model=flux
```

This is a third-party free service, so keep in mind:

- **No uptime guarantee.** It can be slow or briefly unavailable. The app
  handles this with a 30-second timeout and a "Try again" button — it never
  hangs silently.
- **Shared/public.** Don't send prompts you consider private — they go to
  Pollinations' servers, not Anthropic's or yours.
- **No login needed.** That's the whole point of the "free, no-signup" setup
  you asked for.

### Swapping in your own AI (higher quality / your own quota)

If you outgrow the free tier, the only place that needs to change is
`buildImageUrl()` and the `generate()`/`downloadCurrent()` functions in
`js/app.js`. Two common upgrades:

- **OpenAI (DALL·E / gpt-image):** call `POST /v1/images/generations` from a
  small backend (never put an OpenAI key in client-side JS — anyone could
  read it from the page source and spend your quota). The frontend would
  `fetch('/api/generate', { method: 'POST', body: JSON.stringify({ prompt, width, height }) })`
  against your own server, which then calls OpenAI and returns the image.
- **Google (Gemini / Imagen):** same shape — proxy through your own minimal
  backend (a single serverless function works fine on Vercel/Netlify) so the
  API key stays server-side.

Because the rest of the app (UI, phone sizing, download, history) doesn't
care where the pixels come from, this is a localized change.

## Deploying it (pick one, all free)

You don't need a build step — just upload the folder as-is.

**Netlify (easiest):**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag this whole folder onto the page
3. You get a live URL immediately (and can add a custom domain later)

**Vercel:**
1. `npm i -g vercel` (once)
2. From this folder, run `vercel --prod`

**GitHub Pages:**
1. Push this folder to a GitHub repo
2. Repo Settings → Pages → set source to the branch/root
3. Your site is live at `https://<you>.github.io/<repo>/`

**Just testing locally:**
```
python3 -m http.server 8080
```
then open `http://localhost:8080`. (Opening `index.html` directly by
double-clicking also works for everything except the installable-app / PWA
piece, which requires `http://` or `https://`.)

## What's included

| File | Purpose |
|---|---|
| `index.html` | Page structure and content |
| `css/style.css` | All styling — responsive layout, dark/light mode, animations |
| `js/phones.js` | The phone/tablet/desktop resolution catalog |
| `js/app.js` | All app logic: prompts, generation, download, history, install prompt |
| `manifest.json` + `sw.js` | Makes it installable to a phone home screen (PWA) |
| `icons/` | App icons for the home-screen/install experience |

## Notes and known limitations

- **Phone resolutions are close approximations**, not manufacturer specs —
  accurate enough to fill the screen edge-to-edge without visible letterboxing,
  but if you need pixel-perfect precision, use "Custom size" with your exact
  numbers.
- **Very large requests (4K desktop, etc.) are capped** at 2048px on the
  longest edge for reliability with the free image service. You can raise
  `DOWNLOAD_MAX_EDGE` in `js/app.js` if you're using a paid API that handles
  bigger images comfortably.
- **History is local-only**, stored in the browser's `localStorage` — it's
  not synced anywhere and clears if the user clears site data.
- Everything runs client-side; there is no database and no user accounts.
