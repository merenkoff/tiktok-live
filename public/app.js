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
