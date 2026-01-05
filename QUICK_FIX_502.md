# Быстрое исправление ошибки 502 Bad Gateway

## Проблема
Ошибка 502 Bad Gateway при запросе к `https://serverzvon.duckdns.org/api/auth/login`

## Решение на сервере VPS

Подключитесь к серверу по SSH и выполните:

```bash
# 1. Проверьте статус Node.js сервера
pm2 list

# 2. Если сервер не запущен или упал, перезапустите его
cd /var/www/zvon/server
pm2 restart ecosystem.config.js

# 3. Проверьте логи на наличие ошибок
pm2 logs --lines 30

# 4. Проверьте, что порт 5000 слушается
netstat -tlnp | grep :5000

# 5. Перезапустите nginx
sudo systemctl restart nginx

# 6. Проверьте логи nginx на ошибки
sudo tail -30 /var/log/nginx/error.log
```

## Если сервер не запускается

```bash
# Проверьте .env файл
cat /var/www/zvon/server/.env

# Убедитесь, что все переменные установлены:
# PORT=5000
# MONGODB_URI=...
# JWT_SECRET=...
# CLIENT_URL=https://serverzvon.duckdns.org

# Проверьте подключение к MongoDB
sudo systemctl status mongod

# Если MongoDB не запущен
sudo systemctl start mongod
```

## Проверка работоспособности

После исправления проверьте:

```bash
# На сервере
curl http://localhost:5000/api/health

# Извне (должно работать)
curl https://serverzvon.duckdns.org/api/health
```

## Обновление .env клиента

Убедитесь, что в `client/.env` указаны правильные значения для продакшена:

```
REACT_APP_API_URL=https://serverzvon.duckdns.org
REACT_APP_SOCKET_URL=https://serverzvon.duckdns.org
REACT_APP_SERVER_URL=https://serverzvon.duckdns.org
```

После изменения `.env` пересоберите клиент:
```bash
cd client
npm run build
```

## Дополнительная диагностика

См. файл `server/fix-502.md` для подробной диагностики.

