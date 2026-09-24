import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { AppIcon } from '../components/AppIcon';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="home" />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 pt-24 pb-24 text-center">
          <AppIcon size={96} className="mx-auto drop-shadow-[0_10px_18px_rgba(0,30,80,0.18)]" />
          <p className="tabular-nums text-7xl font-bold text-faint tracking-tight mt-8">404</p>
          <h1 className="h-section mt-3">
            Сторінку не знайдено
          </h1>
          <p className="text-muted mt-4 leading-relaxed">
            Можливо, посилання застаріло або в адресі помилка. Ось куди можна піти звідси:
          </p>
          <nav className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="/" className="btn-quiet">
              Головна
            </a>
            <a href="/pos" className="btn-pos">
              POS каса
            </a>
            <a href="/live" className="btn-live">
              TikTok LIVE
            </a>
            <a href="/dovidka" className="btn-quiet">
              Довідка
            </a>
          </nav>
        </section>
      </main>

      <Footer />
    </div>
  );
}
