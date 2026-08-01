# Clockday

A day planner where a live analog clock is the canvas. You paint time ranges
onto dotted tracks around the face with highlighter markers, name them, and
colour them. Expanding the date header reveals a month calendar
where every day wears a miniature ring of its own arcs.

## The idea

A 12-hour dial can't show a 24-hour day, so there are **two concentric dotted
tracks**: the inner one is AM (00:00–11:59), the outer is PM (12:00–23:59).
Dragging clockwise past 12 rolls the range from one track onto the next, so a
range like 11am–1pm draws as two arcs and the drag handle visibly hops rings.

Everything reduces to *minute-of-day, 0…1439* (`src/time.ts`). `segmentsFor()`
in `src/geometry.ts` cuts a range at every 12-hour boundary and is the single
source of arc geometry — used by the big dial and the calendar mini-rings alike.

## Running it

```sh
nvm use              # .nvmrc pins 20.19.5; RN 0.86 requires >= 20.19.4
npm install          # postinstall applies patches/ (see Gotchas)
npm run ios          # first run builds natively; Metro on port 8082
```

## Gotchas on this machine

- **Xcode.** Expo SDK 57 / RN 0.86 needs Swift 6.2 (Xcode 26+). `xcode-select`
  here points at Xcode 16.4 (Swift 6.1), which fails with
  `package 'apple' is using Swift tools version 6.2.0`. Either
  `sudo xcode-select -s /Applications/Xcode.app` once, or prefix builds:

  ```sh
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios
  ```

- **`patches/expo-modules-jsi+57.0.4.patch`.** `expo-modules-jsi@57.0.4` (the
  latest release) does not compile under Xcode 26.3's Swift 6.2.4 —
  `abs(milliseconds) <= maxJavaScriptDateMilliseconds` is reported as
  "type of expression is ambiguous". The patch hoists it into an explicitly
  typed local. `patch-package` reapplies it on every install. Drop the patch
  once upstream fixes it.

## Layout

```
src/
  time.ts             minute-of-day math, angle<->time, formatting (worklets)
  geometry.ts         arc paths, range segmentation, hit-testing (worklets)
  constants.ts        radii derived from screen width, marker palette, motion
  theme.ts            light/dark tokens
  clock/              the single Skia canvas: face, hands, tracks, arcs, draft
  ui/                 header, label bar, marker pens, calendar
  store/              reducer + seeded mock month
  screens/            layout and the one Pan gesture that drives everything
```

Two rendering rules worth knowing before editing:

- **One canvas.** The whole dial is a single `<Canvas>` driven by shared values,
  so a drag or a ticking second hand never re-renders React. The calendar's 42
  day-rings are likewise one canvas, not 42.
- **One gesture.** `clockday-screen.tsx` has a single `Gesture.Pan()` that
  resolves handle / arc / empty-track in `onBegin` and acts only in
  `onFinalize`. Stacking a handler per arc is what makes pans phantom-fire.
  A tap on a handle is *provisional* (`MAYBE_RESIZE`) and only becomes a resize
  once the finger travels `TAP_SLOP` — that is what leaves single/double taps
  detectable on short ranges, where the whole arc sits inside a grab radius.

Curved labels use Skia's `<TextPath>` with `matchFont` — a system typeface, so
there is no font asset to bundle. Glyphs stand perpendicular to the direction of
travel, so arcs in the lower half of the dial draw their label path reversed
(`needsReverse()`), otherwise the text reads upside down.

## State

In-memory only. The month is seeded from a deterministic PRNG so the calendar
looks populated and stable, and the current day is seeded with the reference
design's ranges. Everything resets on reload — there is no persistence layer.
