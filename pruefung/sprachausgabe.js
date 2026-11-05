// Prüft die Technik-Testseite gegen die Sprachausgabe nach iOS-Regeln.
// Aufruf: node pruefung/sprachausgabe.js [pfad/zur/seite.html]
const { chromium, devices } = require('playwright');
const path = require('path');
const iosStimme = require('./ios-stimme.js');

const SEITE = path.resolve(process.argv[2] || path.join(__dirname, '../test/index.html'));
const LOESUNG = { '7 + 8': '15', '6 · 7': '42', '15 − 8': '7', '42 : 6': '7', '9 + 6': '15' };

(async () => {
  const browser = await chromium.launch();
  const seite = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
  await seite.addInitScript(iosStimme);
  await seite.goto(`file://${SEITE}`);
  await seite.tap('#los');
  await seite.waitForSelector('#runde:not([hidden])', { timeout: 90000 });
  for (let i = 1; i <= 5; i++) {
    await seite.waitForFunction((n) => document.getElementById('zaehler').textContent.startsWith(`Aufgabe ${n}`)
      && !document.getElementById('eingabe').textContent, i);
    await seite.waitForTimeout(800); // erst nach Ansage-Ende antworten
    const eingabe = i === 5 ? '16' : LOESUNG[await seite.textContent('#aufgabe')]; // letzte Aufgabe absichtlich falsch
    for (const z of eingabe) await seite.tap(`[data-z="${z}"]`);
    await seite.waitForTimeout(950);
  }
  await seite.waitForSelector('#ergebnis:not([hidden])');
  const text = await seite.inputValue('#text');
  const gesprochen = await seite.evaluate(() => window.gesprochen);
  await browser.close();
  console.log(text.split('\n').filter((z) => /Ende-Signal/.test(z)).join('\n'));
  const stumm = !/Ende-Signal 8\/8/.test(text) || !/Ende-Signal 5\/5/.test(text);
  const korrektur = gesprochen.find((g) => g.text === '9 plus 6 ist 15');
  const fehler = [
    stumm && 'Ansagen blieben stumm',
    !korrektur && 'Korrektur nicht vorgelesen',
    korrektur && korrektur.rueck !== '9 + 6 = 15' && 'Korrektur verschwand vor Ansage-Ende',
  ].filter(Boolean);
  console.log(fehler.length ? `DURCHGEFALLEN: ${fehler.join(', ')}.` : 'BESTANDEN');
  process.exit(fehler.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
