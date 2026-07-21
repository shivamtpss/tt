# ShivamGuide

**ShivamGuide** is a drop-in **character onboarding tour** for any website.

It highlights UI with a spotlight, shows an animated character next to each target, plays dialogue with a typewriter effect, and cleans up when done. Supports four character engines:

| Engine | Description | Dependencies | License |
|--------|-------------|-------------|---------|
| **live2d** | Full Live2D models with motions, expressions, lip sync | PixiJS + Cubism SDK (CDN auto-loaded) | Live2D SDK license |
| **rive** | Interactive Rive animations with state machines | @rive-app/canvas (CDN auto-loaded) | Free tier (generous) |
| **lottie** | Lottie animations from After Effects | lottie-web (CDN auto-loaded) | MIT (fully free) |
| **photo** | Static image with CSS idle animation | None | Fully yours |

| Works with | Notes |
|------------|--------|
| **Next.js** (App Router / Pages) | Client components only |
| **React** (Vite, CRA, Remix, …) | Via `useShivamGuide` |
| **Plain HTML / any SPA** | Via `ShivamGuide.create()` |
| **Vue / Svelte / Angular** | Use the plain JS API after mount |

Cubism + Pixi peers **load automatically**. You do **not** need Next `<Script>` tags for them.

---

## Install

### pnpm (use this if the project has `pnpm-lock.yaml`)

```bash
pnpm add github:shivamtpss/tt
# or local:
pnpm add /absolute/path/to/ShivamGuide
```

### npm (only if the project uses `package-lock.json`)

```bash
npm install github:shivamtpss/tt
```

### After you publish to npm

```bash
pnpm add shivam-guide
# or: npm install shivam-guide
```

> **Do not mix managers.** Installing with `npm` into a pnpm app often fails with  
> `Cannot read properties of null (reading 'matches')`.

### Package name in imports

npm name is **`shivam-guide`**:

```ts
import { useShivamGuide } from "shivam-guide/react";
import type { ShivamGuideStep } from "shivam-guide";
```

Global (script tag): **`window.ShivamGuide`**

---

## Engine quick start

### Photo engine (zero dependencies, fully free)

```js
const tour = await ShivamGuide.create({
  engine: "photo",
  photoUrl: "/my-photo.png",                          // cutout PNG recommended
  photos: { smile: "/me-smile.png", think: "/me-think.png" },
  speaker: "Shivam",
  steps: [
    { target: "#hero", line: "Welcome!", expression: "smile" },
    { target: "#cta", line: "Tap here.", expression: "think", nextLabel: "Done" },
  ],
});
```

### Rive engine (interactive animations)

```js
const tour = await ShivamGuide.create({
  engine: "rive",
  riveUrl: "/character.riv",
  speaker: "Buddy",
  steps: [
    { target: "#about", line: "Let me show you around." },
  ],
});
```

### Lottie engine (After Effects animations)

```js
const tour = await ShivamGuide.create({
  engine: "lottie",
  lottieUrl: "/animation.json",
  speaker: "Astro",
  steps: [
    { target: "#hero", line: "I'm a Lottie animation!" },
  ],
});
```

### Live2D engine (default, backward compatible)

```js
const tour = await ShivamGuide.create({
  engine: "live2d",   // or just omit — it's the default
  modelUrl: "https://…/model.json",
  steps: [{ target: "#hero", line: "Hello!" }],
});
```

---

## Quick start — Next.js (App Router)

ShivamGuide needs the browser (`window`, WebGL). Keep it in a **Client Component**.

### 1. Create a client wrapper

`components/ShivamOnboarding.tsx`:

```tsx
"use client";

import { useShivamGuide } from "shivam-guide/react";
import type { ShivamGuideStep } from "shivam-guide";

type Props = {
  steps: ShivamGuideStep[];
  speaker?: string;
  storageKey?: string;
  autoStart?: boolean;
};

export function ShivamOnboarding({
  steps,
  speaker = "Guide",
  storageKey,
  autoStart = true,
}: Props) {
  const { ready, error, start } = useShivamGuide({
    steps,
    speaker,
    autoStart,
    storageKey,
  });

  if (error) {
    return <p role="alert">Tour error: {error}</p>;
  }

  return (
    <button type="button" onClick={start} disabled={!ready}>
      {ready ? "Replay tour" : "Loading guide…"}
    </button>
  );
}
```

### 2. Put ids on real UI, then mount the tour

`app/page.tsx` (Server Component is fine — it only *renders* the client child):

