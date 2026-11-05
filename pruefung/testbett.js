// Gemeinsame Grundlage der Prüfungen: lokaler Webserver, nachgestellte Datenbank, iOS-Sprachausgabe.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');
const iosStimme = require('./ios-stimme.js');

const WURZEL = path.resolve(__dirname, '..');
const TYP = {
  '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};
const KOPF = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json',
};

function neuesBackend() {
  return { zeilen: [], einstellung: null, netzAus: false, ablauf: 3600, tokenAnfragen: 0, passwort: 'richtig' };
}

async function bedieneDatenbank(route, b) {
  const a = route.request(), u = new URL(a.url());
  const json = (status, daten) => route.fulfill({ status, headers: KOPF, body: JSON.stringify(daten) });
  if (a.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: KOPF });
  if (b.netzAus) return route.abort();
  if (u.pathname === '/auth/v1/token') {
    if (u.searchParams.get('grant_type') === 'password' && a.postDataJSON().password !== b.passwort) return json(400, { error: 'invalid_grant' });
    b.tokenAnfragen += 1;
    return json(200, { access_token: `t${b.tokenAnfragen}`, refresh_token: 'r', expires_in: b.ablauf, user: { id: 'nutzer-1' } });
  }
  if (u.pathname === '/rest/v1/versuche') {
    if (a.method() === 'GET') return json(200, b.zeilen);
    a.postDataJSON().forEach((z) => { if (!b.zeilen.some((v) => v.id === z.id)) b.zeilen.push(z); });
    return route.fulfill({ status: 201, headers: KOPF });
  }
  if (u.pathname === '/rest/v1/karten_stand') {
    const letzte = new Map(b.zeilen.map((v) => [v.karte, v]));
    return json(200, [...letzte.values()].map((v) => ({ karte: v.karte, stufe: v.stufe_nach, faellig_am: v.faellig_am })));
  }
  if (u.pathname === '/rest/v1/einstellungen') {
    if (a.method() === 'GET') return json(200, b.einstellung ? [b.einstellung] : []);
    const { aktualisiert_am: _, ...werte } = a.postDataJSON();
    b.einstellung = werte;
    return route.fulfill({ status: 201, headers: KOPF });
  }
  return route.fulfill({ status: 404, headers: KOPF });
}

async function starteTestbett(format, { serviceWorkers = 'block' } = {}) {
  const dienst = http.createServer((anf, ant) => {
    const pfad = new URL(anf.url, 'http://x').pathname;
    const datei = path.join(WURZEL, pfad === '/' ? 'index.html' : pfad);
    fs.readFile(datei, (f, inhalt) => {
      ant.writeHead(f ? 404 : 200, { 'Content-Type': TYP[path.extname(datei)] || 'text/plain' });
      ant.end(inhalt);
    });
  });
  await new Promise((r) => dienst.listen(0, '127.0.0.1', r));
  const adresse = `http://127.0.0.1:${dienst.address().port}/`;
  const browser = await chromium.launch();
  const backend = neuesBackend();
  const neuesGeraet = async () => {
    const kontext = await browser.newContext({ ...format, serviceWorkers });
    await kontext.route('https://hyyltzfruinncpfbskde.supabase.co/**', (r) => bedieneDatenbank(r, backend));
    const seite = await kontext.newPage();
    const fehler = [];
    seite.on('pageerror', (e) => fehler.push(e.message));
    await seite.addInitScript(iosStimme);
    await seite.goto(adresse);
    return { kontext, seite, fehler };
  };
  const erstes = await neuesGeraet();
  const ende = async () => { await browser.close(); dienst.close(); };
  return { ...erstes, backend, adresse, neuesGeraet, ende };
}

async function anmelden(seite, passwort = 'richtig') {
  await seite.fill('#email', 'test@example.invalid');
  await seite.fill('#passwort', passwort);
  await seite.click('#anmeldeform button');
  if (passwort === 'richtig') await seite.waitForSelector('#los, #abmelden');
}

module.exports = { starteTestbett, anmelden };
