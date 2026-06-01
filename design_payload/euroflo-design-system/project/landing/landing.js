/* ============================================================================
   Euroflo landing — interactions
   Animated ocean gradient canvas, scroll-driven flow, tabs, scatter→sort,
   magnetic buttons, count-ups, reveal. Exposes window.applyTweaks for the panel.
   ========================================================================== */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- tweak state (palette + motion read by the canvas) ---- */
  var PALETTES = {
    ocean:  ['#024D8B', '#1B6DA4', '#2CA7FF', '#41CDE9'],
    deep:   ['#012B52', '#024D8B', '#1B6DA4', '#2CA7FF'],
    crest:  ['#1B6DA4', '#2CA7FF', '#41CDE9', '#7FE3F5']
  };
  var state = { palette: 'crest', motion: 'showy', sky: 'day' };

  /* ============================================================
     1. ANIMATED OCEAN GRADIENT (Stripe-style flowing mesh)
     Downscaled offscreen blobs, 'screen' blended over navy → silky.
     ============================================================ */
  function Gradient(canvas) {
    var ctx = canvas.getContext('2d');
    var DPR = 1;            // render small; CSS scales up → free blur
    var w = 0, h = 0, t = 0, raf = null;
    var mouse = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4 };
    var blobs = [];

    function hexToRgb(hex) {
      var n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function build() {
      var cols = PALETTES[state.palette] || PALETTES.ocean;
      blobs = cols.map(function (c, i) {
        return {
          rgb: hexToRgb(c),
          a: 0.4 + (i % 2) * 0.12,
          ox: [0.2, 0.82, 0.46, 0.72][i % 4],
          oy: [0.32, 0.26, 0.82, 0.6][i % 4],
          rx: 0.78 + (i % 2) * 0.18,
          sx: 0.6 + i * 0.17,
          sy: 0.5 + i * 0.21,
          ph: i * 1.7
        };
      });
    }
    function resize() {
      var r = canvas.getBoundingClientRect();
      // cap internal resolution for soft, performant gradient
      w = Math.max(200, Math.round(r.width / 5));
      h = Math.max(160, Math.round(r.height / 5));
      canvas.width = w; canvas.height = h;
    }
    function frame() {
      t += state.motion === 'calm' ? 0.0016 : 0.0034;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;

      // deep navy base
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#06223f';
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';
      var pull = state.motion === 'showy' ? 0.12 : 0.06;
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var cx = (b.ox + Math.sin(t * b.sx + b.ph) * 0.16 + (mouse.x - 0.5) * pull) * w;
        var cy = (b.oy + Math.cos(t * b.sy + b.ph) * 0.16 + (mouse.y - 0.5) * pull) * h;
        var rad = (Math.max(w, h)) * (b.rx + Math.sin(t * 0.5 + b.ph) * 0.07);
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        var c = b.rgb;
        g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + b.a + ')');
        g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf) frame(); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    window.addEventListener('resize', function () { resize(); });
    window.addEventListener('mousemove', function (e) {
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = Math.min(1, e.clientY / window.innerHeight);
    });
    // pause when hero scrolled away
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { e.isIntersecting ? start() : stop(); });
    }, { threshold: 0 });

    resize(); build();
    if (reduce) { frame(); stop(); }   // draw one static frame
    else io.observe(canvas);
    return { rebuild: build };
  }

  var grad = null, ocean = null;
  var heroEl = document.querySelector('.hero');
  var heroCanvas = document.getElementById('heroCanvas');
  try {
    if (window.EurofloOcean && heroEl) {
      ocean = window.EurofloOcean.init(heroEl, { palette: state.palette, motion: state.motion, sky: state.sky });
    }
  } catch (e) { ocean = null; }
  if (ocean) {
    document.body.classList.add('ocean-on');
    ocean.setSky(state.sky);
    document.body.classList.toggle('sky-on', state.sky === 'day');
    if (heroCanvas) heroCanvas.style.display = 'none';
  } else {
    try { if (heroCanvas) grad = Gradient(heroCanvas); }
    catch (err) { /* canvas optional — never let it block the page */ }
  }

  /* ============================================================
     2. NAV scroll state
     ============================================================ */
  var nav = document.querySelector('.nav');
  function onScroll() {
    if (nav) nav.classList.toggle('solid', window.scrollY > 40);
    flowScroll();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ============================================================
     3. Hero preview 3D tilt (cursor)
     ============================================================ */
  var pv = document.querySelector('.preview');
  var pvWrap = document.querySelector('.preview-wrap');
  if (pv && pvWrap && !reduce) {
    pvWrap.addEventListener('mousemove', function (e) {
      if (state.motion === 'calm') return;
      var r = pvWrap.getBoundingClientRect();
      var rx = ((e.clientY - r.top) / r.height - 0.5) * -7 + 2;
      var ry = ((e.clientX - r.left) / r.width - 0.5) * 9 - 7;
      pv.style.transform = 'perspective(1600px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
    });
    pvWrap.addEventListener('mouseleave', function () {
      pv.style.transform = 'perspective(1600px) rotateY(-7deg) rotateX(2deg)';
    });
  }

  /* ============================================================
     4. Magnetic buttons
     ============================================================ */
  function magnetize() {
    if (reduce) return;
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var inner = btn.querySelector('.mag') || btn;
      btn.addEventListener('mousemove', function (e) {
        if (state.motion === 'calm') return;
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.35;
        var y = (e.clientY - r.top - r.height / 2) * 0.4;
        btn.style.transform = 'translate(' + x * 0.4 + 'px,' + y * 0.4 + 'px)';
        inner.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = ''; inner.style.transform = '';
      });
    });
  }
  magnetize();

  /* ============================================================
     5. Count-ups + progress bars
     ============================================================ */
  function fmt(v, pre, suf, dec) {
    return pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-CA')) + suf;
  }
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count')),
      pre = el.getAttribute('data-prefix') || '',
      suf = el.getAttribute('data-suffix') || '',
      dec = +(el.getAttribute('data-decimals') || 0), t0 = null, dur = 1400;
    if (reduce) { el.textContent = fmt(target, pre, suf, dec); return; }
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * e, pre, suf, dec);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function animateWithin(node) {
    node.querySelectorAll('[data-count]:not([data-done])').forEach(function (el) {
      el.setAttribute('data-done', '1'); countUp(el);
    });
    node.querySelectorAll('[data-w]:not([data-done])').forEach(function (b) {
      b.setAttribute('data-done', '1');
      if (reduce) b.style.transition = 'none';
      b.style.width = b.getAttribute('data-w') + '%';
    });
  }

  /* ============================================================
     6. Reveal on scroll
     ============================================================ */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      animateWithin(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.16 });
  document.querySelectorAll('.r').forEach(function (el) { io.observe(el); });
  // hero counts/bars kick immediately
  setTimeout(function () { document.querySelectorAll('.hero').forEach(animateWithin); }, 500);
  // arm entrance animations only now that JS is running, then reveal the hero
  document.body.classList.add('anim-on');
  function revealHero() {
    document.querySelectorAll('.hero .anim').forEach(function (el) { el.classList.add('in'); });
  }
  requestAnimationFrame(revealHero);
  setTimeout(revealHero, 60);

  /* ============================================================
     7. Scroll-driven FLOW band
     ============================================================ */
  var flowEl = document.querySelector('.flow');
  var steps = flowEl ? flowEl.querySelectorAll('.fstep') : [];
  var fill = flowEl ? flowEl.querySelector('.fill') : null;
  function flowScroll() {
    if (!flowEl) return;
    var r = flowEl.getBoundingClientRect();
    var vh = window.innerHeight;
    // progress as the band travels through the middle of the viewport
    var p = (vh * 0.78 - r.top) / (r.height + vh * 0.5);
    p = Math.max(0, Math.min(1, p));
    if (fill) fill.style.width = (p * 100) + '%';
    var lit = Math.round(p * steps.length + 0.0001);
    steps.forEach(function (s, i) { s.classList.toggle('on', i < lit); });
  }

  /* ============================================================
     8. Problem card cursor spotlight
     ============================================================ */
  document.querySelectorAll('.pcard').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ============================================================
     9. Tabbed product preview
     ============================================================ */
  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.panel');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.getAttribute('data-tab');
      tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
      panels.forEach(function (p) {
        var show = p.getAttribute('data-panel') === name;
        p.classList.toggle('show', show);
        if (show) animateWithin(p);
      });
      // sync the mini-sidebar active item
      document.querySelectorAll('.sb-item').forEach(function (it) {
        it.classList.toggle('active', it.getAttribute('data-nav') === name);
      });
    });
  });

  /* ============================================================
     10. Scatter → sorted recovery queue
     ============================================================ */
  var sortList = document.querySelector('.sortlist');
  var sortBtn = document.querySelector('.sortbtn');
  function scatter() {
    if (!sortList) return;
    sortList.classList.remove('sorted');
    var cards = sortList.querySelectorAll('.scard');
    cards.forEach(function (c) {
      var dx = (Math.random() - 0.5) * 60;
      var dy = (Math.random() - 0.5) * 40;
      var rot = (Math.random() - 0.5) * 8;
      c.style.transition = 'none';
      c.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
      c.style.opacity = '0.35';
    });
  }
  function sortIn() {
    if (!sortList) return;
    var cards = sortList.querySelectorAll('.scard');
    cards.forEach(function (c, i) {
      c.style.transition = '';
      setTimeout(function () {
        c.style.transform = '';
        c.style.opacity = '1';
      }, 90 * i + 60);
    });
    sortList.classList.add('sorted');
  }
  if (sortList) {
    if (!reduce) scatter();
    var sObs = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting) { sortIn(); sObs.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    sObs.observe(sortList);
  }
  if (sortBtn) {
    sortBtn.addEventListener('click', function () {
      sortBtn.classList.add('spin');
      setTimeout(function () { sortBtn.classList.remove('spin'); }, 520);
      if (reduce) { sortIn(); return; }
      scatter();
      setTimeout(sortIn, 260);
    });
  }

  /* ============================================================
     11. FAQ accordion
     ============================================================ */
  document.querySelectorAll('.fitem .fq').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.closest('.fitem');
      var fa = item.querySelector('.fa');
      var open = item.classList.toggle('open');
      fa.style.maxHeight = open ? fa.scrollHeight + 'px' : '0';
    });
  });

  /* ============================================================
     12. Dark section — approve & send demo
     ============================================================ */
  var dbtn = document.getElementById('dapprove');
  if (dbtn) {
    dbtn.addEventListener('click', function () {
      if (dbtn.classList.contains('done')) return;
      dbtn.classList.add('done');
      dbtn.innerHTML = '<i data-lucide="check"></i>Sent';
      document.getElementById('ddraft').classList.add('sent');
      document.getElementById('ddraft-t').textContent = 'Follow-up sent to North Ridge Homes';
      document.getElementById('ddraft-q').textContent = 'We\u2019ll check back in 5 days \u2014 nothing else to do.';
      if (window.lucide) lucide.createIcons();
    });
  }

  onScroll();

  /* ============================================================
     TWEAKS BRIDGE — called by the React panel
     ============================================================ */
  window.applyTweaks = function (t) {
    if (!t) return;
    var root = document.documentElement;
    if (t.motion) { state.motion = t.motion; root.setAttribute('data-motion', t.motion); if (ocean) ocean.setMotion(t.motion); }
    if (t.heroPalette && PALETTES[t.heroPalette]) {
      state.palette = t.heroPalette;
      if (ocean) ocean.setPalette(t.heroPalette);
      else if (grad) grad.rebuild();
    }
    if (t.sky) {
      state.sky = t.sky;
      if (ocean) {
        ocean.setSky(t.sky);
        document.body.classList.toggle('sky-on', t.sky === 'day');
      }
    }
    if (t.accent) {
      var map = {
        orange: ['#FF6A00', '#E85D00', 'rgba(255,106,0,.30)'],
        ocean:  ['#024D8B', '#013e72', 'rgba(2,77,139,.30)'],
        cyan:   ['#1597C4', '#0f7da3', 'rgba(44,167,255,.32)']
      };
      var a = map[t.accent] || map.orange;
      root.style.setProperty('--accent', a[0]);
      root.style.setProperty('--accent-600', a[1]);
      root.style.setProperty('--accent-glow', a[2]);
    }
    if (typeof t.showWaves === 'boolean') {
      var hw = document.querySelector('.hero-waves');
      if (hw) hw.style.display = t.showWaves ? '' : 'none';
    }
  };

  if (window.lucide) lucide.createIcons();
})();
