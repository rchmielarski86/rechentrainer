// Sprachausgabe nach iOS-Regeln: Ohne Tipp wird speak() still verworfen.
module.exports = () => {
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