```tsx
import { ShivamOnboarding } from "@/components/ShivamOnboarding";

export default function Page() {
  return (
    <main>
      <h1 id="brand">My App</h1>
      <button type="button" id="cta">
        Get started
      </button>
      <section id="pricing">Pricing</section>

      <ShivamOnboarding
        storageKey="my-app-onboarding-v1"
        steps={[
          {
            target: "#brand",
            line: "Welcome! Quick tour of the product.",
            pose: 0,
            expression: 1,
            face: "smile",
            nextLabel: "Let's go",
          },
          {
            target: "#cta",
            line: "This is your main call to action.",
            pose: 2,
            face: "look",
            nextLabel: "Next",
          },
          {
            target: "#pricing",
            line: "Plans live here. That’s it!",
            pose: 8,
            face: "bye",
            nextLabel: "Done",
          },
        ]}
      />
    </main>
  );
}
```

### Next.js rules

1. Always `"use client"` on the file that calls `useShivamGuide`.
2. Tour `target` selectors must exist in the DOM when the tour starts (same page / after data loaded).
3. Use `enabled: false` until async UI is ready, then flip to `true`.
4. On route change, the hook’s cleanup calls `destroy()` — start a new tour on the next page if needed.
5. No need to import CSS separately when using `shivam-guide/react` (it pulls styles in).
6. Prefer **pnpm** if the Next app already uses pnpm.

### Optional: wait for data

```tsx
const { ready, start } = useShivamGuide({
  steps,
  enabled: !!user && !!dashboardMounted,
  autoStart: true,
});
```

---

## React (Vite / CRA / Remix)

Same hook — no Next-specific APIs.

```tsx
import { useMemo } from "react";
import { useShivamGuide } from "shivam-guide/react";
import type { ShivamGuideStep } from "shivam-guide";

export function App() {
  const steps = useMemo<ShivamGuideStep[]>(
    () => [
      { target: "#hero", line: "This is the hero.", pose: 0, face: "smile" },
      { target: "#signup", line: "Sign up here.", pose: 2, nextLabel: "Done" },
    ],
    []
  );

  const { ready, error, start } = useShivamGuide({
    steps,
    speaker: "Guide",
    autoStart: true,
  });

  return (
    <>
      <header id="hero">Welcome</header>
      <button id="signup">Sign up</button>
      {error && <p>{error}</p>}
      <button type="button" onClick={start} disabled={!ready}>
        Replay
      </button>
    </>
  );
}
```

Wrap `steps` in `useMemo` so the tour is not recreated every render.

---

## Plain HTML / CDN

```html
<!DOCTYPE html>
<html>
  <head>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/shivamtpss/tt@main/shivam-guide.css"
    />
  </head>
  <body>
    <h1 id="brand">Site</h1>
    <button id="cta">Action</button>

    <script src="https://cdn.jsdelivr.net/gh/shivamtpss/tt@main/shivam-guide.js"></script>
    <script type="module">
      const tour = await ShivamGuide.create({
        modelUrl:
          "https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/natori/model.json",
        speaker: "Guide",
        autoStart: true,
        steps: [
          { target: "#brand", line: "Hello!", pose: 0 },
          { target: "#cta", line: "Click this.", pose: 2, nextLabel: "Done" },
        ],
      });

      // tour.start() | tour.next() | tour.end() | tour.destroy()
    </script>
  </body>
</html>
```

Local test: open `example.html` via a static server (not `file://`).

```bash
cd ShivamGuide && python3 -m http.server 8765
# http://localhost:8765/example.html
```

---

## Vue / Svelte / Angular (or anything else)

Use the browser API after your UI has mounted:

```js
import "shivam-guide/shivam-guide.css";
import "shivam-guide/shivam-guide.js"; // sets window.ShivamGuide

onMounted(async () => {
  const tour = await window.ShivamGuide.create({
    modelUrl: "https://…/model.json",
    steps: [{ target: "#cta", line: "Here.", pose: 2 }],
  });
  // onUnmounted: tour.destroy()
});
```

---

## Step options

Each item in `steps`:

| Field | Type | Description |
|-------|------|-------------|
| `target` | `string \| null` | CSS selector to spotlight (`"#cta"`). Omit/`null` = no hole |
| `line` | `string` | Dialogue text (typewriter + lip sync) |
| `nextLabel` | `string` | Button label (default `Next` / `Done`) |
| `pose` | `number \| string \| object` | Motion: flat index, `"group:index"`, filename, or `{ group, index }` |
| `poseName` | `string` | Override the yellow `POSE · …` tag |
| `expression` | `number \| string` | Expression by index or name (e.g. `"f03"`) |
| `face` | `string` | Accent: `smile` \| `look` \| `sparkle` \| `wink` \| `think` \| `hype` \| `bye` |
| `waitForClick` | `boolean` | Advance only when the highlighted target is tapped |
| `id` | `string` | Optional id for your own tracking |

