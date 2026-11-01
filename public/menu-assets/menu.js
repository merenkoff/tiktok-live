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
  /* The last menu JSON the poll fetched: the dish sheet and the cart read it. */
  var latestMenu = null;

  /* ── shared by the dish sheet and the cart: nodes, money, the groups' words ── */
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
    var text = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (cents < 0 ? '-' : '') + text + (frac ? ',' + (frac < 10 ? '0' : '') + frac : '') + ' ₴';
  }
  function delta(cents) {
    if (cents > 0) return '+' + money(cents);
    if (cents < 0) return '−' + money(-cents);
    return '';
  }
  function hint(group) {
    if (group.min_select >= 1) return group.max_select > 1 ? 'обовʼязково · до ' + group.max_select : 'обовʼязково';
    if (group.max_select <= 1) return 'можна одне';
    if (group.max_select >= group.modifiers.length) return 'скільки завгодно';
    return 'до ' + group.max_select;
  }
  /* The facts a dish says under its price (F8 the size, F14 the numbers), in
     the words the server prints on the card — a second copy of
     `dishFactsParts`, as `money` is of the server's; `long` adds «на порцію»
     to the calories, which the sheet says and the list does not (Д33). */
  function factsOf(product, long) {
    var parts = [];
    var single = product.variants.length === 1 ? product.variants[0].label.trim() : '';
    if (single) parts.push(single);
    if (typeof product.kcal === 'number') parts.push(product.kcal + ' ккал' + (long ? ' на порцію' : ''));
    if (typeof product.strength_tenths === 'number') {
      var whole = Math.floor(product.strength_tenths / 10);
      var frac = product.strength_tenths % 10;
      parts.push('міцність ' + whole + (frac ? ',' + frac : '') + ' %');
    }
    if (typeof product.prep_minutes === 'number') parts.push('готується ≈ ' + product.prep_minutes + ' хв');
    return parts;
  }
  function findProduct(id) {
    if (!latestMenu) return null;
    for (var i = 0; i < latestMenu.categories.length; i += 1) {
      var products = latestMenu.categories[i].products;
      for (var j = 0; j < products.length; j += 1) if (String(products[j].id) === String(id)) return products[j];
    }
    return null;
  }
  /* The menu JSON once, before the poll's first turn: a tap on a dish, or on
     «Додати», should not have to wait for it. One request in flight at a time. */
  var priming = null;
  function menuJson() {
    if (latestMenu) return Promise.resolve(latestMenu);
    if (!priming) {
      priming = fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (menu) { if (menu) latestMenu = menu; priming = null; return latestMenu; })
        .catch(function () { priming = null; return null; });
    }
    return priming;
  }

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
    // The dish on the open sheet follows the same patch: a stop reaches it too.
    if (dishOpen && wanted[dishOpen]) refreshDish(wanted[dishOpen]);
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
  /* The dish's own sheet (phase F8). The server draws the frame; everything
     in it comes from the menu JSON through textContent — the photo at its
     real size (the file the card shows at 88 px, so nothing new is loaded),
     the name with its state, the price or the sizes, the weight, the
     description, the composition, the allergens, the modifiers. Where
     ordering is on, `initOrder` hangs its half under them: the questions,
     the count and «Додати». A tap anywhere on a card opens it, the name is
     the button a keyboard reaches; «назад» on the phone closes it, not the
     page, because opening puts `#d-<id>` into the history. */
  var dishSheet = document.querySelector('[data-dish-sheet]');
  var dishOpen = null;          // the id of the dish on the sheet while it is open
  var dishOrderHalf = null;     // set by initOrder: draws the questions, the count and «Додати»
  var dishRefresh = null;       // set by that half: repaint with a fresh product, keeping the guest's picks
  var dishPushed = false;       // this opening put `#d-<id>` into the history
  /* The dish's own address (F11): the page was asked for at `/m/<key>/d/<id>`
     and opens on that dish; the first closing puts the plain menu's path back,
     keeping `?t`/`?k`. `shareBase` is where «Поділитись» points — the server
     builds it from the menu's key alone, never from the table's key. */
  var DISH_PATH = /\/d\/\d+$/;
  var shareBase = document.body.getAttribute('data-share-base');
  var syncDishFav = function () {};  // set by initFav: paints the sheet's heart for the open dish
  var openDishById = function () {};
  var closeDish = function () {};
  var refreshDish = function () {};

  function initDish() {
    var panel = dishSheet.querySelector('[data-dish-panel]');
    var photo = dishSheet.querySelector('[data-dish-photo]');
    var img = dishSheet.querySelector('[data-dish-img]');
    var title = dishSheet.querySelector('[data-dish-title]');
    var badge = dishSheet.querySelector('[data-dish-badge]');
    var labelsRow = dishSheet.querySelector('[data-dish-labels]');
    var body = dishSheet.querySelector('[data-dish-body]');
    var foot = dishSheet.querySelector('[data-dish-foot]');
    var closer = dishSheet.querySelector('[data-dish-close]');
    var share = dishSheet.querySelector('[data-dish-share]');
    if (!panel || !photo || !img || !title || !badge || !labelsRow || !body || !foot || !closer) return;
    var canShare = !!(navigator.share || (navigator.clipboard && navigator.clipboard.writeText));
    if (share && shareBase && canShare) share.hidden = false;
    var shareTimer = null;
    function shareDish() {
      if (!dishOpen || !shareBase) return;
      var product = findProduct(dishOpen);
      var url = shareBase + '/' + dishOpen;
      var place = document.querySelector('.brand h1');
      var text = (product ? product.name : '') + (place ? ' — ' + place.textContent : '');
      if (navigator.share) {
        navigator.share({ title: text, text: text, url: url }).catch(function () {});
        return;
      }
      navigator.clipboard.writeText(url).then(function () {
        share.textContent = 'Скопійовано';
        clearTimeout(shareTimer);
        shareTimer = setTimeout(function () { share.textContent = 'Поділитись'; }, 2000);
      }).catch(function () {
        // A browser that refuses the clipboard (an embedded view, a denied
        // permission) still shows the address, so the guest copies it by hand.
        window.prompt('Адреса страви — скопіюйте:', url);
      });
    }
    if (share) share.addEventListener('click', shareDish);
    /* The labels' glyphs (F9) come from the frame's own templates, never from
       a string: the F5 rule, so the script holds no markup. */
    var glyphs = {};
    Array.prototype.forEach.call(dishSheet.querySelectorAll('template[data-label-glyph]'), function (t) {
      glyphs[t.getAttribute('data-label-glyph')] = t;
    });

    /* «Гостре», «Хіт»… under the name: the code picks the glyph and the colour,
       the word comes from the JSON. None — the row stays hidden. */
    function labelsOf(product) {
      labelsRow.textContent = '';
      var labels = product.labels || [];
      labels.forEach(function (l) {
        var glyph = glyphs[l.code];
        if (!glyph || !glyph.content) return;
        var chip = node('li', 'label label-' + l.code);
        chip.appendChild(glyph.content.cloneNode(true));
        chip.appendChild(node('span', null, l.label));
        labelsRow.appendChild(chip);
      });
      labelsRow.hidden = !labelsRow.firstChild;
    }

    function priceOf(product) {
      var many = product.variants.length > 1;
      body.appendChild(node('p', 'price', (many ? 'від ' : '') + money(product.from_price_cents)));
      if (many) {
        var sizes = node('ul', 'sizes');
        product.variants.forEach(function (v) {
          var row = node('li', v.available ? null : 'off');
          row.appendChild(node('span', null, v.label));
          row.appendChild(document.createTextNode(' '));
          row.appendChild(node('b', null, money(v.price_cents)));
          sizes.appendChild(row);
        });
        body.appendChild(sizes);
      }
      var facts = factsOf(product, true);
      if (facts.length) body.appendChild(node('p', 'facts', facts.join(' · ')));
    }
    function modifiersOf(product) {
      product.modifier_groups.forEach(function (g) {
        var head = node('h3', 'opt-head', g.name);
        head.appendChild(node('small', null, hint(g)));
        body.appendChild(head);
        var words = g.modifiers.map(function (m) {
          var base = delta(m.price_delta_cents);
          // A size where the answer costs differently is named beside it, as on the card.
          var bySize = product.variants.filter(function (v) {
            var own = m.price_delta_by_variant ? m.price_delta_by_variant[String(v.id)] : undefined;
            return typeof own === 'number' && own !== m.price_delta_cents;
          }).map(function (v) { return v.label + ' ' + (delta(m.price_delta_by_variant[String(v.id)]) || '0 ₴'); });
          return m.name + (base ? ' ' + base : '') + (bySize.length ? ' (' + bySize.join(', ') + ')' : '');
        });
        body.appendChild(node('p', 'dish-mods', words.join(' · ')));
      });
    }

    /* Draw the dish; idempotent, so the poll can redraw a stopped one in place. */
    function show(product) {
      var state = stateOf(product);
      var fresh = dishOpen !== String(product.id);
      dishOpen = String(product.id);
      dishRefresh = null;
      dishSheet.setAttribute('data-state', state);
      if (product.image_url) {
        if (img.getAttribute('src') !== product.image_url) img.src = product.image_url;
        photo.hidden = false;
      } else {
        img.removeAttribute('src');
        photo.hidden = true;
      }
      title.textContent = product.name;
      badge.textContent = BADGE[state];
      syncDishFav();
      labelsOf(product);
      body.textContent = '';
      foot.textContent = '';
      foot.hidden = true;
      if (product.description) body.appendChild(node('p', 'dish-desc', product.description));
      if (product.composition) {
        var comp = node('p', 'dish-comp');
        comp.appendChild(node('b', null, 'Склад: '));
        comp.appendChild(document.createTextNode(product.composition));
        body.appendChild(comp);
      }
      if (product.allergens && product.allergens.length) {
        var list = node('ul', 'allergens');
        list.setAttribute('aria-label', 'Містить алергени');
        product.allergens.forEach(function (a) { list.appendChild(node('li', null, a.label)); });
        body.appendChild(list);
      }
      if (dishOrderHalf && state === 'ok') {
        // The order half draws the sizes and the price itself; the facts
        // (the weight, the numbers) still go above it.
        var facts = factsOf(product, true);
        if (facts.length) body.appendChild(node('p', 'facts', facts.join(' · ')));
        dishOrderHalf(product, body, foot);
        foot.hidden = false;
      } else {
        priceOf(product);
        modifiersOf(product);
      }
      if (dishSheet.hidden) {
        dishSheet.hidden = false;
        document.body.classList.add('bill-open');
      }
      if (fresh) {
        panel.scrollTop = 0;
        closer.focus();
      }
    }
    function hide() {
      if (dishSheet.hidden) return;
      dishSheet.hidden = true;
      document.body.classList.remove('bill-open');
      var id = dishOpen;
      dishOpen = null;
      dishRefresh = null;
      var back = id && document.querySelector('.item[data-product="' + id + '"] [data-open]');
      if (back && back.focus) back.focus();
    }
    function open(product) {
      show(product);
      if (!/^#d-/.test(window.location.hash)) {
        history.pushState({ dish: product.id }, '', '#d-' + product.id);
        dishPushed = true;
      }
    }
    /* The guest's own closing takes the hash with it: back out of the entry
       this opening made, or drop a hash the page was opened with — or, on
       the dish's own address, put the plain menu's path back (F11). */
    function close() {
      if (dishPushed) { dishPushed = false; history.back(); return; } // popstate hides
      hide();
      var path = window.location.pathname;
      if (/^#d-/.test(window.location.hash)) history.replaceState(null, '', path + window.location.search);
      else if (DISH_PATH.test(path)) history.replaceState(null, '', path.replace(DISH_PATH, '') + window.location.search);
    }

    openDishById = function (id) {
      var now = findProduct(id);
      if (now) { open(now); return; }
      menuJson().then(function () {
        var later = findProduct(id);
        if (later) open(later);
      });
    };
    closeDish = close;
    refreshDish = function (product) {
      if (dishRefresh && stateOf(product) === 'ok') {
        badge.textContent = '';
        dishSheet.setAttribute('data-state', 'ok');
        dishRefresh(product);
      } else {
        show(product);
      }
    };

    // A tap anywhere on a card, except on its own controls — «Додатки», a
    // size, «Додати» — opens the dish; the name is the button that always does.
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var opener = target.closest('[data-open]');
      if (opener) { openDishById(opener.getAttribute('data-open')); return; }
      if (target.closest('button, a, details, summary, label, input, select, textarea')) return;
      var item = target.closest('.item[data-product]');
      if (item) openDishById(item.getAttribute('data-product'));
    });
    closer.addEventListener('click', close);
    dishSheet.addEventListener('click', function (event) { if (event.target === dishSheet) close(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !dishSheet.hidden) close(); });
    window.addEventListener('popstate', function () { dishPushed = false; hide(); });

    // Opened with `#d-<id>` — a link, or the page a guest came back to — or
    // at the dish's own address, which the server names in `data-open-dish`.
    var wanted = /^#d-(\d+)$/.exec(window.location.hash);
    var wantedId = wanted ? wanted[1] : document.body.getAttribute('data-open-dish');
    if (wantedId) menuJson().then(function () { var product = findProduct(wantedId); if (product) show(product); });
  }
  if (dishSheet) initDish();

  /* «Обрані» (F12): a heart on every card and in the sheet, the set kept on
     THIS phone in localStorage under the menu's key — no server and no
     counter (Д16, Д28). The tab «Обрані · N» leads the row only while the
     set has anything; tapping it shows the chosen cards alone, and the
     poll's patches reach them like any other card. An id the menu no longer
     lists is dropped the first time the set is read. */
  var favKey = 'menu:fav:' + (document.body.getAttribute('data-menu-key') || url);
  var favMemory = []; // what the page remembers when storage is blocked
  function readFav() {
    try {
      var raw = localStorage.getItem(favKey);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(String) : [];
    } catch (e) { return favMemory.slice(); }
  }
  function writeFav(list) {
    favMemory = list.slice();
    try { localStorage.setItem(favKey, JSON.stringify(list)); } catch (e) { /* private mode: kept for this page */ }
  }
  function initFav() {
    var cards = document.querySelectorAll('.item[data-product]');
    var tab = document.querySelector('[data-fav-tab]');
    if (!cards.length || !tab) return;
    var known = {};
    for (var i = 0; i < cards.length; i += 1) known[cards[i].getAttribute('data-product')] = true;
    var set = readFav().filter(function (id) { return known[id]; });
    function has(id) { return set.indexOf(String(id)) !== -1; }
    function leaveView() {
      if (document.body.getAttribute('data-view') !== 'fav') return;
      document.body.removeAttribute('data-view');
      tab.classList.remove('on');
      var first = document.querySelector('.tabs a:not([data-fav-tab])');
      if (first) first.classList.add('on');
    }
    function paint() {
      for (var c = 0; c < cards.length; c += 1) {
        var card = cards[c];
        var on = has(card.getAttribute('data-product'));
        card.setAttribute('data-chosen', on ? '1' : '0');
        var button = card.querySelector('[data-fav]');
        if (button) button.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      document.querySelectorAll('.cat').forEach(function (section) {
        section.setAttribute('data-has-chosen', section.querySelector('.item[data-chosen="1"]') ? '1' : '0');
      });
      if (set.length) {
        tab.textContent = 'Обрані · ' + set.length;
        tab.hidden = false;
      } else {
        tab.hidden = true;
        leaveView();
      }
      syncDishFav();
    }
    function toggle(id) {
      id = String(id);
      var at = set.indexOf(id);
      if (at === -1) set.push(id); else set.splice(at, 1);
      writeFav(set);
      paint();
    }
    syncDishFav = function () {
      var button = dishSheet && dishSheet.querySelector('[data-dish-fav]');
      if (button) button.setAttribute('aria-pressed', dishOpen && has(dishOpen) ? 'true' : 'false');
    };
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var heart = target.closest('[data-fav]');
      if (heart) { event.preventDefault(); toggle(heart.getAttribute('data-fav')); return; }
      if (target.closest('[data-dish-fav]')) { if (dishOpen) toggle(dishOpen); return; }
      var link = target.closest('.tabs a');
      if (!link) return;
      if (link === tab) {
        event.preventDefault();
        document.body.setAttribute('data-view', 'fav');
        document.querySelectorAll('.tabs a').forEach(function (a) { a.classList.toggle('on', a === tab); });
        window.scrollTo({ top: 0 });
      } else {
        leaveView();
      }
    });
    paint();
  }
  initFav();
  menuJson();

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
    function uuid() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      var s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
      return s;
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

    /* ── the ordering half of the dish sheet (F8): the questions, the count
       and «Додати», drawn under the dish's photo and texts by the sheet
       itself. This owns only what it adds: its box in the body, the foot. ── */
    dishOrderHalf = function (product, host, foot) {
      var body = node('div', 'dish-order');
      host.appendChild(body);
      var sizes = product.variants;
      var chosenVariant = sizes.filter(function (v) { return v.available; })[0] || sizes[0];
      var picked = {};                     // modifier id -> true
      product.modifier_groups.forEach(function (g) {
        g.modifiers.forEach(function (m) { if (m.is_default) picked[m.id] = true; });
      });
      var qty = 1;
      var noteValue = '';
      // An answer may cost more on the bigger size (the crust on a 50 см pizza):
      // the menu then names its price per size, keyed by variant id.
      function deltaOf(m) {
        var bySize = m.price_delta_by_variant;
        var own = bySize ? bySize[String(chosenVariant.id)] : undefined;
        return typeof own === 'number' ? own : m.price_delta_cents;
      }

      function paint() {
        body.textContent = '';
        foot.textContent = '';

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
            var d = delta(deltaOf(m));
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
          chosen.forEach(function (m) { unit += deltaOf(m); });
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
          closeDish();
        });
        foot.appendChild(add);
      }
      paint();
      // The poll brought a fresh copy of the dish (a size ran out): repaint
      // with it, keeping what the guest already picked.
      dishRefresh = function (fresh) {
        product = fresh;
        sizes = product.variants;
        var kept = sizes.filter(function (v) { return v.id === chosenVariant.id; })[0];
        chosenVariant = kept || sizes.filter(function (v) { return v.available; })[0] || sizes[0];
        paint();
      };
    };

    /* ── the cart and the guest's own requests ── */
    var STATUS = {
      pending: 'Очікує офіціанта',
      accepted: 'Прийнято — офіціант передав на кухню',
      rejected: 'Не вдалося прийняти',
      expired: 'Час вийшов — надішліть запит ще раз',
      cancelled: 'Скасовано',
      // Phase Q9: the owner let this order skip the waiter.
      sent: 'Передано на кухню — офіціант отримав сповіщення'
    };

    /* The owner's auto-send (phase Q9), read only to tell the guest honestly
       what will happen before they press the button: the server decides each
       order itself, by the same sum. Absent — every order waits for a waiter. */
    var autoMode = document.body.getAttribute('data-order-auto');
    var autoLimit = Number(document.body.getAttribute('data-order-limit') || 0);
    function sendWords() {
      var price = 'Остаточну ціну фіксує кухня.';
      if (autoMode !== 'all' && autoMode !== 'reorders') {
        return { note: 'Це запит: на кухню він піде, коли офіціант його прийме. ' + price, button: 'Надіслати офіціанту' };
      }
      if (total() > autoLimit) {
        return {
          note: 'Замовлення понад ' + money(autoLimit) + ' спершу прийме офіціант — на кухню воно піде після нього. ' + price,
          button: 'Надіслати офіціанту'
        };
      }
      if (autoMode === 'all') {
        return { note: 'Замовлення піде одразу на кухню, а офіціант отримає сповіщення. ' + price, button: 'Надіслати на кухню' };
      }
      return {
        note: 'Якщо офіціант уже обслуговує ваш стіл, замовлення піде одразу на кухню; якщо ні — спершу його прийме офіціант. ' + price,
        button: 'Надіслати замовлення'
      };
    }

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
        body.appendChild(node('p', 'bill-note', sendWords().note));
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
        var send = node('button', 'primary', sendWords().button);
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

    // «Додати» on a card opens the dish's sheet with its questions (F8).
    document.addEventListener('click', function (event) {
      var target = event.target;
      var add = target && target.closest && target.closest('[data-add]');
      if (add) openDishById(add.getAttribute('data-add'));
    });
    cartBar.addEventListener('click', function () { refresh().then(function () { openCart(); }); });
    closer.addEventListener('click', closeSheet);
    sheet.addEventListener('click', function (event) { if (event.target === sheet) closeSheet(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !sheet.hidden) closeSheet(); });

    refresh().then(paintBar);
    paintBar();
  }

  /* Calling a waiter, or asking for the bill (phase Q8). Two buttons in the
     dock, drawn by the server with their words; the script greys the one whose
     call is live and says above them what happened to it. A call lives fifteen
     minutes on the server; the phone asks after it every few seconds only while
     one is live and the page is in front of the guest. */
  var callUrl = document.body.getAttribute('data-call-url');
  if (callUrl) initCall(callUrl);

  /* Feedback (phase F3). One tap on a face is already feedback; the chips, the
     words and the phone unfold under it on the same sheet. Sent once per
     sheet (`client_uuid` made when it opens), remembered in sessionStorage so
     a reopened page shows «Дякуємо» instead of asking twice. The Google link
     after sending goes to EVERYONE, whatever the score — Google's policy for
     asking reviews, and honest. Nothing here is owner text except the link,
     which goes into an href property, never into markup. */
  var feedbackUrl = document.body.getAttribute('data-feedback-url');
  if (feedbackUrl) {
    initFeedback(feedbackUrl, document.body.getAttribute('data-feedback-google'), document.body.getAttribute('data-feedback-dishes-url'));
  }

  function initFeedback(endpoint, googleUrl, dishesUrl) {
    var sheet = document.querySelector('[data-feedback-sheet]');
    var form = document.querySelector('[data-feedback-form]');
    var closer = document.querySelector('[data-feedback-close]');
    var more = document.querySelector('[data-fb-more]');
    var question = document.querySelector('[data-fb-q]');
    var comment = document.querySelector('[data-fb-comment]');
    var phoneToggle = document.querySelector('[data-fb-phone-toggle]');
    var phoneLabel = document.querySelector('[data-fb-phone]');
    var phoneInput = document.querySelector('[data-fb-phone-input]');
    var honeypot = document.querySelector('[data-fb-hp]');
    var errorBox = document.querySelector('[data-fb-error]');
    var send = document.querySelector('[data-fb-send]');
    var done = document.querySelector('[data-fb-done]');
    var faces = Array.prototype.slice.call(document.querySelectorAll('[data-feedback-sheet] .fb-face'));
    var tagSets = { good: document.querySelector('[data-fb-tags="good"]'), bad: document.querySelector('[data-fb-tags="bad"]') };
    var openers = Array.prototype.slice.call(document.querySelectorAll('[data-feedback-open]'));
    var dishesBox = document.querySelector('[data-fb-dishes]');
    var dishList = document.querySelector('[data-fb-dish-list]');
    var thumbTemplates = {
      up: document.querySelector('template[data-fb-thumb="up"]'),
      down: document.querySelector('template[data-fb-thumb="down"]')
    };
    var dishesLoaded = false;
    if (!sheet || !form || !closer || !more || !question || !send || !done || !faces.length || !tagSets.good || !tagSets.bad) return;

    var REMEMBER_MS = 2 * 60 * 60 * 1000;   // a second visit the same evening is still the same visit
    var STORE_KEY = 'menu-feedback';
    var params = new URLSearchParams(window.location.search);
    var query = '?t=' + encodeURIComponent(params.get('t') || '') + '&k=' + encodeURIComponent(params.get('k') || '');
    var uuid = null;
    var score = 0;
    var source = 'menu';
    var busy = false;

    function node(tag, className, text) {
      var el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = text;
      return el;
    }
    function newUuid() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      var bytes = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }
    function remembered() {
      try {
        var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
        if (saved && saved.uuid && Date.now() - Number(saved.at || 0) < REMEMBER_MS) return saved;
      } catch (e) { /* storage blocked: ask again */ }
      return null;
    }
    function remember(view) {
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ uuid: view.uuid, score: view.score, at: Date.now() })); } catch (e) { /* fine */ }
    }
    function showError(message) {
      if (!errorBox) return;
      errorBox.textContent = message || '';
      errorBox.hidden = !message;
    }

    /* The dishes of the bill (phase F5): fetched once the sheet opens, a row
       each with 👍/👎 — names put in with textContent, the thumbs cloned from
       the page's own templates. Nothing shown without a keyed table or a bill. */
    function loadDishes() {
      if (!dishesUrl || dishesLoaded || !dishesBox || !dishList) return;
      dishesLoaded = true;
      fetch(dishesUrl + query, { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
          if (!data || !data.dishes || !data.dishes.length) return;
          dishList.textContent = '';
          data.dishes.forEach(function (dish) {
            var row = node('li', 'fb-dish');
            row.setAttribute('data-bill-item', String(dish.bill_item_id));
            var name = node('span', 'fb-dish-name', dish.name);
            if (dish.caption) name.appendChild(node('small', null, dish.caption));
            row.appendChild(name);
            ['up', 'down'].forEach(function (verdict) {
              var button = node('button', 'fb-thumb');
              button.type = 'button';
              button.setAttribute('data-verdict', verdict);
              button.setAttribute('aria-pressed', 'false');
              button.setAttribute('aria-label', (verdict === 'up' ? 'Сподобалось: ' : 'Не сподобалось: ') + dish.name);
              var template = thumbTemplates[verdict];
              if (template && template.content) button.appendChild(template.content.cloneNode(true));
              else button.textContent = verdict === 'up' ? '+' : '−';
              button.addEventListener('click', function () {
                var on = !button.classList.contains('on');
                Array.prototype.forEach.call(row.querySelectorAll('.fb-thumb'), function (other) {
                  other.classList.remove('on');
                  other.setAttribute('aria-pressed', 'false');
                });
                button.classList.toggle('on', on);
                button.setAttribute('aria-pressed', on ? 'true' : 'false');
              });
              row.appendChild(button);
            });
            dishList.appendChild(row);
          });
          dishesBox.hidden = false;
        })
        .catch(function () { /* offline or no bill: the sheet works without the list */ });
    }
    function chosenItems() {
      if (!dishList) return [];
      return Array.prototype.slice.call(dishList.querySelectorAll('.fb-thumb.on')).map(function (button) {
        return { bill_item_id: Number(button.parentNode.getAttribute('data-bill-item')), verdict: button.getAttribute('data-verdict') };
      });
    }

    function chosenTags() {
      var set = score >= 4 ? tagSets.good : tagSets.bad;
      return Array.prototype.slice.call(set.querySelectorAll('.fb-tag.on')).map(function (b) { return b.getAttribute('data-tag'); });
    }

    function pick(next) {
      score = next;
      faces.forEach(function (face) {
        var mine = Number(face.getAttribute('data-score')) === next;
        face.classList.toggle('on', mine);
        face.classList.toggle('dim', !mine);
        face.setAttribute('aria-checked', mine ? 'true' : 'false');
      });
      var good = next >= 4;
      question.textContent = good ? 'Що сподобалось?' : 'Що пішло не так?';
      tagSets.good.hidden = !good;
      tagSets.bad.hidden = good;
      // A chip ticked for the other mood is not an answer to this question.
      Array.prototype.forEach.call((good ? tagSets.bad : tagSets.good).querySelectorAll('.fb-tag.on'), function (b) { b.classList.remove('on'); });
      more.hidden = false;
      send.disabled = false;
      showError('');
    }

    /* «Дякуємо» in place of the form: the Google link for everyone (when the
       owner gave one), and for a low score the promise that the owner reads it. */
    function finish(view, phoneGiven) {
      form.hidden = true;
      done.textContent = '';
      done.appendChild(node('h3', null, 'Дякуємо!'));
      if (view.score <= 3) {
        done.appendChild(node('p', null, phoneGiven ? 'Власник прочитає це сьогодні — і зателефонує.' : 'Власник прочитає це сьогодні.'));
      } else {
        done.appendChild(node('p', null, 'Нам приємно. Гарного дня!'));
      }
      if (googleUrl && /^https:\/\//.test(googleUrl)) {
        var link = node('a', 'primary', 'Поділитись у Google');
        link.href = googleUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        done.appendChild(link);
        done.appendChild(node('p', null, 'Відгук у Google бачать усі — лишіть його, якщо хочете.'));
      }
      done.hidden = false;
      openers.forEach(function (button) {
        if (button.classList.contains('fb-bar')) { button.textContent = 'Дякуємо за відгук!'; button.classList.add('done'); button.disabled = true; }
      });
      var ask = document.querySelector('[data-ask]');
      if (ask) {
        ask.classList.add('done');
        var heading = ask.querySelector('h2');
        if (heading) heading.textContent = 'Дякуємо за відгук!';
        var line = ask.querySelector('p');
        if (line) line.textContent = 'Власник його прочитає.';
      }
    }

    function submit(event) {
      if (event) event.preventDefault();
      if (busy || !score) return;
      busy = true;
      send.disabled = true;
      showError('');
      var phone = phoneInput && !phoneLabel.hidden ? phoneInput.value.trim() : '';
      var body = {
        client_uuid: uuid,
        score: score,
        tags: chosenTags(),
        comment: comment ? comment.value : '',
        phone: phone || null,
        source: source,
        items: chosenItems(),
        website: honeypot ? honeypot.value : ''
      };
      fetch(endpoint + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) { return { status: response.status, data: data }; });
        })
        .then(function (answer) {
          busy = false;
          if (answer.status === 200 || answer.status === 201) {
            remember(answer.data);
            finish(answer.data, Boolean(phone));
            return;
          }
          send.disabled = false;
          if (answer.status === 429 || answer.status === 400) showError(answer.data.error || 'Не вдалося надіслати.');
          else if (answer.status === 404) showError('Відгуки зараз не приймаються.');
          else showError('Не вдалося надіслати. Спробуйте ще раз.');
        })
        .catch(function () {
          busy = false;
          send.disabled = false;
          showError('Немає зв’язку. Спробуйте ще раз.');
        });
    }

    function open(event) {
      var from = event && event.target && event.target.closest ? event.target.closest('[data-feedback-open]') : null;
      source = from && from.getAttribute('data-feedback-source') === 'bill' ? 'bill' : 'menu';
      if (!uuid) uuid = newUuid();
      sheet.hidden = false;
      document.body.classList.add('bill-open');
      loadDishes();
      var saved = remembered();
      if (saved && done.hidden) {
        // Already sent this visit: confirm with the server, then say thanks again.
        fetch(endpoint + '/' + encodeURIComponent(saved.uuid), { cache: 'no-store', headers: { Accept: 'application/json' } })
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (view) { if (view) finish(view, false); })
          .catch(function () { /* offline: the form stays usable */ });
      }
      closer.focus();
    }
    function close() {
      sheet.hidden = true;
      document.body.classList.remove('bill-open');
    }

    faces.forEach(function (face) {
      face.addEventListener('click', function () { pick(Number(face.getAttribute('data-score'))); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-feedback-sheet] .fb-tag'), function (chip) {
      chip.addEventListener('click', function () { chip.classList.toggle('on'); });
    });
    if (phoneToggle && phoneLabel) {
      phoneToggle.addEventListener('click', function () {
        phoneLabel.hidden = false;
        phoneToggle.hidden = true;
        if (phoneInput) phoneInput.focus();
      });
    }
    form.addEventListener('submit', submit);
    openers.forEach(function (button) { button.addEventListener('click', open); });
    closer.addEventListener('click', close);
    sheet.addEventListener('click', function (event) { if (event.target === sheet) close(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !sheet.hidden) close(); });
    // The QR «Оцініть нас» on the pre-bill and the receipt (phase F7) lands
    // here with «#feedback»: the guest scanned it to rate, so the sheet opens
    // at once rather than making them find the button. A remembered visit
    // still shows «Дякуємо» — `open` checks that itself.
    if (window.location.hash === '#feedback') open(null);
  }

  function initCall(endpoint) {
    var params = new URLSearchParams(window.location.search);
    var query = '?t=' + encodeURIComponent(params.get('t') || '') + '&k=' + encodeURIComponent(params.get('k') || '');
    var row = document.querySelector('[data-call-row]');
    var status = document.querySelector('[data-call-status]');
    var buttons = document.querySelectorAll('[data-call]');
    if (!row || !status || !buttons.length) return;

    var CALL_POLL_MS = 8000;
    var SHOWN_MS = 5 * 60 * 1000;          // how long «Офіціант іде» stays after the answer
    var TTL_MS = 15 * 60 * 1000;           // the server's life of a call (CALL_TTL_MINUTES)
    var WORDS = {
      waiter: {
        pending: 'Офіціанта покликано',
        answered: 'Офіціант іде',
        expired: 'Офіціант не підійшов — покличте ще раз'
      },
      bill: {
        pending: 'Рахунок попросили',
        answered: 'Офіціант несе рахунок',
        expired: 'Рахунок не принесли — попросіть ще раз'
      }
    };
    var calls = {};                        // kind -> what the server last said
    var busy = {};                         // kind -> a request in flight
    var message = '';

    function node(tag, className, text) {
      var el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = text;
      return el;
    }
    function age(iso) {
      var at = Date.parse(iso || '');
      return isNaN(at) ? Infinity : Date.now() - at;
    }
    /* What is worth saying about a kind now: a live call, a fresh answer, a
       call that has just run out. An old answer or a cancelled call says nothing. */
    function shown(view) {
      if (!view) return null;
      if (view.status === 'pending') return 'pending';
      if (view.status === 'answered' && age(view.answered_at) < SHOWN_MS) return 'answered';
      if (view.status === 'expired' && age(view.created_at) < TTL_MS + SHOWN_MS) return 'expired';
      return null;
    }
    function anyPending() {
      return Object.keys(calls).some(function (kind) { return calls[kind] && calls[kind].status === 'pending'; });
    }

    function paint() {
      status.textContent = '';
      ['waiter', 'bill'].forEach(function (kind) {
        var state = shown(calls[kind]);
        if (!state) return;
        var line = node('div', 'call-line ' + state);
        line.appendChild(node('b', null, WORDS[kind][state]));
        if (state === 'pending') {
          var cancel = node('button', 'link-btn', 'Скасувати');
          cancel.type = 'button';
          cancel.addEventListener('click', function () { cancelCall(kind); });
          line.appendChild(cancel);
        }
        status.appendChild(line);
      });
      if (message) status.appendChild(node('p', 'call-error', message));
      status.hidden = status.childNodes.length === 0;
      for (var i = 0; i < buttons.length; i += 1) {
        var kind = buttons[i].getAttribute('data-call');
        var live = calls[kind] && calls[kind].status === 'pending';
        buttons[i].classList.toggle('on', !!live);
        buttons[i].disabled = !!live || !!busy[kind];
      }
    }

    function remember(list) {
      calls = {};
      list.forEach(function (view) { calls[view.kind] = view; });
    }

    /* Switched off, or this QR is not the table's: the buttons go, and the
       guest is told once to wave instead. */
    function gone() {
      row.hidden = true;
      calls = {};
      message = 'Виклик з телефону зараз недоступний — покличте офіціанта жестом.';
      paint();
    }

    function load() {
      return fetch(endpoint + query, { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) {
          if (response.status === 404) { gone(); return null; }
          return response.ok ? response.json() : null;
        })
        .then(function (data) { if (data && data.calls) { remember(data.calls); paint(); } })
        .catch(function () { /* offline: keep what is on screen */ });
    }

    function call(kind) {
      if (busy[kind]) return;
      busy[kind] = true;
      message = '';
      paint();
      fetch(endpoint + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ kind: kind })
      })
        .then(function (response) {
          return response.json().then(function (data) { return { status: response.status, data: data }; }, function () { return { status: response.status, data: null }; });
        })
        .then(function (result) {
          busy[kind] = false;
          if (result.status === 201 || result.status === 200) {
            calls[kind] = result.data;
          } else if (result.status === 404) {
            return gone();
          } else {
            message = result.data && result.data.error ? result.data.error : 'Не вдалося покликати. Спробуйте ще раз.';
          }
          paint();
        })
        .catch(function () {
          busy[kind] = false;
          // A second tap is safe: the server keeps one live call per table and kind.
          message = 'Немає зв’язку. Спробуйте ще раз.';
          paint();
        });
    }

    function cancelCall(kind) {
      fetch(endpoint + '/' + encodeURIComponent(kind) + '/cancel' + query, { method: 'POST' })
        .then(function () { return load(); })
        .catch(function () { /* offline: the call stays as it was */ });
    }

    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', function (event) {
        call(event.currentTarget.getAttribute('data-call'));
      });
    }
    // Every tick repaints, so «Офіціант іде» leaves on its own; only a live
    // call costs a request.
    window.setInterval(function () {
      if (document.hidden) return;
      if (anyPending()) load(); else paint();
    }, CALL_POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Object.keys(calls).length) load();
    });
    // A guest who reloads the page still sees the call they made.
    load();
  }

  /* The tab that matches the section in view. */
  var links = document.querySelectorAll('.tabs a');
  if (links.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (document.body.getAttribute('data-view') === 'fav') return; // the «Обрані» tab stays lit
        for (var k = 0; k < links.length; k += 1) {
          links[k].classList.toggle('on', links[k].getAttribute('href') === '#' + entry.target.id);
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.cat').forEach(function (section) { observer.observe(section); });
  }
})();
