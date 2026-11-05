// Anmeldung und Datenbank über die Supabase-Schnittstelle, ohne Fremdbibliothek.
(function (global) {
  'use strict';
  const BASIS = 'https://hyyltzfruinncpfbskde.supabase.co';
  const SCHLUESSEL = 'sb_publishable_s68u8-Lo-4Qh9kLTo9RQcw_ogOFRsaB'; // öffentlich; die Zugriffsregeln schützen die Daten
  const SPEICHER = 'rechentrainer-sitzung';
  const FELDER = 'zeitlimit_ms,aufgaben_pro_runde,neue_pro_tag';

  let sitzung = null;
  try { sitzung = JSON.parse(localStorage.getItem(SPEICHER)); } catch { /* dann nicht angemeldet */ }

  function merke(neu) {
    sitzung = neu;
    try {
      if (neu) localStorage.setItem(SPEICHER, JSON.stringify(neu));
      else localStorage.removeItem(SPEICHER);
    } catch { /* gilt dann nur bis zum Neuladen */ }
  }

  // Liefert null bei abgelehnter Anmeldung; wirft nur, wenn das Netz fehlt.
  async function token(art, daten) {
    const a = await fetch(`${BASIS}/auth/v1/token?grant_type=${art}`, {
      method: 'POST',
      headers: { apikey: SCHLUESSEL, 'Content-Type': 'application/json' },
      body: JSON.stringify(daten),
    });
    if (a.status >= 500) throw new Error('Dienst nicht erreichbar');
    if (!a.ok) return null;
    const d = await a.json();
    return { zugang: d.access_token, erneuern: d.refresh_token, bis: Date.now() + d.expires_in * 1000, nutzer: d.user.id };
  }

  async function zugang() {
    if (!sitzung) throw new Error('nicht angemeldet');
    if (Date.now() < sitzung.bis - 60000) return sitzung.zugang;
    const neu = await token('refresh_token', { refresh_token: sitzung.erneuern });
    merke(neu);
    if (!neu) throw new Error('Anmeldung abgelaufen');
    return neu.zugang;
  }

  async function rest(pfad, { methode = 'GET', daten, prefer } = {}) {
    const kopf = { apikey: SCHLUESSEL, Authorization: `Bearer ${await zugang()}`, 'Content-Type': 'application/json' };
    if (prefer) kopf.Prefer = prefer;
    const a = await fetch(`${BASIS}/rest/v1/${pfad}`, { method: methode, headers: kopf, body: daten && JSON.stringify(daten) });
    if (!a.ok) throw new Error(`Datenbank antwortet ${a.status}`);
    return methode === 'GET' ? a.json() : null;
  }

  const Netz = {
    angemeldet: () => Boolean(sitzung),
    nutzer: () => sitzung && sitzung.nutzer,
    abmelden: () => merke(null),
    async anmelden(email, password) {
      const neu = await token('password', { email, password });
      if (neu) merke(neu);
      return Boolean(neu);
    },
    sendeVersuche: (liste) => rest('versuche?on_conflict=id', {
      methode: 'POST', daten: liste, prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    async holeStaende() {
      const zeilen = await rest('karten_stand?select=karte,stufe,faellig_am');
      return Object.fromEntries(zeilen.map((z) => [z.karte, { stufe: z.stufe, faellig: z.faellig_am }]));
    },
    async holeEinstellung() {
      const [zeile] = await rest(`einstellungen?select=${FELDER}`);
      return zeile || null;
    },
    speichereEinstellung: (werte) => rest('einstellungen?on_conflict=user_id', {
      methode: 'POST', daten: { ...werte, aktualisiert_am: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    holeVersuche: (seit) => rest(
      `versuche?select=sitzung,karte,ergebnis,ms,beantwortet_am&beantwortet_am=gte.${encodeURIComponent(seit)}&order=beantwortet_am.desc`,
    ),
  };
  global.Netz = Netz;
})(this);
