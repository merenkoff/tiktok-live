# Railway: підняти POS (каса одягу)

POS ділить **той самий Postgres**, що й LIVE API. UI каси — окремий сервіс (як admin), API — існуючий backend на порті `PORT`.

## Архітектура

```
[POS UI service]  --HTTPS-->  [API service]/api/pos + /pos-uploads
       |                              |
   custom domain                 custom domain / railway.app
                                      |
                               [Postgres plugin]
```

Таблиці: `pos_*` (міграції `002`, `003`). Фото: `data/pos-uploads` на **API**-сервісі.

## 1. API service (існуючий)

Після цього деплою Dockerfile:

- копіює `migrations/`
- на старті: `node dist/pos/migrate.js && node dist/index.js` (idempotent)

### Env (Variables)

| Variable | Значення |
|----------|----------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (якщо ще не стоїть) |
| `DB_SSL` | `true` (зазвичай потрібно для Railway Postgres) |
| `CORS_ORIGINS` | повний URL POS UI **без** слеша в кінці, кілька через кому. Приклад: `https://pos-xxx.up.railway.app,https://kasa.yourdomain.com` |
| `NODE_ENV` | `production` |

Решту LIVE-змінних не чіпай.

### Volume (фото товарів)

Без volume файли зникнуть після redeploy:

1. API service → **Settings → Volumes**
2. Mount path: `/app/data/pos-uploads`
3. Redeploy API

### Перевірка API

```bash
curl -s https://<API_HOST>/health
curl -s -X POST https://<API_HOST>/api/pos/auth/staff/pin \
  -H 'content-type: application/json' \
  -d '{"store_slug":"demo","pin":"1234"}'
```

Якщо міграції пройшли, PIN demo відповість токеном (або 401 якщо seed не робили).

### Seed демо (опційно, один раз)

One-off на API service (Railway shell / one-off run), з тим самим `DATABASE_URL`:

```bash
node -e "console.log('use local: npm run pos:seed')"
```

Локально проти Railway DB небезпечно; краще:

```bash
# у контейнері API після migrate, якщо seed зібраний у dist:
node dist/pos/seed.js
```

Якщо `dist/pos/seed.js` немає в образі — запусти seed локально з `DATABASE_URL` з Railway (обережно) або додай seed у CI окремо. Демо після seed: store `demo`, PIN продавця `1234`, owner `owner@demo.shop` / `owner123`.

## 2. Новий сервіс POS UI

1. **New Service** → Deploy from GitHub repo `tiktok-live`
2. Root Directory: **`pos`**
3. Builder: Dockerfile (`pos/Dockerfile`)
4. **Build Arg** (обов’язково):

   | Name | Value |
   |------|--------|
   | `VITE_API_BASE` | публічний URL API, напр. `https://creative-trust-….up.railway.app` |

   У Vite це bake-in на етапі `npm run build`. Після зміни URL — **Rebuild**.

5. Generate domain або свій домен (каса).
6. Додай цей HTTPS origin у `CORS_ORIGINS` на API → Redeploy API.

## 3. Чеклист

- [ ] API задеплоєний з новим Dockerfile (migrate на старті)
- [ ] `CORS_ORIGINS` містить URL каси
- [ ] POS service Root Directory = `pos`, build arg `VITE_API_BASE` = URL API
- [ ] Volume `/app/data/pos-uploads` на API
- [ ] Відкривається каса → логін PIN → каталог
- [ ] Завантаження фото в адмінці POS зберігається після redeploy (volume)

## Локально (нагадування)

```bash
npm run pos:migrate && npm run pos:seed
npm run dev                 # API :3000
cd pos && npm run dev       # UI :3002
```

## Troubleshooting

| Симптом | Що перевірити |
|---------|----------------|
| CORS error у браузері | `CORS_ORIGINS` = точний origin каси (`https://…` без `/`) + redeploy API |
| API 404 на `/api/pos` | старий деплой без `src/pos`; потрібен цей коміт |
| Фото 404 | volume + API віддає `/pos-uploads/`; `VITE_API_BASE` на UI |
| Порожня каса / login fail | migrate + seed; ті самі Postgres credentials |
| `VITE_API_BASE` не діє | змінна має бути **Docker build arg**, не лише runtime env |
