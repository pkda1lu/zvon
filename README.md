# <img src="client/public/icon.png" width="48" align="center" /> Zvon

**Zvon** — это современная и высокопроизводительная коммуникационная платформа реального времени, вдохновленная Discord, но с упором на премиальный дизайн и расширенные возможности аудио-захвата.

[![Version](https://img.shields.io/badge/version-0.92.6-blue.svg)](https://github.com/pkda1lu/zvon)
[![Electron](https://img.shields.io/badge/platform-Electron-brightgreen.svg)](https://www.electronjs.org/)
[![Technologies](https://img.shields.io/badge/stack-MERN%20+%20Socket.io-orange.svg)](https://socket.io/)

---

## ✨ Ключевые особенности

### 💬 Сообщения и Серверы
- **Real-time Messaging**: Мгновенный обмен сообщениями через WebSockets с поддержкой вложений.
- **Гибкая структура**: Создание собственных серверов, текстовых и голосовых каналов.
- **Система ролей**: Мощная система разрешений с возможностью переопределения для каждого канала.
- **Инвайты**: Красивые лендинги для приглашений с предпросмотром сервера и умным deep-linking.

### 🎙️ Голос и Видео
- **Voice Channels**: Кристально чистый звук с встроенным подавлением шума.
- **Screen Sharing**: Демонстрация экрана с **захватом системного аудио** (через нативный модуль C++).
- **WebRTC**: Надежные прямые соединения для минимальной задержки.

### 💻 Desktop Experience
- **Auto-Updater**: Профессиональное окно обновления с уникальной анимацией.
- **Deep Linking**: Поддержка протокола `zvon://` для открытия инвайтов прямо в приложении.
- **Tray & Notifications**: Полная интеграция с системным треем и уведомлениями Windows.

### 🎨 Премиальный UI
- **Glassmorphism**: Современный интерфейс с эффектами размытия и мягкими градиентами.
- **Анимации**: Динамичные фоны, плавные переходы и микро-взаимодействия.
- **Dark Mode**: Глубокий темный интерфейс по умолчанию.

---

## 🚀 Стек технологий

| Модуль | Технологии |
| :--- | :--- |
| **Frontend** | React, TypeScript, Vite, Vanilla CSS, WebRTC |
| **Backend** | Node.js, Express, MongoDB (Mongoose), JWT |
| **Real-time** | Socket.io |
| **Desktop** | Electron, C++ (Native Audio Module) |
| **Инфраструктура** | PM2, Nginx, Let's Encrypt |

---

## 🛠️ Быстрый старт

### Требования
- Node.js 18+
- MongoDB 6.0+
- Git

### Установка

1. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com/pkda1lu/zvon.git
   cd zvon
   ```

2. **Настройка сервера:**
   ```bash
   cd server
   npm install
   cp .env.example .env # Настройте PORT, MONGODB_URI и JWT_SECRET
   npm run dev
   ```

3. **Настройка клиента (Браузерная версия):**
   ```bash
   cd client
   npm install
   npm run dev
   ```

4. **Запуск десктопной версии (Electron):**
   ```bash
   cd client
   npm run electron:dev
   ```

---

## 📦 Сборка и Деплой

### Сборка Windows приложения
```bash
cd client
npm run electron:build
```
Инсталлер будет доступен в папке `client/dist`.

### Деплой на VPS
Подробная инструкция по деплою (Nginx, PM2, SSL) находится в файле [VPS_DEPLOYMENT.md](./VPS_DEPLOYMENT.md).

---

## 📂 Структура проекта

```text
zvon/
├── client/           # React + Electron (Frontend)
│   ├── src/          # Исходный код UI
│   ├── public/       # Статические ресурсы и Electron точки входа
│   └── native-audio/ # C++ модуль захвата аудио
├── server/           # Node.js + Express (Backend)
│   ├── models/       # Схемы данных MongoDB
│   ├── routes/       # API Эндпоинты
│   └── uploads/      # Хранилище пользовательских файлов
└── sounds/           # Системные звуки приложения
```

---

## 📄 Лицензия

Проект распространяется под лицензией ISC. Разработано с страстью к качественной связи.

**Автор:** [pkda1lu](https://github.com/pkda1lu)
