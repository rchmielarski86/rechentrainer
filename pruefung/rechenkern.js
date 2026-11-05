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
        const a = K.aufgabe(k, z), weg = K.rechenweg(k, a);
        assert.strictEqual(rechne(a.zeige), k.loesung, a.zeige);
        assert.ok(a.korrektur.endsWith(`ist ${k.loesung}`));
        if (!weg.includes('=')) continue;
        const seiten = weg.replace('denn ', '').split('=').map((t) => rechne(t));
        assert.strictEqual(seiten[0], seiten[1], weg);
        assert.strictEqual(seiten[1], k.basis ? k.x : k.loesung, weg);
      }
    }
  },
  'Bewertung': () => {
    assert.strictEqual(K.bewerte(15, 15), 'schnell');
    assert.strictEqual(K.bewerte(14, 15), 'falsch');
    assert.strictEqual(K.bewerte(null, 15), 'langsam');
  },
  'Wiedervorlage nach Stufen': () => {
    let s = K.naechsterStand(null, 'falsch', TAG);
    assert.deepStrictEqual(s, { stufe: 1, faellig: '2026-11-07' });
    assert.deepStrictEqual(K.naechsterStand(null, 'langsam', TAG), s);
    assert.deepStrictEqual(K.naechsterStand(null, 'schnell', TAG), { stufe: 3, faellig: '2026-11-10' });
    const erwartet = [[2, 2], [3, 4], [4, 8], [5, 16], [6, 32], [6, 32]];
    for (const [stufe, tage] of erwartet) {
      s = K.naechsterStand(s, 'schnell', TAG);
      assert.deepStrictEqual(s, { stufe, faellig: K.addiereTage(TAG, tage) });
    }
    assert.strictEqual(K.naechsterStand({ stufe: 4, faellig: TAG }, 'langsam', TAG).stufe, 1);
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
  'Nicht gewusste Aufgabe kommt nach zwei anderen wieder, höchstens dreimal': () => {
    for (const erg of ['falsch', 'langsam']) {
      for (const faellige of [0, 25]) {
        const st = {};
        K.KARTEN.slice(0, faellige).forEach((k) => { st[k.id] = { stufe: 2, faellig: TAG }; });
        const r = K.starteRunde(st, EIN, TAG, 0, zufall);
        const zuerst = K.naechste(r, st);
        st[zuerst.karte.id] = K.naechsterStand(st[zuerst.karte.id], erg, TAG);
        K.verbuche(r, zuerst, erg, faellige === 0);
        const folge = [zuerst];
        for (let e = K.naechste(r, st); e; e = K.naechste(r, st)) {
          folge.push(e);
          const neu = !st[e.karte.id];
          const x = e.karte.id === zuerst.karte.id ? erg : 'schnell';
          if (e.versuch === 1) st[e.karte.id] = K.naechsterStand(st[e.karte.id], x, TAG);
          K.verbuche(r, e, x, neu);
        }
        const stellen = folge.flatMap((e, i) => (e.karte.id === zuerst.karte.id ? [i] : []));
        assert.deepStrictEqual(stellen, [0, 3, 6], `${erg}, ${faellige} fällig: ${stellen}`);
        assert.strictEqual(folge.length, 20);
      }
    }
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
    assert.deepStrictEqual(lauf('langsam'), { n: 12, gesehen: 4 });
    assert.deepStrictEqual(lauf('falsch'), { n: 12, gesehen: 4 });
  },
  'Verpasste Tage stapeln sich nicht': () => {
    const st = {};
    for (const k of K.KARTEN) st[k.id] = { stufe: 2, faellig: '2026-10-01' };
    const r = K.starteRunde(st, EIN, TAG, 0, zufall);
    assert.strictEqual(r.plan.length, 20);
  },
  'Extrarunde nimmt die schwächsten Karten und lässt Neues zu': () => {
    const st = { p_2_2: { stufe: 5, faellig: '2026-12-01' }, p_3_3: { stufe: 1, faellig: '2026-11-07' }, p_4_4: { stufe: 2, faellig: '2026-11-08' } };
    const kurz = { ...EIN, aufgaben_pro_runde: 2 };
    const ids = K.starteExtraRunde(st, kurz, zufall).plan.map((e) => e.karte.id).sort();
    assert.deepStrictEqual(ids, ['p_3_3', 'p_4_4']);
    assert.ok(K.starteExtraRunde(st, kurz, zufall).plan.every((e) => e.frei));
    assert.strictEqual(K.starteExtraRunde({}, EIN, zufall).neuRest, 2);
  },
  'Auswertung zählt nur erste Versuche': () => {
    const am = (tag, std) => `${tag}T${std}:00:00+01:00`;
    const v = (sitzung, karte, ergebnis, ms, tag, std) => ({ sitzung, karte, ergebnis, ms, beantwortet_am: am(tag, std) });
    const versuche = [
      v('a', 'p_7_8', 'falsch', 5000, '2026-11-02', '10'), v('a', 'p_7_8', 'schnell', 900, '2026-11-02', '11'),
      v('a', 'x_6_7', 'schnell', 1000, '2026-11-02', '12'), v('b', 'p_7_8', 'langsam', 5000, '2026-11-06', '10'),
      v('b', 'x_6_7', 'schnell', 3000, '2026-11-06', '11'), v('c', 'x_3_4', 'schnell', 500, '2026-10-20', '10'),
      v('d', 'p_7_8', 'schnell', 400, '2026-11-06', '15'),
    ];
    const a = K.auswertung(versuche, { p_7_8: { stufe: 1 }, x_6_7: { stufe: 4 } }, TAG);
    assert.deepStrictEqual([a.woche.tage, a.woche.aufgaben, a.woche.quote, a.woche.medianMs], [2, 6, 0.5, 2000]);
    assert.strictEqual(a.verlauf[2].quote, 1);
    assert.deepStrictEqual(a.karten.find((k) => k.art === 'mal'), { art: 'mal', gesamt: 36, gesehen: 1, sicher: 1 });
    assert.deepStrictEqual(a.wackel, [{ text: '7 + 8', anzahl: 2 }]);
    assert.strictEqual(a.zuKnapp, false);
    const tage = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
    const knapp = K.auswertung(tage.map((t, i) => v(`s${i}`, 'p_7_8', 'langsam', 5000, t, '10')), {}, TAG);
    assert.strictEqual(knapp.zuKnapp, true);
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
        const stufe = st[e.karte.id] ? st[e.karte.id].stufe : 0;
        const erg = zufall() < 0.55 + 0.08 * stufe ? 'schnell' : 'falsch';
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
  },
};

let fehler = 0;
for (const [name, fn] of Object.entries(pruefungen)) {
  try { fn(); console.log(`ok  ${name}`); } catch (e) { fehler += 1; console.log(`FEHLER  ${name}: ${e.message}`); }
}
process.exit(fehler ? 1 : 0);
