/* Page transitions (cross-document View Transitions; Chrome/Edge, Safari 18.2+; others just
   navigate). Loaded in <head> so the pagereveal listener exists before the first frame.
   The scene, title card and nav morph between pages; the body drifts in the nav direction:
   Home -> Privacy (PDPA) -> Terms -> Support (right), or back (left).
   The animations themselves live in site.css. */
(function () {
  var ORDER = { '/': 0, '/privacy/': 1, '/privacy/pdpa/': 1.5, '/terms/': 2, '/support/': 3 };
  function place(url) { return ORDER[new URL(url, location.href).pathname]; }

  // Shared elements (scene, title card) only morph when they're actually on screen; otherwise
  // they'd fly in from above the viewport. Runs on both sides of the navigation.
  var SHARED = ['.hero-bg', '.hero-card', '.doc-card'];
  function onScreen(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }
  // all=true: drop every shared name (plain crossfade), e.g. when the other page had none on screen.
  function dropOffscreenNames(all) {
    SHARED.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && (all || !onScreen(el))) el.style.viewTransitionName = 'none';
    });
  }
  function restoreNames() {
    SHARED.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) el.style.viewTransitionName = '';
    });
  }

  window.addEventListener('pageswap', function (e) {
    var scene = document.querySelector('.hero-bg');
    try {
      sessionStorage.setItem('tf-from', String(place(location.href)));
      sessionStorage.setItem('tf-shared', scene && onScreen(scene) ? '1' : '0');
    } catch (err) {}
    if (e.viewTransition) {
      dropOffscreenNames();
      // If this page comes back from the back/forward cache it should start clean.
      e.viewTransition.finished.finally(restoreNames);
    }
  });

  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var from, to = place(location.href);
    try { from = parseFloat(sessionStorage.getItem('tf-from')); } catch (err) {}
    var shared = '1';
    try { shared = sessionStorage.getItem('tf-shared') || '1'; } catch (err) {}
    dropOffscreenNames(shared === '0');
    var root = document.documentElement;
    if (!isNaN(from) && to !== undefined && from !== to) root.classList.add(to > from ? 'vt-fwd' : 'vt-back');
    e.viewTransition.finished.finally(function () { root.classList.remove('vt-fwd', 'vt-back'); restoreNames(); });
  });
})();
