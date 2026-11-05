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
const SPEICHER = 'rechentrainer-v1';

const loese = (t) => {
  const [x, op, y] = t.replace(' =', '').split(' ');
  return String({ '+': +x + +y, '·': x * y, '−': x - y, ':': x / y }[op]);
};
const loeseGesagt = (t) => {
  const [x, wort, , y] = t.includes('geteilt') ? t.split(' ') : [...t.split(' ').slice(0, 2), '', t.split(' ')[2]];
  const r = { plus: +x + +y, mal: x * y, minus: x - y, geteilt: x / (t.includes('geteilt') ? t.split(' ')[3] : y) }[wort];
  return String(r);
};
const stand = (seite) => seite.evaluate((k) => JSON.parse(localStorage.getItem(k)), SPEICHER);
const leeren = async (seite) => {
  await seite.evaluate((k) => localStorage.removeItem(k), SPEICHER);
  await seite.reload();
};
const tippe = async (seite, wert) => { for (const z of wert) await seite.tap(`[data-z="${z}"]`); };
const bild = async (seite, name) => { if (BILDER) await seite.screenshot({ path: `${BILDER}/${name}.png` }); };

// Wartet, bis die Aufgabe sichtbar ist und noch keine Ziffer steht, oder bis die Runde endet.
const sichtbar = async (seite) => {
  await seite.waitForFunction(() => {
    const f = document.querySelector('#gleichung .feld:not(.fertig)');
    return !document.getElementById('ende').hidden || (f && !f.textContent);
  }, undefined, { timeout: 15000 });
  if (!(await seite.isHidden('#ende'))) return null;
  return seite.getAttribute('#gleichung', 'aria-label');
};

async function layoutPasst(seite) {
  await seite.tap('#los');
  const raus = await seite.evaluate(() => {
    const weg = document.createElement('div');
    weg.id = 'weg';
    const rueck = document.getElementById('rueck'), g = document.getElementById('gleichung');
    rueck.replaceChildren(weg);
    const liste = [];
    for (const k of Kern.KARTEN) {
      for (const z of [() => 0, () => 0.9]) {
        const a = Kern.aufgabe(k, z);
        weg.textContent = Kern.rechenweg(k, a);
        const w = weg.getBoundingClientRect(), r = rueck.getBoundingClientRect();
        if (w.height > r.height + 0.5 || w.width > r.width + 0.5 || weg.scrollWidth > weg.clientWidth) liste.push(weg.textContent);
        zeichneGleichung(a, String(a.loesung), true);
        if (g.firstElementChild.getBoundingClientRect().left < 0 || g.lastElementChild.getBoundingClientRect().right > innerWidth) liste.push(a.zeige);
      }
    }
    const p = document.getElementById('pad').getBoundingClientRect();
    if (document.documentElement.scrollHeight > innerHeight || p.bottom > innerHeight) liste.push('Seite rollt');
    return liste;
  });
  assert.deepStrictEqual(raus, [], `Passt nicht: ${raus}`);
  await leeren(seite);
}

async function erstHoeren(seite) {
  await seite.tap('#los');
  await seite.waitForTimeout(120);
  assert.strictEqual(await seite.locator('#gleichung span').count(), 0, 'Aufgabe sichtbar, bevor die Ansage endet');
  assert.strictEqual(await seite.locator('#hoeren').count(), 1);
  assert.ok((await seite.evaluate(() => window.gesagtJetzt)), 'Erste Ansage blieb stumm');
  await bild(seite, 'hoeren');
  const t = await sichtbar(seite);
  await bild(seite, 'aufgabe');
  await tippe(seite, loese(t));
  await seite.waitForSelector('#blitz');
  await seite.waitForTimeout(260);
  await bild(seite, 'blitz');
  assert.strictEqual((await stand(seite)).versuche.at(-1).ergebnis, 'schnell');
}

async function antwortWaehrendAnsage(seite) {
  await seite.waitForFunction(() => document.getElementById('hoeren') && window.gesagtJetzt);
  const gesagt = await seite.evaluate(() => window.gesagtJetzt);
  await tippe(seite, loeseGesagt(gesagt));
  await seite.waitForSelector('#blitz');
  const v = (await stand(seite)).versuche.at(-1);
  assert.deepStrictEqual([v.ergebnis, v.ms], ['schnell', 0], JSON.stringify(v));
}

