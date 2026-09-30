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
  var rev = document.body.getAttribute('data-rev');
  var POLL_MS = 30000;
  var BADGE = { ok: '', stop: 'стоп', out: 'немає' };
  var timer = null;
  /* The last menu JSON the poll fetched: the ordering sheet asks its questions from it. */
  var latestMenu = null;

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
    /* The owner changed a text, an allergen or a price since this page was
       drawn: what is on screen is wrong, and for an allergen wrong is not a
       cosmetic matter — so redraw rather than patch. */
    if (menu.rev && rev && menu.rev !== rev) return reloadOnce();

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
      .then(function (menu) { if (menu) { latestMenu = menu; apply(menu); } })
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

  /* Ordering (phase Q6). The guest picks dishes and sends them to a WAITER, who
     accepts — nothing here reaches the kitchen by itself, and the page says so.
     Every word that came from the owner goes in with textContent. The table's
     key is read from the address bar, like the bill's. */
  var orderUrl = document.body.getAttribute('data-order-url');
  if (orderUrl) initOrder(orderUrl);

  function initOrder(endpoint) {
    var params = new URLSearchParams(window.location.search);
    var table = params.get('t') || '';
    var key = params.get('k') || '';
    var sheet = document.querySelector('[data-order-sheet]');
    var body = document.querySelector('[data-order-body]');
    var foot = document.querySelector('[data-order-foot]');
    var title = document.querySelector('[data-order-title]');
    var cartBar = document.querySelector('[data-cart-open]');
    var closer = document.querySelector('[data-order-close]');
    if (!sheet || !body || !foot || !cartBar || !closer) return;

    var MAX_QTY = 20;
    var CART_KEY = 'cart:' + table;
    var ORDERS_KEY = 'orders:' + table;
    var cart = load(CART_KEY, []);
    var mine = load(ORDERS_KEY, []);      // client_uuids of this phone's requests
    var views = [];                        // what the server last said about them
    var sending = null;                    // the uuid of a send in flight: a retry is the SAME request
    var pollTimer = null;
    var view = 'cart';

    function load(name, fallback) {
      try { return JSON.parse(sessionStorage.getItem(name) || 'null') || fallback; } catch (e) { return fallback; }
    }
    function saveCart() {
      sending = null;
      save(CART_KEY, cart);
    }
    function save(name, value) {
      try { sessionStorage.setItem(name, JSON.stringify(value)); } catch (e) { /* storage blocked: the cart lives for this page only */ }
    }
    function node(tag, className, text) {
      var el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = text;
      return el;
    }
    function money(cents) {
      var abs = Math.abs(cents);
      var whole = Math.floor(abs / 100);
      var frac = abs % 100;
      var text = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
      return (cents < 0 ? '-' : '') + text + (frac ? ',' + (frac < 10 ? '0' : '') + frac : '') + '\u00a0\u20b4';
    }
    function delta(cents) {
      if (cents > 0) return '+' + money(cents);
      if (cents < 0) return '\u2212' + money(-cents);
      return '';
    }
    function hint(group) {
      if (group.min_select >= 1) return group.max_select > 1 ? 'обовʼязково · до ' + group.max_select : 'обовʼязково';
      if (group.max_select <= 1) return 'можна одне';
      if (group.max_select >= group.modifiers.length) return 'скільки завгодно';
      return 'до ' + group.max_select;
    }
    function uuid() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      var s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
      return s;
    }
    function findProduct(id) {
      if (!latestMenu) return null;
      for (var i = 0; i < latestMenu.categories.length; i += 1) {
        var products = latestMenu.categories[i].products;
        for (var j = 0; j < products.length; j += 1) if (String(products[j].id) === String(id)) return products[j];
      }
      return null;
    }
    function total() {
      return cart.reduce(function (sum, line) { return sum + line.unit * line.qty; }, 0);
    }
    function count() {
      return cart.reduce(function (sum, line) { return sum + line.qty; }, 0);
    }
    function pendingViews() {
      return views.filter(function (v) { return v.status === 'pending'; });
    }

    /* ── the bar ── */
    function paintBar() {
      var waiting = pendingViews().length;
      if (count() > 0) {
        cartBar.hidden = false;
        cartBar.textContent = 'Замовлення · ' + count() + ' · ' + money(total());
      } else if (waiting > 0) {
        cartBar.hidden = false;
        cartBar.textContent = 'Запит чекає офіціанта';
      } else {
        cartBar.hidden = true;
      }
    }

    /* ── the dish sheet ── */
    function openDish(product) {
      view = 'dish';
      var sizes = product.variants;
      var chosenVariant = sizes.filter(function (v) { return v.available; })[0] || sizes[0];
      var picked = {};                     // modifier id -> true
      product.modifier_groups.forEach(function (g) {
        g.modifiers.forEach(function (m) { if (m.is_default) picked[m.id] = true; });
      });
      var qty = 1;
      var noteValue = '';

      title.textContent = product.name;
      function paint() {
        body.textContent = '';
        foot.textContent = '';
        if (product.description) body.appendChild(node('p', 'bill-note', product.description));
        if (product.composition) body.appendChild(node('p', 'bill-note', 'Склад: ' + product.composition));
        if (product.allergens && product.allergens.length) {
          body.appendChild(node('p', 'bill-note allergen-line', 'Містить: ' + product.allergens.map(function (a) { return a.label; }).join(', ')));
        }

        if (sizes.length > 1) {
          body.appendChild(node('h3', 'opt-head', 'Розмір'));
          sizes.forEach(function (v) {
            var row = node('label', 'opt' + (v.id === chosenVariant.id ? ' on' : '') + (v.available ? '' : ' off'));
            var input = node('input');
            input.type = 'radio';
            input.name = 'size';
            input.checked = v.id === chosenVariant.id;
            input.disabled = !v.available;
            input.addEventListener('change', function () { chosenVariant = v; paint(); });
            row.appendChild(input);
            row.appendChild(node('span', null, v.label));
            row.appendChild(node('b', null, money(v.price_cents)));
            body.appendChild(row);
          });
        }

        product.modifier_groups.forEach(function (g) {
          var head = node('h3', 'opt-head', g.name);
          head.appendChild(node('small', null, hint(g)));
          body.appendChild(head);
          g.modifiers.forEach(function (m) {
            var on = !!picked[m.id];
            var row = node('label', 'opt' + (on ? ' on' : ''));
            var input = node('input');
            input.type = g.max_select === 1 ? 'radio' : 'checkbox';
            input.name = 'g' + g.id;
            input.checked = on;
            input.addEventListener('change', function () {
              if (g.max_select === 1) {
                g.modifiers.forEach(function (other) { delete picked[other.id]; });
                picked[m.id] = true;
              } else if (input.checked) {
                var chosen = g.modifiers.filter(function (o) { return picked[o.id]; }).length;
                if (chosen >= g.max_select) { input.checked = false; return; }
                picked[m.id] = true;
              } else {
                delete picked[m.id];
              }
              paint();
            });
            row.appendChild(input);
            row.appendChild(node('span', null, m.name));
            var d = delta(m.price_delta_cents);
            if (d) row.appendChild(node('b', null, d));
            body.appendChild(row);
          });
          if (g.min_select === 0 && g.max_select === 1) {
            var clear = node('button', 'link-btn', 'Без цього');
            clear.type = 'button';
            clear.addEventListener('click', function () {
              g.modifiers.forEach(function (o) { delete picked[o.id]; });
              paint();
            });
            body.appendChild(clear);
          }
        });

        var note = node('input', 'note-input');
        note.type = 'text';
        note.maxLength = 120;
        note.placeholder = 'Побажання (необов’язково)';
        note.value = noteValue;
        note.addEventListener('input', function () { noteValue = note.value; });
        body.appendChild(note);

        // Each group's rule, checked before the button lets go: the server checks
        // again, but a guest should not learn about a required answer from an error.
        var ok = chosenVariant.available;
        var unit = chosenVariant.price_cents;
        product.modifier_groups.forEach(function (g) {
          var chosen = g.modifiers.filter(function (m) { return picked[m.id]; });
          if (chosen.length < g.min_select) ok = false;
          chosen.forEach(function (m) { unit += m.price_delta_cents; });
        });

        var stepper = node('div', 'qty');
        var minus = node('button', null, '\u2212');
        minus.type = 'button';
        minus.addEventListener('click', function () { if (qty > 1) { qty -= 1; paint(); } });
        var plus = node('button', null, '+');
        plus.type = 'button';
        plus.addEventListener('click', function () { if (qty < MAX_QTY) { qty += 1; paint(); } });
        stepper.appendChild(minus);
        stepper.appendChild(node('output', null, String(qty)));
        stepper.appendChild(plus);
        var wrap = node('div', 'cart-line');
        wrap.appendChild(node('span', null, 'Кількість'));
        wrap.appendChild(stepper);
        foot.appendChild(wrap);

        var add = node('button', 'primary', 'Додати · ' + money(unit * qty));
        add.type = 'button';
        add.disabled = !ok;
        add.addEventListener('click', function () {
          var mods = [];
          var names = [];
          product.modifier_groups.forEach(function (g) {
            g.modifiers.forEach(function (m) { if (picked[m.id]) { mods.push(m.id); names.push(m.name); } });
          });
          mods.sort(function (a, b) { return a - b; });
          var size = sizes.length > 1 ? chosenVariant.label : '';
          var caption = [size].concat(names).filter(function (part) { return part; }).join(' · ');
          var same = cart.filter(function (l) {
            return l.variantId === chosenVariant.id && l.mods.join(',') === mods.join(',') && l.note === noteValue.trim();
          })[0];
          if (same) same.qty = Math.min(MAX_QTY, same.qty + qty);
          else cart.push({ variantId: chosenVariant.id, name: product.name, caption: caption, qty: qty, mods: mods, note: noteValue.trim(), unit: unit });
          saveCart();
          paintBar();
          closeSheet();
        });
        foot.appendChild(add);
      }
      paint();
      openSheet();
    }

    /* ── the cart and the guest's own requests ── */
    var STATUS = {
      pending: 'Очікує офіціанта',
      accepted: 'Прийнято — офіціант передав на кухню',
      rejected: 'Не вдалося прийняти',
      expired: 'Час вийшов — надішліть запит ще раз',
      cancelled: 'Скасовано'
    };

    function openCart(message) {
      view = 'cart';
      title.textContent = 'Замовлення';
      body.textContent = '';
      foot.textContent = '';

      if (cart.length) {
        cart.forEach(function (line, i) {
          var row = node('div', 'cart-line');
          var label = node('div');
          label.appendChild(node('span', null, line.name));
          if (line.caption) label.appendChild(node('small', null, line.caption));
          if (line.note) label.appendChild(node('small', null, '«' + line.note + '»'));
          label.appendChild(node('small', null, money(line.unit * line.qty)));
          row.appendChild(label);
          var stepper = node('div', 'qty');
          var minus = node('button', null, '\u2212');
          minus.type = 'button';
          minus.addEventListener('click', function () {
            line.qty -= 1;
            if (line.qty < 1) cart.splice(i, 1);
            saveCart(); paintBar(); openCart();
          });
          var plus = node('button', null, '+');
          plus.type = 'button';
          plus.addEventListener('click', function () {
            if (line.qty < MAX_QTY) { line.qty += 1; saveCart(); paintBar(); openCart(); }
          });
          stepper.appendChild(minus);
          stepper.appendChild(node('output', null, String(line.qty)));
          stepper.appendChild(plus);
          row.appendChild(stepper);
          body.appendChild(row);
        });
        var sum = node('div', 'bill-total');
        sum.appendChild(node('span', null, 'Орієнтовно'));
        sum.appendChild(node('b', null, money(total())));
        body.appendChild(sum);
        body.appendChild(node('p', 'bill-note', 'Це запит: на кухню він піде, коли офіціант його прийме. Остаточну ціну фіксує кухня.'));
      } else if (!pendingViews().length && !views.length) {
        body.appendChild(node('p', 'bill-note', 'Кошик порожній. Оберіть страви в меню.'));
      }

      if (message) body.appendChild(node('p', 'error', message));

      if (views.length) {
        body.appendChild(node('h3', 'opt-head', 'Ваші запити'));
        views.forEach(function (v) {
          var card = node('div', 'req ' + v.status);
          card.appendChild(node('b', null, STATUS[v.status] || v.status));
          v.lines.forEach(function (l) {
            card.appendChild(node('small', null, l.quantity + ' × ' + l.name + (l.caption ? ' · ' + l.caption : '')));
          });
          if (v.reason) card.appendChild(node('small', null, v.reason));
          if (v.status === 'pending') {
            var cancel = node('button', 'link-btn', 'Скасувати запит');
            cancel.type = 'button';
            cancel.addEventListener('click', function () { cancelRequest(v.client_uuid); });
            card.appendChild(cancel);
          }
          body.appendChild(card);
        });
      }

      if (cart.length) {
        var send = node('button', 'primary', 'Надіслати офіціанту');
        send.type = 'button';
        send.addEventListener('click', function () { sendOrder(send); });
        foot.appendChild(send);
      }
      openSheet();
    }

    function sendOrder(button) {
      button.disabled = true;
      // A retry after a dropped connection must be the SAME request, or the
      // waiter sees two of it.
      if (!sending) sending = uuid();
      var items = cart.map(function (l) {
        return { variant_id: l.variantId, quantity: l.qty, modifiers: l.mods, note: l.note };
      });
      fetch(endpoint + '?t=' + encodeURIComponent(table) + '&k=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_uuid: sending, items: items })
      })
        .then(function (response) {
          return response.json().then(function (data) { return { status: response.status, data: data }; }, function () { return { status: response.status, data: null }; });
        })
        .then(function (result) {
          if (result.status === 201 || result.status === 200) {
            mine.unshift(result.data.client_uuid);
            mine = mine.slice(0, 10);
            save(ORDERS_KEY, mine);
            cart = [];
            saveCart();
            refresh().then(function () { paintBar(); openCart(); });
          } else {
            // A refusal is final for THIS request: a corrected cart is a new one.
            if (result.status !== 429) sending = null;
            var message = result.data && result.data.error ? result.data.error : 'Не вдалося надіслати. Спробуйте ще раз.';
            if (result.status === 404) message = 'Замовлення з телефону зараз недоступне — покличте офіціанта.';
            openCart(message);
          }
        })
        .catch(function () {
          // The uuid stays: pressing the button again is a retry of the same request.
          openCart('Немає зв’язку. Спробуйте ще раз — запит не задвоїться.');
        });
    }

    function cancelRequest(id) {
      fetch(endpoint + '/' + encodeURIComponent(id) + '/cancel?t=' + encodeURIComponent(table) + '&k=' + encodeURIComponent(key), { method: 'POST' })
        .then(function () { return refresh(); })
        .then(function () { paintBar(); openCart(); })
        .catch(function () { /* offline: the list stays as it was */ });
    }

    function refresh() {
      if (!mine.length) { views = []; return Promise.resolve(); }
      var url = endpoint + '?t=' + encodeURIComponent(table) + '&k=' + encodeURIComponent(key) + '&ids=' + encodeURIComponent(mine.join(','));
      return fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) { if (data && data.orders) views = data.orders; })
        .catch(function () { /* keep what is on screen */ });
    }

    /* ── the sheet ── */
    function openSheet() {
      sheet.hidden = false;
      document.body.classList.add('bill-open');
    }
    function closeSheet() {
      sheet.hidden = true;
      document.body.classList.remove('bill-open');
    }

    function poll() {
      if (document.hidden || !pendingViews().length) return;
      refresh().then(function () {
        paintBar();
        if (!sheet.hidden && view === 'cart') openCart();
      });
    }
    pollTimer = window.setInterval(poll, 6000);

    document.addEventListener('click', function (event) {
      var target = event.target;
      var add = target && target.closest && target.closest('[data-add]');
      if (!add) return;
      var id = add.getAttribute('data-add');
      var product = findProduct(id);
      if (product) { openDish(product); return; }
      // The menu JSON has not arrived yet: ask for it, then open.
      fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (menu) {
          if (!menu) return;
          latestMenu = menu;
          var found = findProduct(id);
          if (found) openDish(found);
        })
        .catch(function () { /* offline: the button does nothing, the menu still reads */ });
    });
    cartBar.addEventListener('click', function () { refresh().then(function () { openCart(); }); });
    closer.addEventListener('click', closeSheet);
    sheet.addEventListener('click', function (event) { if (event.target === sheet) closeSheet(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !sheet.hidden) closeSheet(); });

    // The dishes' questions come from the menu JSON; fetch it once now so the
    // first tap on «Додати» does not have to wait for the poll.
    fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (menu) { if (menu) latestMenu = menu; })
      .catch(function () { /* the poll will bring it */ });
    refresh().then(paintBar);
    paintBar();
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
