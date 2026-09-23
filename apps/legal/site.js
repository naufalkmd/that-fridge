/* ThatFridge site-wide behaviour, loaded by every page after lenis-*.min.js:
   smooth scroll, hide-on-scroll nav, side index (reveal + scroll-spy), scroll reveals.
   Legal/support pages (<main data-doc>) also get their side index built from the h2s.
   Page scripts hook in through window.TF (see TF.onActive). */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TF = window.TF = { reduce: reduce };

  var y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();

  // Smooth scroll. Skipped for reduced-motion users and if Lenis didn't load.
  if (!reduce && window.Lenis) {
    var lenis = new Lenis({
      lerp: 0.085,            // same easing on every wheel tick = steady pace
      wheelMultiplier: 0.9,
      smoothWheel: true,
      anchors: { offset: -16 },
      // Only the landing's phone-width screenshot strip scrolls natively; opting it out on desktop
      // made the wheel jump there while it eased everywhere else.
      prevent: function (node) {
        return !window.matchMedia('(min-width: 861px)').matches && node.classList && node.classList.contains('shots');
      }
    });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
    TF.lenis = lenis;
  }

  // Legal pages: number-highlight headings and build the side index (+ phone "On this page") from them.
  // Text content is untouched; only wrappers and ids are added.
  var doc = document.querySelector('[data-doc]');
  if (doc) {
    var list = document.querySelector('#side ol');
    var used = {};
    // Section list from the h2s; short pages (support: Contact + FAQ) also index their h3 questions.
    var heads = doc.querySelectorAll('.doc-body h2');
    if (heads.length < 3) heads = doc.querySelectorAll('.doc-body h2, .doc-body h3');
    heads.forEach(function (h) {
      if (!h.id) {
        var base = h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'section';
        var id = base, n = 2;
        while (used[id] || document.getElementById(id)) id = base + '-' + n++;
        h.id = id;
      }
      used[h.id] = true;
      var m = h.firstChild && h.firstChild.nodeType === 3 && h.firstChild.nodeValue.match(/^(\s*\d+\.)(\s*)/);
      if (m) {
        h.firstChild.nodeValue = h.firstChild.nodeValue.slice(m[0].length);
        var num = document.createElement('span'); num.className = 'num'; num.textContent = m[1].trim();
        if (m[2]) h.insertBefore(document.createTextNode(m[2]), h.firstChild);
        h.insertBefore(num, h.firstChild);
      }
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + h.id; a.textContent = h.textContent.replace(/\s+/g, ' ').trim();
      li.appendChild(a); list.appendChild(li);
    });
    var toc = document.getElementById('toc-m');
    if (toc && heads.length > 1) {
      toc.querySelector('ol').innerHTML = list.innerHTML;
      toc.hidden = false;
    }
    if (heads.length < 2) document.getElementById('side').classList.add('empty');
  }

  var top = document.getElementById('top');
  var side = document.getElementById('side');
  var hero = document.querySelector('.hero');

  // Nav hides while scrolling down and comes back on any scroll up.
  // The side index appears once the hero is (almost) fully scrolled past.
  var lastY = window.scrollY, ticking = false;
  function update() {
    ticking = false;
    var sy = window.scrollY;
    top.classList.toggle('scrolled', sy > 40);
    if (sy > lastY + 4 && sy > 140) top.classList.add('hide');
    else if (sy < lastY - 4 || sy <= 140) top.classList.remove('hide');
    lastY = sy;
    if (side && hero) side.classList.toggle('on', hero.getBoundingClientRect().bottom < window.innerHeight * 0.35);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();

  // Scroll-spy: the section crossing the middle of the viewport is "current".
  var links = side ? side.querySelectorAll('a') : [];
  var listeners = [], current = 0;
  function setActive(id) {
    links.forEach(function (a, i) {
      var on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', on);
      if (on) {
        a.setAttribute('aria-current', 'true'); current = i;
        // Long indexes (terms) scroll on their own: keep the active item in view.
        if (side.scrollHeight > side.clientHeight) {
          var target = a.offsetTop - side.clientHeight / 2;
          side.scrollTo({ top: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
        }
      }
      else a.removeAttribute('aria-current');
    });
    listeners.forEach(function (fn) { fn(current, links.length); });
  }
  TF.onActive = function (fn) { listeners.push(fn); fn(current, links.length); };
  if (links.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (a) {
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (t) spy.observe(t);
    });
  }
  if (links.length) setActive(links[0].getAttribute('href').slice(1));

  // Scroll reveal
  var els = document.querySelectorAll('.rv');
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (el) { io.observe(el); });
})();
