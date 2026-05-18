# 🎯 Multi-User Platform - Implementation Checklist

## ✅ Вже Завершено

- [x] Database schema дизайн
- [x] TypeScript типи
- [x] Users Service
- [x] Sessions Service
- [x] Sessions Manager
- [x] Auth middleware (TikTok username)
- [x] Оновлена api.ts (без видалення реклами)
- [x] WebSocket для live logs
- [x] API endpoints для multi-user

---

## 🔜 Наступні Кроки

### Phase 1: Database Setup (30 хв)

**Файл:** `REFACTORING_GUIDE.md` містить SQL скрипти

```bash
# 1. Запустити SQL міграції в PostgreSQL
psql -U postgres -d tiktok_live < migrations.sql

# 2. Перевірити таблиці
psql -U postgres -d tiktok_live -c "\\dt"
```

### Phase 2: Backend Integration (2 години)

**Завдання:**

1. **Оновити `index.ts`** для нової архітектури
   ```typescript
   // src/index.ts
   import { setupWebSocket } from './api/websocket.js';
   import { sessionManager } from './sessions/sessions.manager.js';
   
   // Викликати setupWebSocket перед стартом
   await setupWebSocket(fastify);
   ```

2. **Оновити TikTok manager** для multi-user
   - Замість глобального `getTikTokManager()`
   - Використовуйте per-user інстанси через sessionManager

3. **Оновити Telegram bot** для multi-user
   - Для кожного користувача окремий бот екземпляр
   - Використовувати `settings.telegram_bot_token`

4. **Інтегрувати logging** до session_logs
   ```typescript
   // Замість логування в консоль
   await sessionManager.addLog(userId, 'tiktok_comment', message, data);
   ```

### Phase 3: Admin Panel (React) (3-4 години)

**Структура:**

```bash
# 1. Ініціалізувати React проект
npm create vite@latest admin -- --template react-ts
cd admin

# 2. Встановити залежності
npm install @tanstack/react-query zustand tailwindcss

# 3. Структура компонентів
mkdir -p src/{pages,components,hooks,services,types}
```

**Файли для створення:**

1. **`src/types/index.ts`** - API типи
2. **`src/services/api.ts`** - API клієнт
3. **`src/services/websocket.ts`** - WebSocket клієнт
4. **`src/hooks/useAuth.ts`** - Auth hook
5. **`src/pages/LoginPage.tsx`** - Login форма
6. **`src/pages/SettingsPage.tsx`** - Налаштування
7. **`src/pages/SessionPage.tsx`** - Control Panel
8. **`src/components/LiveLogs.tsx`** - WebSocket logs

### Phase 4: Docker Setup (30 хв)

**Оновити `docker-compose.yml`:**

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - '3000:3000'
    depends_on:
      - postgres
      - redis
    environment:
      DB_HOST: postgres
      REDIS_HOST: redis
      NODE_ENV: production

  admin:
    build: ./admin
    ports:
      - '3001:3000'
    depends_on:
      - api

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: tiktok_live
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

---

## 📋 Детальні Задачі

### Task 1: Per-User TikTok Instance

**Файл:** `src/tiktok/tiktok.instance.ts`

```typescript
export class TikTokInstance extends EventEmitter {
  private userId: number;
  private settings: UserSettings;
  
  constructor(userId: number, settings: UserSettings) {
    super();
    this.userId = userId;
    this.settings = settings;
    // TikTok username з settings
  }
  
  async connect(): Promise<void> {
    // Підключитись до TikTok LIVE
  }
  
  private async handleComment(data: any): Promise<void> {
    // Логувати в sessionManager.addLog()
    await sessionManager.addLog(this.userId, 'tiktok_comment', data.comment, { uniqueId: data.uniqueId });
  }
}
```

### Task 2: Per-User Telegram Bot

**Файл:** `src/telegram/telegram.instance.ts`

```typescript
export class TelegramInstance {
  private userId: number;
  private bot: Telegraf;
  
  constructor(userId: number, settings: UserSettings) {
    this.userId = userId;
    this.bot = new Telegraf(settings.telegram_bot_token);
  }
  
  async start(): Promise<void> {
    this.bot.launch();
    // Логувати Telegram messages в sessionManager.addLog()
  }
}
```

