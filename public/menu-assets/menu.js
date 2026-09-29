/* The guest's menu (TechDocs/POS_QR_MENU.md): keeps the stop-list live and
   prints the QR card. A static file, not an inline script, so the page's CSP
   can forbid inline script altogether; nothing the owner typed is ever here. */
(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (target && target.closest && target.closest('[data-print]')) window.print();
  });

  var url = document.body.getAttribute('data-menu-url');
  if (!url) return; // the QR card and the «unavailable» page have nothing to poll

  var day = document.body.getAttribute('data-store-day');
  var POLL_MS = 30000;
  var BADGE = { ok: '', stop: 'стоп', out: 'немає' };
  var timer = null;

  /* A page whose shape no longer matches the menu (a dish added, removed or
     re-priced) is reloaded rather than patched — but at most once a minute, so
     a server that keeps disagreeing with itself cannot make a reload loop. */
  function reloadOnce() {
    try {
      var last = Number(sessionStorage.getItem('menu-reloaded') || 0);
      if (Date.now() - last < 60000) return;
      sessionStorage.setItem('menu-reloaded', String(Date.now()));
    } catch (e) { /* storage blocked: fall through and reload anyway */ }
    window.location.reload();
  }

  function stateOf(product) {
    if (product.stopped) return 'stop';
    return product.available ? 'ok' : 'out';
  }

  function apply(menu) {
    if (menu.store_day !== day) return reloadOnce();

    var wanted = {};
    menu.categories.forEach(function (category) {
      category.products.forEach(function (product) { wanted[product.id] = product; });
    });
    var items = document.querySelectorAll('.item[data-product]');
    if (items.length !== Object.keys(wanted).length) return reloadOnce();

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var product = wanted[item.getAttribute('data-product')];
      if (!product) return reloadOnce();

      var state = stateOf(product);
      item.setAttribute('data-state', state);
      var badge = item.querySelector('.badge');
      if (badge) badge.textContent = BADGE[state];

      var byId = {};
      product.variants.forEach(function (variant) { byId[variant.id] = variant; });
      var rows = item.querySelectorAll('[data-variant]');
      for (var j = 0; j < rows.length; j += 1) {
        var variant = byId[rows[j].getAttribute('data-variant')];
        if (!variant || String(variant.price_cents) !== rows[j].getAttribute('data-price')) return reloadOnce();
        rows[j].classList.toggle('off', !variant.available);
      }
    }
  }

  function tick() {
    fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (response.status === 404) return reloadOnce(); // rotated or switched off: show the «unavailable» page
        return response.ok ? response.json() : null;
      })
      .then(function (menu) { if (menu) apply(menu); })
      .catch(function () { /* offline or a hiccup: keep what is on screen */ });
  }

  function start() {
    if (timer) return;
    timer = window.setInterval(tick, POLL_MS);
  }
  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
    } else {
      tick();
      start();
    }
  });
  if (!document.hidden) start();

  /* The tab that matches the section in view. */
  var links = document.querySelectorAll('.tabs a');
  if (links.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        for (var k = 0; k < links.length; k += 1) {
          links[k].classList.toggle('on', links[k].getAttribute('href') === '#' + entry.target.id);
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.cat').forEach(function (section) { observer.observe(section); });
  }
})();
