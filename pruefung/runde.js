// Spielt die Übungsrunde im kleinen Handyformat durch. Aufruf: node pruefung/runde.js
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');
const iosStimme = require('./ios-stimme.js');

const WURZEL = path.resolve(__dirname, '..');
const TYP = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const dienst = http.createServer((anf, ant) => {
  const datei = path.join(WURZEL, anf.url === '/' ? 'index.html' : anf.url.split('?')[0]);
  fs.readFile(datei, (f, inhalt) => {
    ant.writeHead(f ? 404 : 200, { 'Content-Type': TYP[path.extname(datei)] || 'text/plain' });
    ant.end(inhalt);
  });
});
const BILDER = process.env.BILDER;
const FORMAT = { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

const liesAufgabe = (seite) => seite.getAttribute('#gleichung', 'aria-label');
const loese = (t) => {
  const [x, op, y] = t.replace(' =', '').split(' ');
  return String({ '+': +x + +y, '·': x * y, '−': x - y, ':': x / y }[op]);
};
const wartePaar = (seite, alt) => seite.waitForFunction((a) => {
  const g = document.getElementById('gleichung');
  return g.getAttribute('aria-label') !== a && !document.querySelector('#rueck svg, #weg') && !document.getElementById('runde').hidden;
}, alt);
const tippe = async (seite, wert) => { for (const z of wert) await seite.tap(`[data-z="${z}"]`); };
const passt = (seite) => seite.evaluate(() => {
  const m = document.querySelector('main'), r = document.getElementById('pad');
  return { hoch: document.documentElement.scrollHeight - innerHeight, breit: document.documentElement.scrollWidth - innerWidth, padUnten: r.hidden ? 0 : r.getBoundingClientRect().bottom - innerHeight, mainB: m.clientWidth };
});

(async () => {
  await new Promise((r) => dienst.listen(0, '127.0.0.1', r));
  const SEITE = `http://127.0.0.1:${dienst.address().port}/`;
  const browser = await chromium.launch();
  const kontext = await browser.newContext(FORMAT);
  const seite = await kontext.newPage();
  const fehler = [];
  seite.on('pageerror', (e) => fehler.push(e.message));
  seite.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
  await seite.addInitScript(iosStimme);
  await seite.goto(SEITE);
  await seite.evaluate(() => document.fonts.ready);
  if (BILDER) await seite.screenshot({ path: `${BILDER}/start.png` });

  await seite.tap('#los');
  const zuBreit = await seite.evaluate(() => {
    const weg = document.createElement('div');
    weg.id = 'weg';
    const rueck = document.getElementById('rueck'), g = document.getElementById('gleichung');
    rueck.replaceChildren(weg);
    const raus = [];
    for (const k of Kern.KARTEN) {
      for (const z of [() => 0, () => 0.9]) {
        const a = Kern.aufgabe(k, z);
        for (const text of Object.values(Kern.rechenweg(k, a))) {
          weg.textContent = text;
          const w = weg.getBoundingClientRect(), r = rueck.getBoundingClientRect();
          if (w.height > r.height + 0.5 || w.width > r.width + 0.5 || weg.scrollWidth > weg.clientWidth) raus.push(text);
        }
        zeichneGleichung(a, String(a.loesung), true);
        const r = g.lastElementChild.getBoundingClientRect(), l = g.firstElementChild.getBoundingClientRect();
        if (l.left < 0 || r.right > innerWidth) raus.push(a.zeige);
      }
    }
    rueck.replaceChildren();
    return raus;
  });
  assert.deepStrictEqual(zuBreit, [], `Zu breit: ${zuBreit}`);
  await seite.reload();
  await seite.tap('#los');
  const erste = await liesAufgabe(seite);
  await seite.waitForTimeout(100);
  if (BILDER) await seite.screenshot({ path: `${BILDER}/aufgabe.png` });
  const f1 = await passt(seite);
  assert.ok(f1.hoch <= 0 && f1.breit <= 0 && f1.padUnten <= 0, `Passt nicht: ${JSON.stringify(f1)}`);
  await seite.waitForTimeout(150);
  assert.ok((await seite.evaluate(() => window.gesprochen.length)) >= 1, 'Erste Ansage blieb stumm');

  await tippe(seite, loese(erste));
  await seite.waitForSelector('#blitz');
  if (BILDER) { await seite.waitForTimeout(260); await seite.screenshot({ path: `${BILDER}/blitz.png` }); }

  await wartePaar(seite, erste);
  const zweite = await liesAufgabe(seite);
  await seite.waitForTimeout(250);
  const falsch = loese(zweite) === '9' ? '8' : '9'.repeat(loese(zweite).length);
  await tippe(seite, falsch);
  await seite.waitForSelector('#weg');
  await seite.waitForTimeout(300);
  if (BILDER) await seite.screenshot({ path: `${BILDER}/korrektur.png` });
  assert.ok(!(await seite.textContent('#gleichung')).includes(falsch) || falsch === loese(zweite), 'Falsche Eingabe bleibt stehen');
  await seite.waitForTimeout(1500);
  const gesagt = await seite.evaluate(() => window.gesprochen.at(-1));
  assert.ok(/ ist \d+$/.test(gesagt.text), `Korrektur nicht vorgelesen: ${gesagt.text}`);
  assert.ok(gesagt.rueck.includes(loese(zweite)), `Korrektur vor Ansage-Ende weg: ${gesagt.rueck}`);

  for (let alt = zweite, i = 0; i < 40; i++) {
    await seite.waitForFunction((a) => !document.getElementById('ende').hidden || (document.getElementById('gleichung').getAttribute('aria-label') !== a && !document.querySelector('#rueck svg, #weg')), alt, { timeout: 15000 });
    if (!(await seite.isHidden('#ende'))) break;
    const t = await liesAufgabe(seite);
    alt = t;
    const text = await seite.textContent('#runde');
    assert.ok(!/\d\s*(s|ms|sek)/i.test(text.replace(/\s/g, ' ').match(/[a-z]+/i) ? '' : text), 'Zeitangabe sichtbar');
    await tippe(seite, loese(t));
  }
  await seite.waitForSelector('#ende:not([hidden])');
  if (BILDER) await seite.screenshot({ path: `${BILDER}/ende.png` });

  const stand = await seite.evaluate(() => JSON.parse(localStorage.getItem('rechentrainer-v1')));
  assert.strictEqual(stand.versuche.length, 20, `${stand.versuche.length} Versuche`);
  assert.ok(stand.versuche.every((v) => /^[pmxd]_\d{1,2}_\d{1,2}$/.test(v.karte) && ['schnell', 'langsam', 'falsch'].includes(v.ergebnis)));
  assert.ok(stand.versuche.some((v) => v.ergebnis === 'falsch'));
  const gesehen = Object.keys(stand.staende).length;

  await seite.reload();
  const nachher = await seite.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rechentrainer-v1')).staende).length);
  assert.strictEqual(nachher, gesehen, 'Fortschritt nach Neuladen verloren');

  await seite.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rechentrainer-v1'));
    s.staende = {}; s.versuche = []; s.tag = { datum: '', neu: 0 };
    localStorage.setItem('rechentrainer-v1', JSON.stringify(s));
  });
  await seite.reload();
  await seite.tap('#los');
  await seite.waitForSelector('#weg', { timeout: 23000 });
  const tipp = await seite.textContent('#weg');
  assert.ok(tipp.startsWith('Tipp: '), tipp);
  assert.ok(!(await seite.textContent('#gleichung')).trim().endsWith('='.repeat(2)));
  if (BILDER) await seite.screenshot({ path: `${BILDER}/tipp.png` });
  const h = await liesAufgabe(seite);
  await tippe(seite, loese(h));
  await seite.waitForSelector('#haken');
  const letzter = await seite.evaluate(() => JSON.parse(localStorage.getItem('rechentrainer-v1')).versuche.at(-1));
  assert.strictEqual(letzter.ergebnis, 'falsch', 'Antwort mit Tipp darf nicht als gekonnt zählen');

  await browser.close();
  dienst.close();
  assert.deepStrictEqual(fehler, [], `JS-Fehler: ${fehler}`);
  console.log(`BESTANDEN: ${stand.versuche.length} Aufgaben, ${gesehen} Karten gesehen, Fortschritt bleibt, Tipp kommt, nichts rollt im Format 360 × 640`);
})().catch((e) => { console.error('DURCHGEFALLEN:', e.message); process.exit(1); });
