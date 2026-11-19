# Supermarkt (Web-App für iPhone)

Reine Web-App ohne Build-Schritt. Dateien: index.html, app.js, style.css, sw.js, manifest.webmanifest, icons/.

## Kostenlos veröffentlichen mit GitHub Pages
1. Konto auf github.com anlegen (kostenlos).
2. Oben rechts "+" -> "New repository". Name z. B. `supermarkt`, Sichtbarkeit "Public", anlegen.
3. "uploading an existing file" anklicken und den **Inhalt** dieses Ordners hineinziehen
   (index.html, app.js, … und den Ordner icons) -> "Commit changes".
4. Settings -> Pages -> Source: "Deploy from a branch", Branch `main`, Ordner `/ (root)` -> Save.
5. Nach 1-2 Minuten steht oben die Adresse: https://DEIN-NAME.github.io/supermarkt/

## Auf dem iPhone installieren
1. Adresse in **Safari** öffnen (nicht in Chrome).
2. Teilen-Symbol -> "Zum Home-Bildschirm" -> Hinzufügen.
3. App vom Home-Bildschirm starten. Sie funktioniert danach auch offline.

## Wichtig
- Die Daten liegen nur auf dem iPhone. Regelmäßig im Tab "Backup" exportieren
  (Teilen-Menü -> "In Dateien sichern", z. B. iCloud Drive).
- Handywechsel: neue App installieren, Tab "Backup" -> "Backup importieren".
- Die Adresse ist öffentlich, die Daten aber nicht: sie verlassen dein Gerät nie.

## Lokal am PC testen
`python -m http.server 8000` im Ordner starten, dann http://localhost:8000 öffnen.
