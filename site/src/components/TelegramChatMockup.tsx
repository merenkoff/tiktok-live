interface Bubble {
  from: 'bot' | 'user';
  text: string;
}

// Steps mirror the real flow in src/telegram.ts (name → phone → city →
// branch → order created), localized to match the rest of the site.
const BUBBLES: Bubble[] = [
  { from: 'bot', text: 'Бронь на товар A12, розмір 104 створена ✅ Введіть ваше ім’я:' },
  { from: 'user', text: 'Оля' },
  { from: 'bot', text: '📞 Введіть номер телефону:' },
  { from: 'user', text: '+380 67 123 45 67' },
  { from: 'bot', text: '🏙️ Оберіть місто доставки та відділення Нової Пошти' },
  { from: 'user', text: 'Київ, відділення №42' },
  { from: 'bot', text: 'Замовлення №1042 створено. Очікуємо підтвердження оплати — ТТН надішлемо сюди ж 💬' },
];

export function TelegramChatMockup() {
  return (
    <div className="rounded-card border border-line bg-paper shadow-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#229ED9] text-white">
        <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center text-sm font-bold">L</div>
        <div>
          <p className="text-sm font-semibold leading-tight">LiveShop Bot</p>
          <p className="text-[11px] text-white/80 leading-tight">онлайн</p>
        </div>
      </div>
      <div className="p-4 space-y-2.5 bg-[#E7EBF0] min-h-[280px]">
        {BUBBLES.map((b, i) => (
          <div key={i} className={`flex ${b.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                b.from === 'user' ? 'bg-[#229ED9] text-white rounded-br-sm' : 'bg-white text-ink rounded-bl-sm'
              }`}
            >
              {b.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
