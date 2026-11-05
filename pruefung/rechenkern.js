// Prüft Karten, Rechenwege, Wiedervorlage und Rundenablauf. Aufruf: node pruefung/rechenkern.js
const assert = require('assert');
const K = require('../kern.js');

const EIN = { zeitlimit_ms: 5000, aufgaben_pro_runde: 20, neue_pro_tag: 4 };
const TAG = '2026-11-06';
let seed = 1;
const zufall = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const anzahl = (art) => K.KARTEN.filter((k) => k.art === art).length;
const rechne = (t) => Function(`return ${t.replace(/·/g, '*').replace(/:/g, '/').replace(/−/g, '-')}`)();

const pruefungen = {
  'Kartensatz': () => {
    assert.deepStrictEqual([anzahl('plus'), anzahl('mal'), anzahl('minus'), anzahl('durch')], [36, 36, 64, 64]);
    assert.strictEqual(new Set(K.KARTEN.map((k) => k.id)).size, 200);
    for (const k of K.KARTEN) {
      assert.match(k.id, /^[pmxd]_[0-9]{1,2}_[0-9]{1,2}$/);
      assert.ok(K.aufgabe(k, zufall).zeige.length <= 12);
      if (k.basis) assert.ok(K.PRO_ID.has(k.basis), k.id);
    }
  },
  'Ergebnisse und Rechenwege stimmen in beiden Reihenfolgen': () => {
    for (const k of K.KARTEN) {
      for (const z of [() => 0, () => 0.9]) {
        const a = K.aufgabe(k, z), w = K.rechenweg(k, a);
        assert.strictEqual(rechne(a.zeige), k.loesung, a.zeige);
        assert.ok(a.korrektur.endsWith(`ist ${k.loesung}`));
        const gleichungen = w.weg.split(/, denn |, /).filter((t) => t.includes('='));
        for (const g of gleichungen) {
          const seiten = g.split('=').map((t) => rechne(t));
          seiten.forEach((s) => assert.strictEqual(s, seiten[0], g));
        }
        assert.ok(w.weg.includes(String(k.loesung)), w.weg);
        if (w.hilfe.includes('=') && !w.hilfe.includes('?')) assert.strictEqual(rechne(w.hilfe.split('=')[1]), k.loesung, w.hilfe);
        assert.ok(!new RegExp(`= ${k.loesung}$`).test(w.hilfe), `Hilfe verrät Lösung: ${w.hilfe}`);
      }
    }
  },
  'Bewertung': () => {
    const b = (o) => K.bewerte({ antwort: 15, loesung: 15, ms: 1000, limit: 5000, hilfe: false, ...o });
    assert.strictEqual(b({}), 'schnell');
    assert.strictEqual(b({ ms: 5000 }), 'schnell');
    assert.strictEqual(b({ ms: 5001 }), 'langsam');
    assert.strictEqual(b({ antwort: 14 }), 'falsch');
    assert.strictEqual(b({ hilfe: true }), 'falsch');
  },
  'Zeitgrenze wird mit der Stufe strenger': () => {
    assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map((s) => K.zeitlimit(s, 5000)), [5000, 12000, 10000, 8000, 6000, 5000, 5000]);
  },
  'Wiedervorlage nach Stufen': () => {
    let s = K.naechsterStand(null, 'langsam', TAG);
    assert.deepStrictEqual(s, { stufe: 1, faellig: '2026-11-07' });
    assert.deepStrictEqual(K.naechsterStand(null, 'schnell', TAG), { stufe: 3, faellig: '2026-11-10' });
    const erwartet = [[2, 2], [3, 4], [4, 8], [5, 16], [6, 32], [6, 32]];
    for (const [stufe, tage] of erwartet) {
      s = K.naechsterStand(s, 'schnell', TAG);
      assert.deepStrictEqual(s, { stufe, faellig: K.addiereTage(TAG, tage) });
    }
    assert.strictEqual(K.naechsterStand({ stufe: 4, faellig: TAG }, 'langsam', TAG).stufe, 4);
    assert.deepStrictEqual(K.naechsterStand({ stufe: 6, faellig: TAG }, 'falsch', TAG), { stufe: 1, faellig: '2026-11-07' });
    assert.strictEqual(K.addiereTage('2026-03-28', 2), '2026-03-30');
  },
  'Umkehraufgaben erst nach sicherer Grundaufgabe': () => {
    const st = {};
    for (const k of K.KARTEN.filter((x) => !x.basis)) st[k.id] = { stufe: 1, faellig: TAG };
    assert.strictEqual(K.naechsteNeue(st), undefined);
    st.p_7_8.stufe = 2;
    assert.strictEqual(K.naechsteNeue(st).basis, 'p_7_8');
  },
  'Falsche Aufgabe höchstens dreimal, mit Abstand': () => {
    const st = {};
    const r = K.starteRunde(st, EIN, TAG, 0, zufall);
    const zuerst = K.naechste(r, st);
    st[zuerst.karte.id] = K.naechsterStand(null, 'falsch', TAG);
    K.verbuche(r, zuerst, 'falsch', true);
    const folge = [zuerst];
    for (let e = K.naechste(r, st); e; e = K.naechste(r, st)) {
      folge.push(e);
      const neu = !st[e.karte.id];
      const erg = e.karte.id === zuerst.karte.id ? 'falsch' : 'schnell';
      if (e.versuch === 1) st[e.karte.id] = K.naechsterStand(st[e.karte.id], erg, TAG);
      K.verbuche(r, e, erg, neu);
    }
    const stellen = folge.flatMap((e, i) => (e.karte.id === zuerst.karte.id ? [i] : []));
    assert.strictEqual(stellen.length, 3);
    assert.ok(stellen[1] - stellen[0] >= 3 && stellen[2] - stellen[1] >= 3, String(stellen));
    assert.strictEqual(folge.length, 20);
  },
  'Bekanntes kostet kein Tagesbudget, Unbekanntes schon': () => {
    const lauf = (erg) => {
      const st = {};
      const r = K.starteRunde(st, EIN, TAG, 0, zufall);
      let n = 0;
      for (let e = K.naechste(r, st); e; e = K.naechste(r, st)) {
        n += 1;
        const neu = !st[e.karte.id];
        if (e.versuch === 1) st[e.karte.id] = K.naechsterStand(st[e.karte.id], erg, TAG);
        K.verbuche(r, e, erg, neu);
      }
      return { n, gesehen: Object.keys(st).length };
    };
    assert.deepStrictEqual(lauf('schnell'), { n: 20, gesehen: 20 });
    assert.deepStrictEqual(lauf('langsam'), { n: 4, gesehen: 4 });
  },
  'Verpasste Tage stapeln sich nicht': () => {
    const st = {};
    for (const k of K.KARTEN) st[k.id] = { stufe: 2, faellig: '2026-10-01' };
    const r = K.starteRunde(st, EIN, TAG, 0, zufall);
    assert.strictEqual(r.plan.length, 20);
  },
  'Tagespensum nach 120 simulierten Tagen': () => {
    const st = {};
    let datum = TAG, spitze = 0;
    for (let tag = 0; tag < 120; tag++) {
      let neu = 0;
      const r = K.starteRunde(st, EIN, datum, 0, zufall);
      let n = 0;
      for (let e = K.naechste(r, st); e; e = K.naechste(r, st)) {
        n += 1;
        const warNeu = !st[e.karte.id];
        const wurf = zufall();
        const erg = wurf < 0.7 ? 'schnell' : wurf < 0.9 ? 'langsam' : 'falsch';
        if (e.versuch === 1) st[e.karte.id] = K.naechsterStand(st[e.karte.id], erg, datum);
        K.verbuche(r, e, erg, warNeu);
        if (warNeu && erg !== 'schnell') neu += 1;
      }
      assert.ok(n <= 20 && neu <= 4, `Tag ${tag}: ${n} Aufgaben, ${neu} neu`);
      spitze = Math.max(spitze, n);
      datum = K.addiereTage(datum, 1);
    }
    const sicher = Object.values(st).filter((s) => s.stufe >= 4).length;
    console.log(`  nach 120 Tagen: ${Object.keys(st).length} gesehen, ${sicher} auf Stufe 4 oder höher, Spitze ${spitze} Aufgaben`);
    assert.strictEqual(Object.keys(st).length, 200);
  },
};

let fehler = 0;
for (const [name, fn] of Object.entries(pruefungen)) {
  try { fn(); console.log(`ok  ${name}`); } catch (e) { fehler += 1; console.log(`FEHLER  ${name}: ${e.message}`); }
}
process.exit(fehler ? 1 : 0);