### Task 3: Session Startup Logic

**Файл:** `src/sessions/sessions.startup.ts`

```typescript
export async function startUserSession(userId: number): Promise<void> {
  const activeSession = await sessionManager.startSession(userId);
  
  // 1. Підключити TikTok
  const tiktokInstance = new TikTokInstance(userId, activeSession.settings);
  sessionManager.setTikTokManager(userId, tiktokInstance);
  await tiktokInstance.connect();
  
  // 2. Запустити Telegram бот
  const telegramInstance = new TelegramInstance(userId, activeSession.settings);
  sessionManager.setTelegramManager(userId, telegramInstance);
  await telegramInstance.start();
  
  // 3. Логувати початок
  await sessionManager.addLog(
    userId, 
    'info', 
    'Session started',
    { tiktokUsername: activeSession.settings.tiktok_username }
  );
}
```

### Task 4: React Login Page

**Файл:** `admin/src/pages/LoginPage.tsx`

```typescript
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktok_username: username })
      });
      
      const { token, user } = await response.json();
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      navigate('/settings');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-lg w-96">
        <h1 className="text-3xl font-bold mb-6 text-center">TikTok LIVE</h1>
        <h2 className="text-xl text-gray-600 mb-6 text-center">Automation Platform</h2>
        
        <input
          type="text"
          placeholder="TikTok Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
```

### Task 5: React Session Control Page

**Файл:** `admin/src/pages/SessionPage.tsx`

```typescript
export function SessionPage() {
  const [session, setSession] = useState(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  
  // 1. При завантаженні сторінки
  useEffect(() => {
    // Отримати поточну сесію
    // Підключитись до WebSocket
    const wsUrl = `ws://localhost:3000/api/sessions/logs/stream?token=${token}`;
    const websocket = new WebSocket(wsUrl);
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        setLogs(prev => [...prev, data.log].slice(-1000));
      }
    };
    
    setWs(websocket);
  }, []);
  
  const handleStart = async () => {
    await fetch('/api/sessions/start', { method: 'POST' });
  };
  
  const handleStop = async () => {
    await fetch('/api/sessions/stop', { method: 'POST' });
  };
  
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Live Session</h1>
      
      {session ? (
        <div className="space-y-6">
          <div className="flex gap-4">
            <button onClick={handleStop} className="bg-red-500 text-white px-6 py-2 rounded">
              ■ Stop Session
            </button>
            <span className="text-lg">Duration: {duration}</span>
          </div>
          
          <div className="border rounded-lg p-4 h-96 overflow-y-auto bg-gray-50">
            {logs.map((log, i) => (
              <div key={i} className="text-sm mb-2 font-mono">
                <span className="text-gray-500">{format(log.created_at)}</span>
                <span className="ml-2 font-bold">[{log.log_type}]</span>
                <span className="ml-2">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={handleStart} className="bg-green-500 text-white px-6 py-2 rounded">
          ▶ Start Session
        </button>
      )}
    </div>
  );
}
```

---

## 🚀 Deployment Checklist

- [ ] Database migrations виконані
- [ ] Backend контролери інтегровані
- [ ] TikTok per-user instances працюють
- [ ] Telegram per-user bots працюють
- [ ] WebSocket live logs працюють
- [ ] React admin panel побудований
- [ ] Docker images створені
- [ ] docker-compose.yml налаштований
- [ ] Production SSL/HTTPS налаштовано
- [ ] Monitoring & logging налаштовано

---

## 📞 Support

Якщо у вас виникнуть питання під час реалізації:
1. Перевірте логи: `docker-compose logs -f`
2. Тестуйте API: `curl http://localhost:3000/api/auth/login`
3. Перевірте WebSocket: Open DevTools → Console

---

## Summary

Ви маєте:
✅ Повну архітектуру
✅ Готові backend сервіси
✅ API endpoints
✅ WebSocket інфраструктуру
✅ SQL дизайн

Залишилось:
🔜 Інтегрувати все разом
🔜 Побудувати React Admin Panel
🔜 Тестувати End-to-End
🔜 Деплойнути

**Готові до реалізації? Дайте знак! 🚀**
