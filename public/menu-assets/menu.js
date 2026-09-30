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

  /* The guest's bill (phase Q5). The page only has the frame; every word inside
     the sheet arrives from /bill and goes in with textContent, so nothing an
     owner typed is ever parsed as markup here. The table's key is read from the
     address bar, where the QR put it. */
  var billUrl = document.body.getAttribute('data-bill-url');
  if (billUrl) initBill(billUrl);

  function initBill(endpoint) {
    var params = new URLSearchParams(window.location.search);
    var table = params.get('t') || '';
    var key = params.get('k') || '';
    var bar = document.querySelector('[data-bill-open]');
    var sheet = document.querySelector('[data-bill-sheet]');
    var target = document.querySelector('[data-bill-body]');
    var closer = document.querySelector('[data-bill-close]');
    if (!bar || !sheet || !target || !closer) return;
    var BILL_POLL_MS = 20000;
    var billTimer = null;

    var STATUS = { cooking: 'Готується', ready: 'Готово, зараз принесуть', served: 'Подано' };

    function node(tag, className, text) {
      var el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = text;
      return el;
    }

    function say(message) {
      target.textContent = '';
      target.appendChild(node('p', 'bill-note', message));
    }

    function render(bill) {
      target.textContent = '';
      if (!bill.open) {
        say('Рахунок ще не відкрито. Коли замовлення піде на кухню, воно з’явиться тут.');
        return;
      }
      if (!bill.rounds.length) {
        say('Поки нічого не відправлено на кухню.');
        return;
      }
      bill.rounds.forEach(function (round) {
        var block = node('section', 'bill-round');
        var head = node('h3', 'bill-round-head');
        head.appendChild(node('span', null, 'Замовлення ' + round.seq + ' · ' + round.at));
        head.appendChild(node('small', 'bill-status', STATUS[round.status] || STATUS.cooking));
        block.appendChild(head);
        round.lines.forEach(function (line) {
          var row = node('div', 'bill-line' + (line.paid ? ' paid' : ''));
          var name = node('div', 'bill-line-name');
          name.appendChild(node('span', null, line.quantity + ' × ' + line.name));
          if (line.caption) name.appendChild(node('small', null, line.caption));
          if (line.paid) name.appendChild(node('small', 'bill-paid', 'оплачено'));
          row.appendChild(name);
          row.appendChild(node('b', null, line.total_text));
          block.appendChild(row);
        });
        target.appendChild(block);
      });
      var total = node('div', 'bill-total');
      total.appendChild(node('span', null, 'До сплати'));
      total.appendChild(node('b', null, bill.to_pay_text));
      target.appendChild(total);
      if (bill.paid_text) target.appendChild(node('p', 'bill-note', 'Уже оплачено: ' + bill.paid_text));
      target.appendChild(node('p', 'bill-note', 'Ціни зафіксовані в момент відправлення на кухню. Оновлюється саме.'));
    }

    function load() {
      var url = endpoint + '?t=' + encodeURIComponent(table) + '&k=' + encodeURIComponent(key);
      fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) {
          if (response.status === 404) {
            // Switched off, or the QR is not this table's: no bill, and no bar to open it.
            say('Рахунок цього столу зараз недоступний.');
            bar.hidden = true;
            return null;
          }
          return response.ok ? response.json() : null;
        })
        .then(function (bill) { if (bill) render(bill); })
        .catch(function () { /* offline: keep what is on screen */ });
    }

    function stopBill() {
      if (billTimer) window.clearInterval(billTimer);
      billTimer = null;
    }
    function startBill() {
      if (!billTimer) billTimer = window.setInterval(load, BILL_POLL_MS);
    }
    function open() {
      sheet.hidden = false;
      document.body.classList.add('bill-open');
      say('Завантажуємо…');
      load();
      startBill();
      closer.focus();
    }
    function close() {
      sheet.hidden = true;
      document.body.classList.remove('bill-open');
      stopBill();
      bar.focus();
    }

    bar.addEventListener('click', open);
    closer.addEventListener('click', close);
    sheet.addEventListener('click', function (event) { if (event.target === sheet) close(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !sheet.hidden) close(); });
    document.addEventListener('visibilitychange', function () {
      if (sheet.hidden) return;
      if (document.hidden) { stopBill(); } else { load(); startBill(); }
    });
  }

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
