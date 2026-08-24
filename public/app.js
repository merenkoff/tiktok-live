function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');

  if (digits.length < 10) return null;

  if (digits.startsWith('380') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('80') && digits.length === 11) {
    return `+3${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+38${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

function showMessage(form, text, type) {
  const el = form.querySelector('.lead-form__message');
  if (!el) return;

  el.textContent = text;
  el.hidden = false;
  el.classList.remove('lead-form__message--success', 'lead-form__message--error');
  el.classList.add(type === 'success' ? 'lead-form__message--success' : 'lead-form__message--error');
}

async function submitLead(form) {
  const phoneInput = form.querySelector('[name="phone"]');
  const nameInput = form.querySelector('[name="name"]');
  const btn = form.querySelector('[type="submit"]');

  const phone = normalizePhone(phoneInput.value.trim());
  if (!phone) {
    showMessage(form, 'Введіть коректний номер, наприклад +380 XX XXX XX XX', 'error');
    phoneInput.focus();
    return;
  }

  btn.disabled = true;
  showMessage(form, 'Надсилаємо…', 'success');

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        name: nameInput?.value.trim() || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Помилка відправки');
    }

    showMessage(form, 'Дякуємо! Ми зателефонуємо найближчим часом 📞', 'success');
    form.reset();
  } catch (err) {
    showMessage(form, err.message || 'Щось пішло не так. Спробуйте ще раз.', 'error');
  } finally {
    btn.disabled = false;
  }
}

document.querySelectorAll('.lead-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitLead(form);
  });
});

function initLiveFeedScroll() {
  const track = document.getElementById('liveFeed');
  if (!track) return;

  const comments = [...track.querySelectorAll('.live-comment')];
  if (comments.length < 2) return;

  const clone = comments.map((c) => c.cloneNode(true));
  clone.forEach((c) => track.appendChild(c));

  const itemHeight = comments[0].offsetHeight + 8;
  const loopHeight = itemHeight * comments.length;
  let offset = 0;

  setInterval(() => {
    offset += 1;
    if (offset >= loopHeight) offset = 0;
    track.style.transform = `translateY(-${offset}px)`;
  }, 40);
}

function initStickyCta() {
  const sticky = document.getElementById('stickyCta');
  const hero = document.querySelector('.hero');
  if (!sticky || !hero) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      sticky.classList.toggle('is-visible', !entry.isIntersecting);
    },
    { threshold: 0 }
  );
  observer.observe(hero);
}

function initReveal() {
  const targets = document.querySelectorAll(
    '.proof__metric, .before-after__col, .live-demo__step, .feature-row, .faq__item, .audience__quote'
  );
  targets.forEach((el) => el.classList.add('reveal'));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach((el) => observer.observe(el));
}

function initParallax() {
  const visual = document.querySelector('.hero__visual');
  if (!visual || window.matchMedia('(max-width: 1024px)').matches) return;

  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 12;
    const y = (e.clientY / window.innerHeight - 0.5) * 8;
    visual.style.transform = `translate(${x}px, ${y}px)`;
  });
}

function initDownloadOsDetect() {
  const cards = document.querySelectorAll('.download-card');
  if (!cards.length) return;

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  let os = null;

  if (/Win/i.test(platform) || /Windows/i.test(ua)) {
    os = 'windows';
  } else if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
    os = 'mac';
  } else if (/Linux/i.test(platform) && !/Android/i.test(ua)) {
    os = 'linux';
  }

  if (!os) return;

  cards.forEach((card) => {
    if (card.dataset.os === os) {
      card.classList.add('is-recommended');
      const badge = document.createElement('span');
      badge.className = 'download-card__badge';
      badge.textContent = 'Рекомендовано для твоєї ОС';
      card.insertBefore(badge, card.firstChild);
    }
  });
}

initLiveFeedScroll();
initStickyCta();
initReveal();
initParallax();
initDownloadOsDetect();