async function falschUndWiederkehr(seite) {
  const t = await sichtbar(seite);
  const falsch = loese(t) === '9' ? '8' : '9'.repeat(loese(t).length);
  const start = (await stand(seite)).versuche.length;
  await tippe(seite, falsch);
  await seite.waitForSelector('#weg');
  const seit = Date.now();
  assert.ok((await seite.textContent('#gleichung')).endsWith(loese(t)), 'Lösung steht nicht in der Gleichung');
  await bild(seite, 'korrektur');
  await seite.waitForSelector('#weg', { state: 'detached', timeout: 12000 });
  const dauer = Date.now() - seit;
  assert.ok(dauer >= 5300, `Korrektur stand nur ${dauer} ms`);
  const gesagt = await seite.evaluate(() => window.gesprochen.filter((g) => / ist /.test(g.text)).at(-1));
  assert.ok(gesagt.rueck.includes(loese(t)), 'Korrektur vor Ansage-Ende weg');
  for (let i = 0; i < 2; i++) await tippe(seite, loese(await sichtbar(seite)));
  await seite.waitForFunction((n) => JSON.parse(localStorage.getItem('rechentrainer-v1')).versuche.length === n, start + 3);
  await tippe(seite, loese(await sichtbar(seite)));
  await seite.waitForFunction((n) => JSON.parse(localStorage.getItem('rechentrainer-v1')).versuche.length === n, start + 4);
  const v = (await stand(seite)).versuche;
  assert.strictEqual(v[start + 3].karte, v[start].karte, 'Aufgabe kam nicht nach zwei anderen wieder');
}

async function zeitAbgelaufen(seite) {
  await leeren(seite);
  await seite.tap('#los');
  await sichtbar(seite);
  const seit = Date.now();
  await seite.waitForSelector('#weg', { timeout: 7000 });
  const dauer = Date.now() - seit;
  assert.ok(dauer > 4700 && dauer < 5800, `Lösung kam nach ${dauer} ms`);
  const v = (await stand(seite)).versuche.at(-1);
  assert.deepStrictEqual([v.ergebnis, v.antwort, v.stufe_nach], ['langsam', null, 1], JSON.stringify(v));
  await bild(seite, 'zeit');
  await seite.waitForTimeout(1700);
  assert.ok(/ ist \d+$/.test(await seite.evaluate(() => window.gesprochen.at(-1).text)), 'Lösung nicht vorgelesen');
  await seite.tap('[data-z="1"]');
  assert.strictEqual((await stand(seite)).versuche.length, 1, 'Eingabe während der Lösung wurde gewertet');
}

async function ganzeRunde(seite) {
  await leeren(seite);
  await seite.tap('#los');
  for (let i = 0; i < 25; i++) {
    const t = await sichtbar(seite);
    if (!t) break;
    assert.ok(!/[a-zäöüß]/i.test(await seite.textContent('#runde')), 'Text oder Zeitangabe während der Aufgabe');
    await tippe(seite, loese(t));
  }
  await seite.waitForSelector('#ende:not([hidden])');
  await bild(seite, 'ende');
  const s = await stand(seite);
  assert.strictEqual(s.versuche.length, 20);
  assert.ok(s.versuche.every((v) => /^[pmxd]_\d{1,2}_\d{1,2}$/.test(v.karte)));
  await seite.reload();
  assert.strictEqual(Object.keys((await stand(seite)).staende).length, Object.keys(s.staende).length, 'Fortschritt verloren');
}

(async () => {
  await new Promise((r) => dienst.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const seite = await (await browser.newContext(FORMAT)).newPage();
  const fehler = [];
  seite.on('pageerror', (e) => fehler.push(e.message));
  seite.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
  await seite.addInitScript(iosStimme);
  await seite.goto(`http://127.0.0.1:${dienst.address().port}/`);
  await seite.evaluate(() => document.fonts.ready);
  await bild(seite, 'start');

  for (const [name, fn] of Object.entries({ layoutPasst, erstHoeren, antwortWaehrendAnsage, falschUndWiederkehr, zeitAbgelaufen, ganzeRunde })) {
    await fn(seite);
    console.log(`ok  ${name}`);
  }
  await browser.close();
  dienst.close();
  assert.deepStrictEqual(fehler, [], `JS-Fehler: ${fehler}`);
  console.log('BESTANDEN');
})().catch((e) => { console.error('DURCHGEFALLEN:', e.message); process.exit(1); });