### Create / hook options

| Option | Default | Description |
|--------|---------|-------------|
| `engine` | `"live2d"` | Character engine: `"live2d"` / `"photo"` / `"rive"` / `"lottie"` |
| `modelUrl` | — | Live2D `model.json` URL (required for `engine:"live2d"`) |
| `cubism` | `4` | SDK version: `2` for `.moc` models, `4` for `.moc3` models |
| `photoUrl` | — | Main photo/image URL (required for `engine:"photo"`) |
| `photos` | `null` | Map of expression name to image URL: `{ smile: "/smile.png" }` |
| `riveUrl` | — | .riv file URL (required for `engine:"rive"`) |
| `riveStateMachine` | `null` | Rive state machine name(s) to auto-play |
| `lottieUrl` | — | Lottie JSON URL (required for `engine:"lottie"`) |
| `lottieSegments` | `null` | Named segments: `{ idle: { start: 0, end: 30 } }` |
| `speaker` | `"Guide"` | Name in the bubble |
| `steps` | — | Tour steps (required) |
| `autoStart` | `true` | Start after model loads |
| `storageKey` | `null` | If set, skip tour when localStorage is `"1"` |
| `loadPeers` | `true` | Auto-inject Cubism/Pixi CDN scripts |
| `showSkip` | `true` | Show Skip button |
| `showPoseReplay` | `true` | Show Replay pose |
| `showProgress` | `false` | Show a step progress bar |
| `lipSync` | `true` | Mouth moves while typing |
| `zIndex` | `9999` | Overlay z-index |
| `onBeforeStep` | — | Run *before* spotlight (open modals here) |
| `onStep` | — | After step starts |
| `onComplete` / `onSkip` / `onStart` | — | Lifecycle |
| `onEnd` | — | Fires after complete **or** skip → `(completed: boolean)` |

### Advanced customization

| Option | Default | Description |
|--------|---------|-------------|
| `theme` | `null` | Color/font overrides (see below) |
| `typeSpeedMs` | `32` | Typewriter speed, ms per char (`0` = instant) |
| `spotlightPadding` | `12` | Gap between the target and the ring, in px |
| `spotlightRadius` | `null` | Spotlight corner radius, in px |
| `keyboard` | `true` | Enter/Space = next, Esc = close |
| `advanceOnClick` | `false` | Tap the highlighted target to advance (all steps) |
| `clickHint` | `"Tap the highlighted area"` | Hint shown for click-to-advance steps |
| `reduceMotion` | `"auto"` | `"auto"` respects the OS setting; `true`/`false` to force |
| `mobileScale` | `1` | Multiplier for character size on phones |
| `desktopScale` | `1` | Multiplier for character size on desktop |
| `modelAnchorY` | `0.62` | Vertical anchor on desktop (higher = model sits lower) |
| `mobileAnchorY` | `0.44` | Vertical anchor on mobile |
| `mobileModelScale` | `2.45` | How much to oversize the model on mobile for bust crop |
| `debug` | `false` | Log discovered motions/expressions to console on load |
| `skipLabel` / `doneLabel` / `nextLabel` / `poseReplayLabel` | — | Button label overrides |

```js
await ShivamGuide.create({
  modelUrl,
  steps,
  showProgress: true,
  advanceOnClick: true,      // user must tap each highlighted element
  typeSpeedMs: 12,           // snappier text
  theme: {
    accent: "#7c5cff",
    speaker: "#5b3df5",
    dialogueBg: "linear-gradient(165deg, #ffffff, #f0ecff)",
    primary: "linear-gradient(135deg, #7c5cff, #5b3df5)",
    radius: "18px",
  },
});
```

### Mobile placement

On phones (`< 640px`) the guide is a **compact card that sits right next to the
target** — the same idea as desktop, just narrower. It parks itself **just above
or just below** the highlighted element (as a centered pair) and gently scrolls
so both the target and the card stay in view, so the guide always feels close to
what it's pointing at instead of jumping to a screen edge. The spotlight ring
stays glued to the target and is never covered, even for a Submit button or
footer link at the very bottom of a long form. Only when the target and card
genuinely can't both fit does it fall back to docking at the far edge. Use
`mobileScale` to fine-tune the character size.

### Working with any model

Every Live2D model has different motions and expressions. ShivamGuide auto-detects
them at load time and exposes them on the tour object so you can see exactly
what's available:

