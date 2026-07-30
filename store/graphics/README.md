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
| `android-icon-foreground.png` | 512×512, alpha | adaptive-icon foreground |
| `android-icon-monochrome.png` | 432×432, alpha | themed-icon layer |
| `splash-icon.png` | 1024×1024, alpha | splash screen logo |
| `screenshots/*.png` | 1440×3120 | Play Console phone screenshots |

The bottom four are **shipped** — they were copied into `assets/images/` (see
"Icon swap" below) and the app no longer uses the stock Expo template icon.

## Adaptive icon safe zone

Android crops the foreground layer to the central 66/108 of the canvas. The
rotated square's vertices sit at `110 × √2 ≈ 156` from centre, inside the 156px
safe radius, so nothing clips on a circular or squircle mask.

`icon.html` (full-bleed) uses a larger square — it is never masked, so it can
run to the edges.

## Icon swap

Already done. Re-run these after any `render.sh` change, then
`npx expo prebuild -p android` to regenerate the native mipmaps:

```sh
cp store/graphics/app-icon-1024.png            assets/images/icon.png
cp store/graphics/android-icon-foreground.png  assets/images/android-icon-foreground.png
cp store/graphics/android-icon-monochrome.png  assets/images/android-icon-monochrome.png
cp store/graphics/splash-icon.png              assets/images/splash-icon.png
```

`app.json` changes that went with the swap: `adaptiveIcon.backgroundColor` is
now `#23417A` (was `#E6F4FE`, the Expo template's pale blue, which clashed with
the gold), and `adaptiveIcon.backgroundImage` was removed along with
`assets/images/android-icon-background.png` — a background *image* overrides
`backgroundColor`. Splash `imageWidth` went 76 → 120: the template logo carried
its own padding, this one is drawn to the edge of its canvas.

Still template: `assets/expo.icon` (`expo.ios.icon`) and
`assets/images/favicon.png`. Neither ships on Android.

Screenshots in this directory were taken before the swap, so they show the old
icon where the launcher is visible.

## Rendering

`render.sh` drives headless Chrome. Chrome is the rasteriser because this
machine has no `rsvg-convert`, ImageMagick, or Pillow, and `sips` cannot read
SVG.
