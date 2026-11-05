// Prüft eine Seite gegen eine Sprachausgabe mit den Regeln von iOS: ohne Tipp wird speak() still verworfen.
// Aufruf: node pruefung/sprachausgabe.js [pfad/zur/seite.html]
const { chromium, devices } = require('playwright');
const path = require('path');

const SEITE = path.resolve(process.argv[2] || path.join(__dirname, '../test/index.html'));
const LOESUNG = { '7 + 8': '15', '6 · 7': '42', '15 − 8': '7', '42 : 6': '7', '9 + 6': '15' };

const iosStimme = () => {
  let imTipp = false, frei = false, aktuell = null;
  const gesprochen = window.gesprochen = [];
  const anmelden = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (typ, fn, opt) {
    if (typ !== 'click') return anmelden.call(this, typ, fn, opt);
    return anmelden.call(this, typ, function (e) {
      imTipp = true;
      try { return fn.call(this, e); } finally { imTipp = false; }
    }, opt);
  };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const stimmen = [{ name: 'Anna', lang: 'de-DE', localService: true }];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => stimmen,
    addEventListener() {},
    cancel() { const c = aktuell; aktuell = null; if (c && c.onerror) c.onerror({ error: 'interrupted' }); },
    speak(u) {
      if (!frei) { if (!imTipp) return; frei = true; }
      aktuell = u;
      setTimeout(() => u.onstart && u.onstart(), 20);
      setTimeout(() => {
        if (aktuell !== u) return;
        aktuell = null;
        gesprochen.push({ text: u.text, rueck: document.getElementById('rueck').textContent });
        u.onend();
      }, / ist /.test(u.text) ? 1500 : 200);
    },
  } });
};

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
    await seite.waitForTimeout(300);
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