```js
const tour = await ShivamGuide.create({
  modelUrl: "https://example.com/touma/model.json",
  cubism: 2,
  debug: true,   // logs motions + expressions to console
  steps: [],
});

console.log(tour.motions);
// [
//   { group: "tap", index: 0, name: "motion1", file: "motions/tap/motion1.mtn" },
//   { group: "tap", index: 1, name: "motion10", file: "motions/tap/motion10.mtn" },
//   ...
// ]

console.log(tour.expressions);
// [
//   { index: 0, name: "f01", file: "expressions/f01.exp.json" },
//   ...
// ]
```

Then reference motions/expressions in your steps using any format:

```js
steps: [
  // By flat index (backward compatible)
  { pose: 0, line: "First motion in the catalog" },

  // By "group:index" string
  { pose: "tap:2", line: "Third motion in the tap group" },

  // By filename (most readable)
  { pose: "Touch Dere1", line: "A specific animation" },

  // By object
  { pose: { group: "flick_head", index: 0 }, line: "Explicit" },

  // Expressions by name or index
  { expression: "f03", line: "Expression by name" },
  { expression: 2, line: "Expression by index" },
]
```

If a reference doesn't match, a `console.warn` shows what's available.
Use `modelAnchorY` / `mobileAnchorY` to tune character framing per model.

### Hook return value

```ts
const { ready, error, start, end, next, tourRef } = useShivamGuide({ … });
```

---

## API (vanilla)

```ts
const tour = await ShivamGuide.create(options);

tour.start();
tour.next();
tour.prev();
tour.goTo(2);
tour.replayPose();
tour.end();      // dismiss without forcing “completed” storage unless you completed
tour.destroy();  // remove DOM + WebGL — call on unmount
tour.isActive();
tour.getIndex();
tour.motions;      // discovered motion catalog
tour.expressions;  // discovered expression catalog
tour.engine;       // "live2d" | "photo" | "rive" | "lottie"

await ShivamGuide.ensurePeers(); // optional preload
```

---

## Customizing look

Either pass a `theme` object (above) or override CSS variables globally:

```css
:root {
  --sg-dim: rgba(2, 6, 12, 0.78);      /* backdrop dim */
  --sg-ring: #fff;                     /* spotlight inner ring */
  --sg-accent: rgba(70, 212, 194, 0.9);/* pulse + progress */
  --sg-speaker: #0d7a70;               /* speaker label + progress */
  --sg-font: system-ui, sans-serif;
  --sg-radius: 14px;                   /* spotlight corners */
  --sg-dialogue-bg: linear-gradient(165deg, #fff, #e8eef5);
  --sg-text: #132033;                  /* dialogue text */
  --sg-primary: linear-gradient(135deg, #46d4c2, #2aa9a0); /* primary button */
  --sg-primary-text: #04140f;
}
```

Classes are prefixed with `.sg-` so they rarely clash with your app. The
spotlight pulse animates a GPU-friendly transform (no full-screen repaint), and
everything honors `prefers-reduced-motion`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot read properties of null (reading 'matches')` | App is pnpm — use `pnpm add`, not `npm install` |
| Spotlight finds nothing | Target `id` missing / tour started before render — use `enabled` |
| Blank character | Model URL / CDN blocked — check Network tab for `.moc3` / `.moc` / textures |
| Next SSR / `window is not defined` | Missing `"use client"` on the hook component |
| Tour twice in React Strict Mode | Normal in dev; cleanup `destroy()` handles it |
| Want a different model | Pass any `modelUrl`; set `cubism: 2` for `.moc` models or `cubism: 4` (default) for `.moc3` |
| "Model failed to load" error | Check your `cubism` setting matches the model format (`.moc` = 2, `.moc3` = 4) |
| Disable auto CDN scripts | `loadPeers: false` and load Cubism/Pixi yourself |

---

## Files in this repo

```
ShivamGuide/
  shivam-guide.js      # core (window.ShivamGuide)
  shivam-guide.css     # styles
  shivam-guide.d.ts    # TypeScript types
  react.js / react.d.ts
  example.html         # desktop photo-engine tour
  example-mobile.html  # mobile photo-engine tour
  example-photo.html   # casino photo-engine example
  example-photo-showcase.html # large face + expression playground
  example-cubism2.html # legacy Cubism 2 compatibility
  assets/              # local example character assets
  package.json
  README.md
```

---

## Publish (maintainers)

```bash
cd ShivamGuide
git add .
git commit -m "ShivamGuide v1.0.0"
git remote add origin git@github-shivam:shivamtpss/tt.git
git push -u origin main
git tag v1.1.0 && git push origin v1.1.0
```

Update done — repo is `shivamtpss/tt`. Install with `pnpm add github:shivamtpss/tt`.

Optional:

```bash
npm publish --access public
```

---

## License

MIT for this package.

Live2D Cubism is loaded from Live2D’s public CDN at runtime — follow [Live2D SDK terms](https://www.live2d.com/) for production apps.
