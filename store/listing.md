# Play Store Listing — Daily Qur’an

## App name (30 chars max)

Daily Qur’an

## Short description (80 chars max)

Daily Qur’an passages by notification — in order or at random. 100% offline.

## Full description (4000 chars max)

Receive a passage of the Qur’an every day, at the times you choose — as a simple notification on your device. Tap it, and the Reader opens exactly that passage.

**How it works**

Pick one or more daily times. Each one is its own wird: choose whether it arrives as a few ayahs or as full mushaf pages, and how many.

Each wird can be set to either:

• **In order** — it works through the mushaf from Al-Fatiha onward, carrying on from wherever it last left off. Finish An-Nas and it begins again at the start.
• **Random** — a different passage every time, chosen at random.

Set several times if you like, each with its own reading and its own place in the mushaf: an ordered wird in the morning, a random ayah in the evening.

**Features**

• Daily passages by local notification, at your chosen times
• Sequential or random, set per delivery time
• Ayahs or mushaf pages, in the amount you choose
• Uthmani Arabic text in the script of the Madani mushaf
• 12 translations: English (Sahih International), Bosnian (Muhamed Mehanović), Albanian (Hasan Efendi Nahi), German (Bubenheim & Elyas), Turkish (Diyanet İşleri), French (Muhammad Hamidullah), Spanish (Julio Cortés), Italian (Hamza Roberto Piccardo), Dutch (Fred Leemhuis), Russian (Эльмир Кулиев), Indonesian (Kementerian Agama RI), Urdu (Fateh Muhammad Jalandhry)
• Show several translations side by side with the Arabic, or on their own
• App interface available in all 12 languages
• Read as continuous scroll or one mushaf page at a time
• Adjustable text size
• Full Qur’an browser: all 114 surahs, 604 pages
• Bookmarks, and one tap back to where you stopped reading
• Light and dark theme

**Completely private**

• 100% offline — no internet connection needed, ever
• No account, no sign-up
• No ads, no analytics, no tracking
• Free

The full Qur’an — 6,236 ayahs — is bundled with the app in a local database. Nothing is downloaded, nothing is sent anywhere. Your settings, bookmarks and reading progress stay on your device.

## Category

Books & Reference (alternative: Lifestyle)

## Tags / keywords (for ASO, not a console field)

quran, koran, kuran, daily verse, ayah, islam, muslim, offline quran, wird, bosnian quran

## Contact email

adilimanovic@gmail.com

## Graphics checklist

Generated into `store/graphics/` — see the README there. Regenerate with
`store/graphics/render.sh`.

- [x] App icon 512×512 PNG, no alpha — `graphics/play-icon-512.png`
- [x] Feature graphic 1024×500 — `graphics/feature-graphic-1024x500.png`
- [x] In-app icon matches the Play icon — the Rub el Hizb mark shipped in
      `assets/images/` (commit "icons")
- [x] Phone screenshots, 1440×2970 — five in `graphics/screenshots/`: home, the
      wird editor showing the sequential option, the reader, the surah list, and
      the reader in dark. Captured on a Pixel 7 Pro API 34 emulator, status bar
      cropped off the top.
- [ ] Optional: 7" and 10" tablet screenshots

Note: `capture-screenshots.sh` is stale — its taps are hard-coded coordinates
and it still reaches for Appearance on the home screen, which moved to Settings.
The current shots were driven by looking up each control's bounds with
`uiautomator dump`. Rewrite the script that way before relying on it again, and
mind that the reported bounds sit ~73px above where the app actually paints.

## Permissions to explain, if asked

`SCHEDULE_EXACT_ALARM` — used only to make a reminder arrive at the minute the
user set. Not the policy-restricted `USE_EXACT_ALARM`; the app works without the
grant, the reminder simply arrives batched a few minutes late.

## Data safety form answers

- Does your app collect or share any of the required user data types? → **No**
- Is all of the user data collected by your app encrypted in transit? → N/A (no data collected)
- Do you provide a way for users to request that their data is deleted? → N/A

## Content rating questionnaire notes

- Category: Reference/Educational content
- No violence, sexuality, profanity, gambling, drugs
- Contains religious content — answer honestly; results in Everyone/PEGI 3 rating
