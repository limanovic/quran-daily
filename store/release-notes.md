# Release notes ("What's new")

Play Console caps this field at 500 characters per language.

## 1.0.0 — first release

```
First release.

Receive a passage of the Qur'an at the times you set. Each reminder can work
through the mushaf in order, or bring a passage at random — your choice, per
time. Read a few ayahs or full pages.

Uthmani Arabic with 12 translations, a full surah and page browser, bookmarks,
adjustable text size, light and dark themes.

Entirely offline. No account, no ads, no tracking.
```

## Notes for the closed test

Ask testers to check the parts that only show themselves over days:

- A reminder set for tomorrow morning actually arrives, and arrives on time.
  On Xiaomi/Oppo/Vivo/Huawei devices this is where autostart and battery
  optimisation bite — the app offers both system screens from Settings.
- A wird set to **In order** advances by one portion per reminder, and does not
  jump or repeat after the app has been closed for a few days.
- With several times set to **In order**, they split one reading across the day
  — 09:00 gets 1:1, 13:00 gets 1:2, 18:00 gets 1:3 — rather than each starting
  over at Al-Fatiha.
- A time set to **Random** never moves that progression: the in-order times
  carry on as if it weren't there.
- Tapping a reminder opens exactly the passage it showed.
- Changing the amount or the time on an existing wird does not restart the
  reading's place in the mushaf.
