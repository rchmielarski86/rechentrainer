// Prüft Anmeldung, Abgleich, Offline-Betrieb, Einstellungen und Bericht. Aufruf: node pruefung/onlinestand.js
const assert = require('assert');
const { starteTestbett, anmelden } = require('./testbett.js');

const FORMAT = { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true };
const KURZ = { zeitlimit_ms: 5000, aufgaben_pro_runde: 3, neue_pro_tag: 4 };
const NAME = 'rechentrainer-v2-nutzer-1';
const stand = (seite) => seite.evaluate((n) => JSON.parse(localStorage.getItem(n)), NAME);
const loese = (t) => {
  const [x, op, y] = t.replace(' =', '').split(' ');
  return String({ '+': +x + +y, '·': x * y, '−': x - y, ':': x / y }[op]);
};

async function spieleRunde(seite) {
  await seite.click('#los');
  for (;;) {
    await seite.waitForFunction(() => {
      const f = document.querySelector('#gleichung .feld:not(.fertig)');
      return !document.getElementById('ende').hidden || (f && !f.textContent);
    }, undefined, { timeout: 15000 });
    if (!(await seite.isHidden('#ende'))) return;
    for (const z of loese(await seite.getAttribute('#gleichung', 'aria-label'))) await seite.tap(`[data-z="${z}"]`);
  }
}

(async () => {
  const bett = await starteTestbett(FORMAT);
  const { seite, backend, kontext, fehler } = bett;
  backend.einstellung = { ...KURZ };

  assert.ok(await seite.isVisible('#anmeldeform'), 'Anmeldung fehlt');
  assert.ok(await seite.isHidden('#start'), 'Ohne Anmeldung sichtbar');
  await anmelden(seite, 'falsch');
  await seite.waitForFunction(() => document.getElementById('anmeldehinweis').textContent.includes('stimmt nicht'));
  backend.netzAus = true;
  await seite.fill('#passwort', 'richtig');
  await seite.click('#anmeldeform button');
  await seite.waitForFunction(() => document.getElementById('anmeldehinweis').textContent.includes('Keine Verbindung'));
  backend.netzAus = false;
  await anmelden(seite);
  assert.ok(await seite.isVisible('#los'));
  assert.strictEqual((await stand(seite)).einstellung.aufgaben_pro_runde, 3, 'Einstellung nicht übernommen');
  console.log('ok  Anmeldung und Einstellungen');

  await spieleRunde(seite);
  await seite.waitForFunction((n) => JSON.parse(localStorage.getItem(n)).offen.length === 0, NAME);
  assert.strictEqual(backend.zeilen.length, 3);
  console.log('ok  Runde landet online');

  await kontext.setOffline(true);
  backend.netzAus = true;
  await seite.click('#mehr');
  for (;;) {
    await seite.waitForFunction(() => {
      const f = document.querySelector('#gleichung .feld:not(.fertig)');
      return !document.getElementById('ende').hidden || (f && !f.textContent);
    }, undefined, { timeout: 15000 });
    if (!(await seite.isHidden('#ende'))) break;
    for (const z of loese(await seite.getAttribute('#gleichung', 'aria-label'))) await seite.tap(`[data-z="${z}"]`);
  }
  const offen = (await stand(seite)).offen.length;
  assert.strictEqual(offen, 3, 'Ohne Netz nicht gemerkt');
  assert.strictEqual(backend.zeilen.length, 3);
  await kontext.setOffline(false);
  backend.netzAus = false;
  await seite.evaluate(() => window.dispatchEvent(new Event('online')));
  await seite.waitForFunction((n) => JSON.parse(localStorage.getItem(n)).offen.length === 0, NAME);
  assert.strictEqual(backend.zeilen.length, 6, 'Offline-Antworten fehlen oder doppelt');
  console.log('ok  Offline-Antworten kommen genau einmal nach');

  const zweites = await bett.neuesGeraet();
  await anmelden(zweites.seite);
  const karten = Object.keys((await stand(zweites.seite)).staende).length;
  assert.strictEqual(karten, new Set(backend.zeilen.map((v) => v.karte)).size, 'Stand kam nicht aufs zweite Gerät');
  console.log('ok  Zweites Gerät hat denselben Stand');

  backend.ablauf = 0;
  await seite.evaluate((n) => {
    const s = JSON.parse(localStorage.getItem('rechentrainer-sitzung'));
    s.bis = 0;
    localStorage.setItem('rechentrainer-sitzung', JSON.stringify(s));
    return n;
  }, NAME);
  const vorher = backend.tokenAnfragen;
  await seite.reload();
  await seite.waitForSelector('#los, #mehr');
  await seite.waitForFunction(() => JSON.parse(localStorage.getItem('rechentrainer-sitzung')).zugang);
  assert.ok(backend.tokenAnfragen > vorher, 'Sitzung nicht erneuert');
  backend.ablauf = 3600;
  console.log('ok  Abgelaufene Sitzung erneuert sich selbst');

  await seite.goto(`${bett.adresse}bericht.html`);
  await seite.waitForSelector('#inhalt:not([hidden])');
  assert.strictEqual(await seite.textContent('#aufgaben'), '6');
  assert.strictEqual(await seite.$eval('#zeitlimit_ms', (s) => s.value), '5000');
  await seite.selectOption('#zeitlimit_ms', '7000');
  await seite.click('#einstellungen button');
  await seite.waitForFunction(() => document.getElementById('meldung').textContent.startsWith('Gespeichert'));
  assert.strictEqual(backend.einstellung.zeitlimit_ms, 7000);
  const breit = await seite.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(breit <= 0, `Bericht zu breit: ${breit}`);
  if (process.env.BILDER) await seite.screenshot({ path: `${process.env.BILDER}/bericht.png`, fullPage: true });
  await seite.click('#abmelden');
  assert.ok(await seite.isVisible('#anmeldeform'));
  console.log('ok  Bericht und Einstellungen');

  await bett.ende();
  assert.deepStrictEqual([...fehler, ...zweites.fehler], [], 'JS-Fehler');

  const netzlos = await starteTestbett(FORMAT, { serviceWorkers: 'allow' });
  netzlos.backend.einstellung = { ...KURZ };
  await anmelden(netzlos.seite);
  await netzlos.seite.evaluate(() => navigator.serviceWorker.ready);
  await netzlos.seite.waitForFunction(() => navigator.serviceWorker.controller);
  await netzlos.kontext.setOffline(true);
  netzlos.backend.netzAus = true;
  await netzlos.seite.reload();
  await netzlos.seite.waitForSelector('#los');
  await netzlos.seite.evaluate(() => document.fonts.ready);
  assert.ok(await netzlos.seite.evaluate(() => document.fonts.check('700 40px Andika')), 'Schrift offline nicht da');
  await spieleRunde(netzlos.seite);
  assert.strictEqual((await stand(netzlos.seite)).offen.length, 3);
  for (const pfad of ['bericht.html', 'manifest.webmanifest', 'symbole/symbol-512.png']) {
    const ok = await netzlos.seite.evaluate((p) => fetch(p).then((a) => a.ok), pfad);
    assert.ok(ok, `${pfad} fehlt offline`);
  }
  await netzlos.ende();
  console.log('ok  App startet und läuft komplett ohne Netz');
  console.log('BESTANDEN');
})().catch((e) => { console.error('DURCHGEFALLEN:', e.message); process.exit(1); });
