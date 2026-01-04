# Исправление ошибки CORS "Redirect is not allowed for a preflight request"

## Проблема

Ошибка возникает когда:
- Клиент отправляет OPTIONS запрос (preflight)
- Nginx или сервер делает редирект (например HTTP -> HTTPS)
- Браузер блокирует запрос, так как редирект запрещен для preflight запросов

## Решение

### 1. Обновить CORS настройки на сервере

Файл `server/server.js` уже обновлен с правильными CORS настройками.

### 2. Обновить конфигурацию Nginx на VPS

**Важно:** Нужно обработать OPTIONS запросы ДО редиректа.

#### Шаг 1: Подключитесь к VPS
```bash
ssh user@your-vps-ip
```

#### Шаг 2: Отредактируйте конфигурацию Nginx
```bash
sudo nano /etc/nginx/sites-available/zvon
```

#### Шаг 3: Добавьте обработку OPTIONS запросов

Замените блок `location /` на:

```nginx
location / {
    # Обработка OPTIONS запросов БЕЗ редиректа
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '$http_origin' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Max-Age' '86400' always;
        add_header 'Content-Length' '0';
        add_header 'Content-Type' 'text/plain';
        return 204;
    }

    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 86400;
    
    # CORS headers для обычных запросов
    add_header 'Access-Control-Allow-Origin' '$http_origin' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;
}
```

#### Шаг 4: Проверьте конфигурацию
```bash
sudo nginx -t
```

#### Шаг 5: Перезагрузите Nginx
```bash
sudo systemctl reload nginx
```

### 3. Обновить переменные окружения на сервере

Убедитесь что в `/var/www/zvon/server/.env` указан правильный CLIENT_URL:

```bash
sudo nano /var/www/zvon/server/.env
```

Добавьте или обновите:
```env
CLIENT_URL=https://zvon.duckdns.com
# или для разработки:
# CLIENT_URL=http://localhost:3000
```

### 4. Перезапустить сервер
```bash
pm2 restart zvon-server
pm2 logs zvon-server
```

## Проверка

После применения изменений:

1. Проверьте что сервер отвечает на OPTIONS запросы:
```bash
curl -X OPTIONS https://zvon.duckdns.com/api/auth/login \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Должен вернуться статус 204 с CORS заголовками.

2. Проверьте в браузере - ошибка CORS должна исчезнуть.

## Альтернативное решение (если проблема сохраняется)

Если проблема все еще есть, можно временно отключить редирект HTTP -> HTTPS для OPTIONS запросов:

```nginx
# В блоке server для порта 80
if ($request_method = 'OPTIONS') {
    # Не делать редирект для OPTIONS
    return 204;
}
```

Но лучше использовать первое решение с правильной обработкой OPTIONS.

