/*
 * First Tier Painting | Form antispam
 * Runs in the browser before the estimate request is sent to Formspree.
 * Layers: honeypot field, minimum time on page, real interaction,
 * link stuffing in text fields, and a short resend cooldown.
 * Formspree's own spam filter still runs on the server side.
 */
window.FTAntispam = (() => {
  const loadedAt = Date.now();
  const MIN_MS = 4000;          // nobody fills three steps in under 4 seconds
  const COOLDOWN_MS = 60000;    // one request per minute per browser
  const KEY = 'ft-last-request';
  const LINKS = /(https?:\/\/|www\.|\[url|<a\s|\.ru\b|\.xyz\b)/i;
  let interacted = false;

  ['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
    window.addEventListener(type, () => { interacted = true; }, { once: true, passive: true });
  });

  const lastSent = () => {
    try { return Number(localStorage.getItem(KEY) || 0); } catch (e) { return 0; }
  };

  return {
    /**
     * Returns '' when the request looks human.
     * 'bot' means drop it silently; 'links' and 'repeat' have a message for the visitor.
     */
    check(form) {
      const data = new FormData(form);
      if (String(data.get('_gotcha') || '').trim()) return 'bot';
      if (Date.now() - loadedAt < MIN_MS) return 'bot';
      if (!interacted) return 'bot';
      const text = `${data.get('name') || ''} ${data.get('details') || ''}`;
      if (LINKS.test(text)) return 'links';
      if (Date.now() - lastSent() < COOLDOWN_MS) return 'repeat';
      return '';
    },
    markSent() {
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* storage blocked: skip */ }
    }
  };
})();
