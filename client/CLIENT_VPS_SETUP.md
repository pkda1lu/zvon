# Настройка клиента для подключения к VPS серверу

## Быстрая настройка

1. **Создайте файл `.env` в папке `client/`** со следующим содержимым:

```env
REACT_APP_API_URL=http://your-domain.com
REACT_APP_SOCKET_URL=http://your-domain.com
```

**Замените `your-domain.com` на:**
- Ваш домен (например: `https://zvon.example.com`)
- Или IP адрес вашего VPS (например: `http://123.45.67.89:5000`)

### Примеры:

**Если используете домен с HTTPS:**
```env
REACT_APP_API_URL=https://zvon.example.com
REACT_APP_SOCKET_URL=https://zvon.example.com
```

**Если используете IP адрес:**
```env
REACT_APP_API_URL=http://123.45.67.89:5000
REACT_APP_SOCKET_URL=http://123.45.67.89:5000
```

**Если используете домен с HTTP (не рекомендуется для продакшена):**
```env
REACT_APP_API_URL=http://zvon.example.com:5000
REACT_APP_SOCKET_URL=http://zvon.example.com:5000
```

## Важные моменты

1. **HTTPS**: Если сервер использует HTTPS, обязательно используйте `https://` в URL
2. **Порт**: Если используете стандартные порты (80/443), порт можно не указывать
3. **WebSocket**: Для WebSocket важно использовать тот же протокол (http/https), что и для API

## После настройки

1. **Пересоберите приложение:**
   ```bash
   cd client
   npm run build
   ```

2. **Для разработки:**
   ```bash
   npm start
   ```

3. **Для Electron приложения:**
   ```bash
   npm run electron:build
   ```

## Проверка подключения

После запуска проверьте в консоли браузера (F12):
- API запросы должны идти на ваш VPS сервер
- WebSocket подключение должно устанавливаться на ваш VPS сервер

## Где используются эти переменные

- `REACT_APP_API_URL` - используется в:
  - `src/contexts/AuthContext.tsx` - для API запросов
  - `src/utils/avatar.ts` - для загрузки аватаров и файлов

- `REACT_APP_SOCKET_URL` - используется в:
  - `src/contexts/SocketContext.tsx` - для WebSocket подключений

## Если что-то не работает

1. Проверьте, что сервер на VPS запущен и доступен
2. Проверьте CORS настройки на сервере
3. Проверьте firewall на VPS (должны быть открыты порты 80/443 или ваш порт)
4. Проверьте логи сервера: `pm2 logs zvon-server`

