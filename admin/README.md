// admin/README.md

# Admin Panel - TikTok LIVE Automation Platform

## Структура проекту

```
admin/
├── public/
│   └── index.html
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── SessionPage.tsx
│   │   └── NotFound.tsx
│   ├── components/
│   │   ├── LoginForm.tsx
│   │   ├── SettingsForm.tsx
│   │   ├── SessionControl.tsx
│   │   ├── LiveLogs.tsx
│   │   └── Header.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useSettings.ts
│   │   ├── useSession.ts
│   │   └── useLogs.ts
│   ├── services/
│   │   ├── api.ts
│   │   └── websocket.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Технологія

- React 18
- TypeScript
- Vite
- TanStack Query (React Query)
- Zustand (State Management)
- Tailwind CSS
- WebSocket для live logs

## Setup

```bash
npm create vite@latest admin -- --template react-ts
cd admin
npm install
npm run dev
```

## Key Features

### 1. Login Page
```
Вхід через TikTok Username (без паролю)
```

### 2. Settings Page
```
Telegram Bot Token
Telegram Channel ID
Nova Poshta API Key
Merchant Name
Reservation Timeout
```

### 3. Session Control Page
```
Start/Stop кнопки
Live Logs (WebSocket)
Order Counter
Revenue Display
```

### 4. Live Logs Display
```
Real-time messages
Filtering by type
Auto-scroll
Timestamp display
```

## API Integration

Base URL: `http://localhost:3000`

### Auth
```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Settings
```
GET  /api/settings
PUT  /api/settings
POST /api/settings/test-telegram
```

### Sessions
```
POST /api/sessions/start
POST /api/sessions/stop
GET  /api/sessions/current
GET  /api/sessions/logs?limit=100
WS   /api/sessions/logs/stream?token=...
```

## WebSocket Connection

```typescript
const ws = new WebSocket(
  `ws://localhost:3000/api/sessions/logs/stream?token=${token}`
);

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  // Handle: initial, log, connected, sessionStarted, sessionStopped
});
```

## Next Steps

1. Setup React project with Vite
2. Create Auth context
3. Build login page
4. Create settings form
5. Build session control with live logs
6. Connect WebSocket for real-time updates

---

## Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "run", "preview"]
```
