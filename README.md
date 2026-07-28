# Daily Qur’an

A small, fully offline personal app: at your chosen times each day, a local
notification delivers a random consecutive passage of the Qur’an (ayahs or
mushaf pages), with Arabic, English (Sahih International) and/or Bosnian
(Besim Korkut) text. Tapping the notification opens a Reader showing exactly
that passage. No accounts, no server, no analytics — everything runs
on-device from a bundled SQLite database.

## Run

```sh
npm install
npx expo start
```

Then open in Expo Go or a development build (`npx expo run:ios` /
`npx expo run:android`). Local notifications require a real device or
simulator — permissions are requested from the Settings screen banner.

## Structure

```
assets/quran.db          bundled Qur'an database (6,236 ayahs, 604 pages, 114 surahs)
assets/fonts/            Amiri (Arabic naskh) font
src/lib/db.ts            first-launch DB copy + typed query helpers
src/lib/passage.ts       buildPassage / resolvePassage / formatReference
src/lib/notifications.ts scheduling window, top-up, ledger
src/lib/settings.ts      settings persistence + validation
src/app/_layout.tsx      root layout: fonts, notification tap handler, top-up hook
src/app/index.tsx        Settings screen (home)
src/app/reader.tsx       Reader screen
```

## How selection works

The Qur’an is treated as one flat sequence of 6,236 ayahs (`ayah.id`).
`buildPassage(unit, count)` picks one random starting point (ayah id or page
number), clamped so the passage never runs off the end, then takes `count`
units consecutively — so passages freely cross surah boundaries (e.g.
2:285 → 2:286 → 3:1 → 3:2). Only a small serialisable `PassageKey`
(`{unit, startId|startPage, count}`) is ever stored; the Reader re-queries
the database from it via `resolvePassage`.

## How scheduling works

Local notifications freeze their content when scheduled, and iOS caps
pending local notifications at 64. So there is no repeating trigger.
Instead:

1. Every future (day × delivery-time) occurrence is scheduled as an
   independent **one-shot** notification. The random passage is picked at
   scheduling time and its text baked into the notification content.
2. Each scheduled occurrence is recorded in a **ledger** in AsyncStorage
   (`{notificationId, dateISO, time, passageKey}`), so a notification tap can
   reopen the exact passage.
3. At most **60** one-shots are kept pending (headroom under the 64 cap),
   covering `floor(60 / times-per-day)` days ahead.
4. On every app launch and foreground, past ledger entries are pruned and
   the window is **topped up** back to full. If the app isn't opened for
   long enough the queue eventually drains — opening the app refills it.
5. Any settings change cancels everything, clears the ledger, and rebuilds
   the window from scratch.

Occurrence times are built from local wall-clock components
(`new Date(y, m, d, hh, mm)`), so 09:00 stays 09:00 across DST changes.

## Swapping / adding translations later

Translations live as columns on the `ayah` table (`en`, `bs`). To add one:

1. Add a column to the database (e.g. `ALTER TABLE ayah ADD COLUMN de TEXT`)
   and fill it — regenerate `assets/quran.db` offline.
2. Extend `AyahRow` in `src/lib/db.ts` and the `Settings` display toggles in
   `src/lib/settings.ts`.
3. Render it in `src/app/reader.tsx` and include it in the notification body
   preference order in `src/lib/notifications.ts`.

Because only `PassageKey`s are persisted (never text), swapping translation
content never invalidates scheduled deliveries or history.

## Seams left for later

- **No-repeat mode**: replace `randomInt` in `buildPassage` with a shuffled-
  cycle cursor persisted in AsyncStorage.
- **Audio**: per-ayah recitation can key off the same global `ayah.id`.
- **Bookmarks/history**: the ledger already records every delivered
  `passageKey` — persist pruned entries instead of dropping them.
