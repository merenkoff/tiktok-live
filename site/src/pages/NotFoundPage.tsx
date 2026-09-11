import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="home" />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 pt-24 pb-24 text-center">
          <p className="font-mono text-7xl font-bold text-muted tracking-tight">404</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-4">
            Сторінку не знайдено
          </h1>
          <p className="text-muted mt-4 leading-relaxed">
            Можливо, посилання застаріло або в адресі помилка. Ось куди можна піти звідси:
          </p>
          <nav className="mt-8 flex flex-wrap justify-center gap-3 text-sm font-semibold">
            <a href="/" className="border border-line hover:border-ink transition-colors px-5 py-3 rounded-full">
              Головна
            </a>
            <a href="/pos" className="bg-pos hover:bg-pos-press transition-colors text-white px-5 py-3 rounded-full">
              POS каса
            </a>
            <a href="/live" className="bg-live hover:bg-live-press transition-colors text-white px-5 py-3 rounded-full">
              TikTok LIVE
            </a>
            <a href="/dovidka" className="border border-line hover:border-ink transition-colors px-5 py-3 rounded-full">
              Довідка
            </a>
          </nav>
        </section>
      </main>

      <Footer />
    </div>
  );
}
