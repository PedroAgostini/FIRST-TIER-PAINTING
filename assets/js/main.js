(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* Header state */
  const header = $('[data-header]');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Smooth anchor scrolling (kept out of CSS so ScrollTrigger measures correctly) */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 ? document.querySelector(id) : null;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    history.pushState(null, '', id);
  });

  /* Mobile menu */
  const menuBtn = $('[data-menu-btn]');
  const menu = $('[data-menu]');
  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('.sr').textContent = open ? 'Close menu' : 'Open menu';
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  /* Estimate wizard */
  const wizard = $('[data-wizard]');
  const steps = $$('[data-step]', wizard);
  const progress = $$('.wizard-progress li', wizard);
  const count = $('[data-count]', wizard);
  const btnBack = $('[data-back]', wizard);
  const btnNext = $('[data-next]', wizard);
  const btnSubmit = $('[data-submit]', wizard);
  const done = $('[data-done]', wizard);
  let current = 1;

  const showErr = (key, on) => { const el = $(`[data-err="${key}"]`, wizard); if (el) el.hidden = !on; };

  const goTo = (n, focus = true) => {
    current = n;
    steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    progress.forEach((li, i) => {
      li.classList.toggle('is-on', i + 1 === n);
      li.classList.toggle('is-done', i + 1 < n);
    });
    count.textContent = `Step ${n} of 3`;
    btnBack.hidden = n === 1;
    btnNext.hidden = n === 3;
    btnSubmit.hidden = n !== 3;
    if (focus) {
      const first = $(`[data-step="${n}"] input, [data-step="${n}"] textarea`, wizard);
      if (first) first.focus({ preventScroll: true });
    }
  };

  const valid = (n) => {
    if (n === 1) {
      const ok = $$('input[name="services"]:checked', wizard).length > 0;
      showErr(1, !ok);
      return ok;
    }
    if (n === 2) {
      const zip = wizard.elements.zip;
      const ok = /^\d{5}$/.test(zip.value.trim());
      zip.setAttribute('aria-invalid', String(!ok));
      showErr(2, !ok);
      return ok;
    }
    if (n === 3) {
      const name = wizard.elements.name;
      const phone = wizard.elements.phone;
      const okName = name.value.trim().length > 1;
      const okPhone = phone.value.replace(/\D/g, '').length >= 10;
      name.setAttribute('aria-invalid', String(!okName));
      phone.setAttribute('aria-invalid', String(!okPhone));
      showErr(3, !(okName && okPhone));
      return okName && okPhone;
    }
    return true;
  };

  btnNext.addEventListener('click', () => { if (valid(current)) goTo(current + 1); });
  btnBack.addEventListener('click', () => goTo(current - 1));
  wizard.addEventListener('change', (e) => { if (e.target.name === 'services') showErr(1, false); });
  wizard.elements.zip.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
  // Enter moves forward instead of submitting early
  wizard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && current < 3) { e.preventDefault(); btnNext.click(); }
  });

  wizard.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (current !== 3 || !valid(3)) return;
    showErr('send', false);
    showErr('spam', false);
    showErr('repeat', false);

    // Antispam: bots get a fake success and nothing is sent
    const spam = window.FTAntispam ? window.FTAntispam.check(wizard) : '';
    if (spam === 'bot') {
      wizard.classList.add('is-sent');
      done.hidden = false;
      return;
    }
    if (spam === 'links') { showErr('spam', true); return; }
    if (spam === 'repeat') { showErr('repeat', true); return; }

    const data = new FormData(wizard);
    const services = data.getAll('services').join(', ');
    const payload = {
      services,
      zip: data.get('zip'),
      timeline: data.get('timeline'),
      details: data.get('details'),
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email'),
      contact_preference: data.get('contact_pref'),
      _gotcha: data.get('_gotcha'),
      _subject: `New estimate request: ${services} (${data.get('zip')})`
    };
    const endpoint = wizard.dataset.endpoint;
    const label = btnSubmit.childNodes[0];
    btnSubmit.disabled = true;
    label.textContent = 'Sending ';
    try {
      if (endpoint.includes('YOUR_FORM_ID')) {
        console.warn('[First Tier] Formspree ID not set. Request not sent:', payload);
      } else {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      if (window.FTAntispam) window.FTAntispam.markSent();
      wizard.classList.add('is-sent');
      done.hidden = false;
      done.focus();
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead');
      if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead');
    } catch (err) {
      showErr('send', true);
    } finally {
      btnSubmit.disabled = false;
      label.textContent = 'Send My Request ';
    }
  });

  const checkService = (value) => {
    $$('input[name="services"]', wizard).forEach((box) => { if (box.value === value) box.checked = true; });
    showErr(1, false);
  };

  /* Hero starter feeds the wizard */
  const starter = $('[data-starter]');
  starter.elements.zip.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
  starter.addEventListener('submit', (e) => {
    e.preventDefault();
    const service = new FormData(starter).get('s');
    const zip = starter.elements.zip.value.trim();
    checkService(service);
    if (/^\d{5}$/.test(zip)) wizard.elements.zip.value = zip;
    goTo(2, false);
    $('#estimate').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    setTimeout(() => goTo(2), reduce ? 0 : 800);
  });

  /* Service chips preselect their service */
  $$('[data-service]').forEach((chip) => {
    chip.addEventListener('click', () => { checkService(chip.dataset.service); goTo(1, false); });
  });

  goTo(1, false);

  /* Gallery lightbox */
  const lightbox = $('[data-lightbox]');
  const lbImg = $('[data-lightbox-img]');
  const shots = $$('.work-grid figure');
  let shot = 0;
  const showShot = (i) => {
    shot = (i + shots.length) % shots.length;
    const img = shots[shot].querySelector('img');
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
  };
  shots.forEach((fig, i) => {
    const img = fig.querySelector('img');
    fig.tabIndex = 0;
    fig.setAttribute('role', 'button');
    fig.setAttribute('aria-label', `View photo: ${img.alt}`);
    const open = () => { showShot(i); lightbox.showModal(); };
    fig.addEventListener('click', open);
    fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  $('[data-lb-close]').addEventListener('click', () => lightbox.close());
  $('[data-lb-prev]').addEventListener('click', () => showShot(shot - 1));
  $('[data-lb-next]').addEventListener('click', () => showShot(shot + 1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showShot(shot - 1);
    if (e.key === 'ArrowRight') showShot(shot + 1);
  });
  lightbox.addEventListener('close', () => shots[shot].focus({ preventScroll: true }));

  /* Motion */
  if (!window.gsap || reduce) return;
  const { gsap } = window;
  const ST = window.ScrollTrigger;
  if (ST) gsap.registerPlugin(ST);

  // Hero photo settles in, copy rises over it
  gsap.fromTo('.hero-bg', { scale: 1.12 }, { scale: 1, duration: 2.4, ease: 'expo.out' });
  gsap.from('.hero-copy > *', { y: 22, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.08, delay: 0.1 });
  gsap.from('.start .starter', { y: 30, autoAlpha: 0, duration: 1.1, ease: 'expo.out', delay: 0.35 });

  if (!ST) return;

  // Light parallax on the hero photo while scrolling away
  gsap.to('.hero-bg', {
    yPercent: 12,
    ease: 'none',
    immediateRender: false,
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
  });

  // Portfolio photos roll on like a fresh coat
  gsap.set('.work-grid figure', { clipPath: 'inset(0 100% 0 0)' });
  ST.batch('.work-grid figure', {
    start: 'top 92%',
    once: true,
    onEnter: (els) => gsap.to(els, { clipPath: 'inset(0 0% 0 0)', duration: 1.2, ease: 'expo.out', stagger: 0.08 })
  });
  gsap.set('.service-grid > li, .review, .why-strip li', { y: 36, autoAlpha: 0 });
  ST.batch('.service-grid > li, .review, .why-strip li', {
    start: 'top 94%',
    once: true,
    onEnter: (els) => gsap.to(els, { y: 0, autoAlpha: 1, duration: 1, ease: 'expo.out', stagger: 0.07 })
  });

  // How it works: a brush paints each step as you scroll
  const stepsWrap = $('[data-steps]');
  const brush = $('[data-brush]');
  const bristle = $('[data-bristle]', brush);
  const stepItems = $$('.steps li', stepsWrap);
  const stepColors = stepItems.map((li) => li.style.getPropertyValue('--bg').trim());
  const mm = gsap.matchMedia();
  // Bristle profile: a fixed ragged edge so the paint front looks dragged, not cut
  const SAMPLES = 26;
  const bristles = stepItems.map((_, k) => Array.from({ length: SAMPLES + 1 }, (__, i) => {
    const t = i / SAMPLES;
    return 0.5 + 0.3 * Math.sin(t * 19 + k * 2.1) + 0.2 * Math.sin(t * 47 + k * 5.3);
  }));
  // p: 0..1 coverage of one step. The edge trails up to `drag` px behind the brush.
  const strokeClip = (p, k, horizontal) => {
    if (p <= 0) return horizontal ? 'polygon(0 0, 0 0, 0 100%, 0 100%)' : 'polygon(0 0, 100% 0, 100% 0, 0 0)';
    if (p >= 1) return 'polygon(-40px -40px, calc(100% + 40px) -40px, calc(100% + 40px) calc(100% + 40px), -40px calc(100% + 40px))';
    const drag = 34;
    const pts = bristles[k].map((b, i) => {
      const along = (i / SAMPLES) * 100;
      const front = `calc(${(p * 100).toFixed(2)}% + ${(drag * 0.4 - b * drag).toFixed(1)}px)`;
      return horizontal ? `${front} ${along}%` : `${along}% ${front}`;
    });
    return horizontal
      ? `polygon(0 0, ${pts.join(', ')}, 0 100%)`
      : `polygon(0 0, 100% 0, ${pts.reverse().join(', ')})`;
  };
  const paint = (horizontal) => {
    stepsWrap.classList.add('is-painting');
    const n = stepItems.length;
    const state = { p: 0 };
    if (!horizontal) gsap.set(brush, { left: '80%', top: 0 });
    const render = () => {
      stepItems.forEach((li, k) => { li.style.clipPath = strokeClip(state.p - k, k, horizontal); });
      const i = Math.min(n - 1, Math.floor(state.p));
      bristle.setAttribute('fill', stepColors[i] === '#EAF0F8' ? '#C9D7EC' : stepColors[i]);
      const along = state.p / n;
      if (horizontal) gsap.set(brush, { x: along * stepsWrap.offsetWidth, y: Math.sin(state.p * Math.PI * 2) * 14 });
      else gsap.set(brush, { y: along * stepsWrap.offsetHeight, x: Math.sin(state.p * Math.PI * 2) * 10 });
      gsap.set(brush, { autoAlpha: state.p > 0.02 && state.p < n - 0.02 ? 1 : 0 });
    };
    render();
    gsap.to(state, {
      p: n,
      ease: 'none',
      onUpdate: render,
      scrollTrigger: {
        trigger: stepsWrap,
        start: 'top 92%',
        end: 'center 62%', // fully painted just before the strip reaches the middle of the screen
        scrub: 0.25,
        invalidateOnRefresh: true
      }
    });
    return () => { stepsWrap.classList.remove('is-painting'); gsap.set([brush, ...stepItems], { clearProps: 'all' }); };
  };
  mm.add('(min-width: 641px)', () => paint(true));
  mm.add('(max-width: 640px)', () => paint(false));
  gsap.from('.about-photo', {
    rotation: -8, y: 40, autoAlpha: 0, duration: 1.3, ease: 'expo.out',
    scrollTrigger: { trigger: '.about', start: 'top 78%', once: true }
  });
})();
