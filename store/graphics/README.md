# Store graphics

Everything here is generated — never hand-edit the PNGs. Edit the HTML in `src/`
and re-run `./render.sh`.

The motif is the **Rub el Hizb** (۞), the mark used in the mushaf to divide the
text into eighths. Two overlapping squares plus a centre point. Colours come
from `src/lib/theme.ts`: deep indigo `#23417A` and manuscript gold `#AD8C36`
(rendered as a `#E4C87A → #9C7C2C` gradient so it reads as metal, not flat
yellow).

## Outputs

| File | Size | Used for |
| --- | --- | --- |
| `play-icon-512.png` | 512×512, opaque | Play Console app icon (Play rejects alpha) |
| `feature-graphic-1024x500.png` | 1024×500 | Play Console feature graphic |
| `app-icon-1024.png` | 1024×1024, opaque | candidate replacement for `assets/images/icon.png` |
| `android-icon-foreground.png` | 512×512, alpha | candidate replacement for the adaptive-icon foreground |
| `android-icon-monochrome.png` | 432×432, alpha | candidate replacement for the themed-icon layer |
| `screenshots/*.png` | 1440×3120 | Play Console phone screenshots |

The bottom three are **candidates only** — the app still ships the stock Expo
template icon. Swapping them in is a separate decision; see "Icon swap" below.

## Adaptive icon safe zone

Android crops the foreground layer to the central 66/108 of the canvas. The
rotated square's vertices sit at `110 × √2 ≈ 156` from centre, inside the 156px
safe radius, so nothing clips on a circular or squircle mask.

`icon.html` (full-bleed) uses a larger square — it is never masked, so it can
run to the edges.

## Icon swap

To make the app use this icon instead of the Expo template:

```sh
cp store/graphics/app-icon-1024.png            assets/images/icon.png
cp store/graphics/android-icon-foreground.png  assets/images/android-icon-foreground.png
cp store/graphics/android-icon-monochrome.png  assets/images/android-icon-monochrome.png
```

Then set `expo.android.adaptiveIcon.backgroundColor` in `app.json` to `#23417A`
— it is currently `#E6F4FE`, the Expo template's pale blue, which clashes with
the gold. `android-icon-background.png` would also need regenerating or
removing, since a background *image* overrides `backgroundColor`.

Screenshots in this directory were taken before any swap, so they show the old
icon only where the launcher is visible.

## Rendering

`render.sh` drives headless Chrome. Chrome is the rasteriser because this
machine has no `rsvg-convert`, ImageMagick, or Pillow, and `sips` cannot read
SVG.
