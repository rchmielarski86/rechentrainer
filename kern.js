// Reine Logik ohne Oberfläche: Karten, Rechenwege, Wiedervorlage, Rundenablauf.
(function (global) {
  'use strict';
  const ZAHLEN = [2, 3, 4, 5, 6, 7, 8, 9];
  const ABSTAENDE = [1, 2, 4, 8, 16, 32];
  const MAX_VERSUCHE = 3;
  const MIN_ABSTAND = 2;
  const STUFE_BEI_BEKANNT = 3;
  const STUFE_FUER_UMKEHR = 2;
  const STUFE_SICHER = 4;

  function rangPlus(a, b) {
    if (a === b) return 0;
    if (a + b === 10) return 1;
    if (b - a === 1) return 2;
    return b === 9 ? 3 : 4;
  }

  function rangMal(a, b) {
    if (a === 2) return 0.2;
    if (a === 5 || b === 5) return 1.2;
    if (a === b) return 2.2;
    if (b === 9) return 3.2;
    return a <= 4 ? 3.6 : 4.2;
  }

  function baueKarten() {
    const karten = [];
    const umkehr = (art, zeichen, ganzes, teil, ergebnis, basis, rang) => {
      karten.push({ id: `${zeichen}_${ganzes}_${teil}`, art, x: ganzes, y: teil, loesung: ergebnis, basis, rang: rang + 0.5 });
    };
    for (const a of ZAHLEN) {
      for (const b of ZAHLEN.filter((z) => z >= a)) {
        const p = `p_${a}_${b}`, x = `x_${a}_${b}`, rp = rangPlus(a, b), rx = rangMal(a, b);
        karten.push({ id: p, art: 'plus', x: a, y: b, loesung: a + b, rang: rp });
        karten.push({ id: x, art: 'mal', x: a, y: b, loesung: a * b, rang: rx });
        for (const [teil, rest] of a === b ? [[a, b]] : [[a, b], [b, a]]) {
          umkehr('minus', 'm', a + b, teil, rest, p, rp);
          umkehr('durch', 'd', a * b, teil, rest, x, rx);
        }
      }
    }
    return karten.sort((k, l) => k.rang - l.rang || k.x - l.x || k.y - l.y);
  }

  const KARTEN = baueKarten();
  const PRO_ID = new Map(KARTEN.map((k) => [k.id, k]));

  const FORM = {
    plus: { zeichen: '+', wort: 'plus' },
    mal: { zeichen: '·', wort: 'mal' },
    minus: { zeichen: '−', wort: 'minus' },
    durch: { zeichen: ':', wort: 'geteilt durch' },
  };

  function aufgabe(karte, zufall) {
    const tauschbar = karte.art === 'plus' || karte.art === 'mal';
    const [x, y] = tauschbar && zufall() < 0.5 ? [karte.y, karte.x] : [karte.x, karte.y];
    const f = FORM[karte.art];
    return {
      x, y, loesung: karte.loesung, zeichen: f.zeichen,
      zeige: `${x} ${f.zeichen} ${y}`,
      sprich: `${x} ${f.wort} ${y}`,
      korrektur: `${x} ${f.wort} ${y} ist ${karte.loesung}`,
    };
  }

  const ueber = (mitte, ergebnis) => `${mitte} = ${ergebnis}`;

  function wegPlus(x, y) {
    const g = Math.max(x, y), k = Math.min(x, y), s = x + y;
    if (x === y) return `Das Doppelte von ${x}`;
    if (s === 10) return 'Zehnerfreunde';
    if (g - k === 1) return ueber(`${k} + ${k} + 1`, s);
    if (g - k === 2) return ueber(`${k + 1} + ${k + 1}`, s);
    if (g === 9) return ueber(`10 + ${k} − 1`, s);
    if (s > 10) return ueber(`${g} + ${10 - g} + ${s - 10}`, s);
    if (g > 5) return ueber(`5 + ${g - 5} + ${k}`, s);
    return `Eine Hand und noch ${k} Finger`;
  }

  function wegMal(x, y) {
    const g = Math.max(x, y), k = Math.min(x, y), p = x * y;
    if (k === 2) return ueber(`${g} + ${g}`, p);
    if (g === 9) return ueber(`10 · ${k} − ${k}`, p);
    if (g === 5 || k === 5) return ueber(`10 · ${g === 5 ? k : g} : 2`, p);
    const teile = { 3: `2 · ${g} + ${g}`, 4: `2 · ${g} + 2 · ${g}`, 6: `5 · ${g} + ${g}`, 7: `5 · ${g} + 2 · ${g}`, 8: `4 · ${g} + 4 · ${g}` };
    return ueber(teile[k], p);
  }

  function rechenweg(karte, a) {
    if (karte.art === 'plus') return wegPlus(a.x, a.y);
    if (karte.art === 'mal') return wegMal(a.x, a.y);
    const z = karte.art === 'minus' ? '+' : '·';
    return `denn ${a.y} ${z} ${a.loesung} = ${a.x}`;
  }

  // antwort null: Die Zeit lief ab. Das zählt wie falsch, bleibt für den Bericht aber unterscheidbar.
  function bewerte(antwort, loesung) {
    if (antwort === null) return 'langsam';
    return antwort === loesung ? 'schnell' : 'falsch';
  }

  function addiereTage(iso, tage) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + tage);
    return d.toISOString().slice(0, 10);
  }

  function heute(d = new Date()) {
    const zwei = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
  }

  function naechsterStand(stand, ergebnis, datum) {
    const alt = stand ? stand.stufe : 0;
    let stufe = 1;
    if (ergebnis === 'schnell') stufe = alt === 0 ? STUFE_BEI_BEKANNT : Math.min(alt + 1, ABSTAENDE.length);
    return { stufe, faellig: addiereTage(datum, ABSTAENDE[stufe - 1]) };
  }

  const faelligeKarten = (staende, datum) => KARTEN
    .filter((k) => staende[k.id] && staende[k.id].faellig <= datum)
    .sort((k, l) => staende[k.id].faellig.localeCompare(staende[l.id].faellig) || staende[k.id].stufe - staende[l.id].stufe);

  const naechsteNeue = (staende) => KARTEN.find((k) => !staende[k.id]
    && (!k.basis || (staende[k.basis] && staende[k.basis].stufe >= STUFE_FUER_UMKEHR)));

  function mischen(liste, zufall) {
    const l = [...liste];
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(zufall() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  }

  function starteRunde(staende, einstellung, datum, neuVerbraucht, zufall) {
    const max = einstellung.aufgaben_pro_runde;
    const faellig = mischen(faelligeKarten(staende, datum).slice(0, max), zufall);
    return {
      max, gestellt: 0,
      neuRest: Math.max(0, einstellung.neue_pro_tag - neuVerbraucht),
      plan: faellig.map((karte) => ({ karte, versuch: 1, ab: 0 })),
    };
  }

  function naechste(runde, staende) {
    if (runde.gestellt >= runde.max) return null;
    const wieder = runde.plan.findIndex((e) => e.versuch > 1 && e.ab <= runde.gestellt);
    const bereit = wieder >= 0 ? wieder : runde.plan.findIndex((e) => e.ab <= runde.gestellt);
    const neu = runde.neuRest > 0 ? naechsteNeue(staende) : null;
    let eintrag = null;
    if (bereit >= 0) [eintrag] = runde.plan.splice(bereit, 1);
    else if (neu) eintrag = { karte: neu, versuch: 1, ab: 0 };
    else if (runde.plan.length) eintrag = runde.plan.shift();
    if (eintrag) runde.gestellt += 1;
    return eintrag;
  }

  // Bekannte neue Karten kosten kein Tagesbudget: So zeigt sich rasch, was schon sitzt.
  function verbuche(runde, eintrag, ergebnis, warNeu) {
    if (warNeu && ergebnis !== 'schnell') runde.neuRest -= 1;
    if (ergebnis !== 'schnell' && eintrag.versuch < MAX_VERSUCHE) {
      runde.plan.push({ karte: eintrag.karte, versuch: eintrag.versuch + 1, ab: runde.gestellt + MIN_ABSTAND });
    }
  }

  const erwartet = (runde) => Math.min(runde.max, runde.gestellt + runde.plan.length + Math.max(0, runde.neuRest));

  const istMehrDa = (staende, datum, neuVerbraucht, einstellung) => faelligeKarten(staende, datum).length > 0
    || (neuVerbraucht < einstellung.neue_pro_tag && Boolean(naechsteNeue(staende)));

  const median = (w) => {
    if (!w.length) return null;
    const s = [...w].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  };

  // Zählt nur den ersten Versuch je Karte und Runde: Die Wiederholung kurz nach der Lösung sagt nichts über das Können.
  function auswertung(versuche, staende, datum) {
    const gesehen = new Set();
    const zeilen = [...versuche].sort((a, b) => a.beantwortet_am.localeCompare(b.beantwortet_am)).map((v) => {
      const schluessel = `${v.sitzung}|${v.karte}`;
      const erster = !gesehen.has(schluessel);
      gesehen.add(schluessel);
      return { ...v, erster, tag: heute(new Date(v.beantwortet_am)) };
    });
    const woche = (i) => {
      const bis = addiereTage(datum, -7 * i), von = addiereTage(bis, -6);
      const teil = zeilen.filter((v) => v.tag >= von && v.tag <= bis);
      const erste = teil.filter((v) => v.erster);
      const gewusst = erste.filter((v) => v.ergebnis === 'schnell');
      return {
        von, bis, tage: new Set(teil.map((v) => v.tag)).size, aufgaben: teil.length,
        quote: erste.length ? gewusst.length / erste.length : null, medianMs: median(gewusst.map((v) => v.ms)),
      };
    };
    const karten = ['plus', 'minus', 'mal', 'durch'].map((art) => {
      const liste = KARTEN.filter((k) => k.art === art);
      const mitStand = liste.filter((k) => staende[k.id]);
      return { art, gesamt: liste.length, gesehen: mitStand.length, sicher: mitStand.filter((k) => staende[k.id].stufe >= STUFE_SICHER).length };
    });
    const grenze = addiereTage(datum, -13);
    const fehler = new Map();
    zeilen.filter((v) => v.erster && v.tag >= grenze && v.ergebnis !== 'schnell')
      .forEach((v) => fehler.set(v.karte, (fehler.get(v.karte) || 0) + 1));
    const wackel = [...fehler].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([id, anzahl]) => ({ text: aufgabe(PRO_ID.get(id), () => 1).zeige, anzahl }));
    const verlauf = [0, 1, 2, 3].map(woche);
    const jetzt = verlauf[0];
    return { woche: jetzt, verlauf, karten, wackel, zuKnapp: jetzt.tage >= 5 && jetzt.quote !== null && jetzt.quote < 0.5 };
  }

  const Kern = {
    ZAHLEN, KARTEN, PRO_ID, aufgabe, rechenweg, bewerte, addiereTage, heute, naechsterStand,
    faelligeKarten, naechsteNeue, starteRunde, naechste, verbuche, erwartet, istMehrDa, auswertung,
  };
  if (typeof module !== 'undefined') module.exports = Kern;
  else global.Kern = Kern;
})(this);
