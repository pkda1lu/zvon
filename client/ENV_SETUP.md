# Настройка переменных окружения для клиента

Для подключения клиента к серверу на VPS необходимо настроить переменные окружения.

## Создание файла .env

Создайте файл `.env` в корне папки `client` со следующим содержимым:

```env
# API URL - адрес вашего сервера на VPS
# Замените на ваш реальный домен или IP адрес
REACT_APP_API_URL=http://your-domain.com:5000
# или если используете HTTPS:
# REACT_APP_API_URL=https://your-domain.com

# WebSocket URL - адрес для WebSocket подключений
# Обычно тот же что и API URL
REACT_APP_SOCKET_URL=http://your-domain.com:5000
# или если используете HTTPS:
# REACT_APP_SOCKET_URL=https://your-domain.com
```

## Примеры конфигурации

### Если сервер на IP адресе:
```env
REACT_APP_API_URL=http://123.45.67.89:5000
REACT_APP_SOCKET_URL=http://123.45.67.89:5000
```

### Если сервер на домене с HTTP:
```env
REACT_APP_API_URL=http://zvon.example.com:5000
REACT_APP_SOCKET_URL=http://zvon.example.com:5000
```

### Если сервер на домене с HTTPS (рекомендуется):
```env
REACT_APP_API_URL=https://zvon.example.com
REACT_APP_SOCKET_URL=https://zvon.example.com
```

### Если используете Nginx reverse proxy:
```env
REACT_APP_API_URL=https://zvon.example.com
REACT_APP_SOCKET_URL=https://zvon.example.com
```

## Важные замечания

1. **HTTPS vs HTTP**: Если ваш сервер использует HTTPS, обязательно используйте `https://` в URL. Для WebSocket это особенно важно.

2. **Порт**: Если вы используете стандартный порт (80 для HTTP, 443 для HTTPS), порт можно не указывать. Если используете другой порт (например, 5000), укажите его явно.

3. **CORS**: Убедитесь, что на сервере настроен CORS для вашего домена клиента.

4. **Переменные окружения в React**: Переменные должны начинаться с `REACT_APP_` чтобы быть доступными в коде.

5. **Пересборка**: После изменения `.env` файла необходимо пересобрать приложение:
   ```bash
   npm run build
   ```

## Проверка подключения

После настройки переменных окружения и пересборки, проверьте в консоли браузера:
- Подключение к API должно идти на указанный URL
- WebSocket подключение должно устанавливаться на указанный URL

## Для Electron приложения

Если вы используете Electron, убедитесь что:
- В production режиме Electron загружает собранное приложение
- Переменные окружения включены в сборку
- CORS на сервере разрешает запросы от Electron приложения

