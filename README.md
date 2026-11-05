# Rechentrainer

Übungs-App für kleines 1+1 und 1×1 mit Wiedervorlage. Läuft als Web-App über GitHub Pages, Lernstände liegen je Konto in Supabase. Die Registrierung ist geschlossen.

| Datei | Inhalt |
|---|---|
| `index.html` | App |
| `bericht.html` | Wochenbericht und Einstellungen |
| `kern.js` | Aufgaben, Wiedervorlage, Auswertung |
| `netz.js` | Anmeldung und Datenbank |
| `sw.js` | Offline-Betrieb |
| `test/` | Technik-Test für neue Geräte |

Prüfungen (`npm i -g playwright`, Browser vorausgesetzt):

```
node pruefung/rechenkern.js
node pruefung/runde.js
node pruefung/onlinestand.js
node pruefung/sprachausgabe.js
```

Schrift: Andika, SIL Open Font License (`schrift/OFL.txt`).
