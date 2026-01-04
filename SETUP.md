# Инструкция по установке и запуску

## Требования

- Node.js (версия 16 или выше)
- MongoDB (локально или MongoDB Atlas)
- npm или yarn

## Установка

1. Установите все зависимости:
```bash
npm run install-all
```

Или вручную:
```bash
npm install
cd server && npm install
cd ../client && npm install
```

2. Настройте переменные окружения для сервера:

Создайте файл `server/.env` на основе `server/.env.example`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/zvon
JWT_SECRET=your-secret-key-change-this-in-production-make-it-long-and-random
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

**Важно:** Измените `JWT_SECRET` на случайную строку для безопасности!

3. Убедитесь, что MongoDB запущен:
- Если используете локальный MongoDB, запустите его
- Если используете MongoDB Atlas, укажите URI в `.env`

4. Создайте директорию для загрузок (если нужно):
```bash
mkdir server/uploads
```

## Запуск

### Вариант 1: Запуск всего приложения одной командой
```bash
npm run dev
```

### Вариант 2: Запуск отдельно

Backend (в директории `server`):
```bash
cd server
npm run dev
```

Frontend (в директории `client`):
```bash
cd client
npm start
```

## Доступ к приложению

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- WebSocket: http://localhost:5000

## Первое использование

1. Откройте http://localhost:3000
2. Зарегистрируйте новый аккаунт
3. Создайте свой первый сервер
4. Начните общаться!

## Решение проблем

### MongoDB не подключается
- Убедитесь, что MongoDB запущен
- Проверьте URI в `.env`
- Проверьте, что порт 27017 доступен

### Порт уже занят
- Измените PORT в `server/.env`
- Измените порт в `client/package.json` (для React)

### Ошибки при установке зависимостей
- Удалите `node_modules` и `package-lock.json`
- Выполните `npm install` заново




