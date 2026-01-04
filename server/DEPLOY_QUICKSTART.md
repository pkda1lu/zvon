# Быстрый старт развертывания на Ubuntu VPS

## Автоматическое развертывание (рекомендуется)

```bash
# 1. Загрузите скрипт на сервер
scp server/deploy.sh user@your-server:/tmp/

# 2. Подключитесь к серверу
ssh user@your-server

# 3. Запустите скрипт
sudo bash /tmp/deploy.sh

# 4. Скопируйте файлы сервера
scp -r server/* user@your-server:/var/www/zvon/server/

# 5. На сервере: установите зависимости и запустите
ssh user@your-server
cd /var/www/zvon/server
npm install --production
nano .env  # Отредактируйте переменные окружения
pm2 start server.js --name zvon-server
pm2 save
pm2 startup
```

## Ручное развертывание

См. полную инструкцию в `VPS_DEPLOYMENT.md`

## Основные команды

```bash
# Запуск
pm2 start server.js --name zvon-server

# Остановка
pm2 stop zvon-server

# Перезапуск
pm2 restart zvon-server

# Логи
pm2 logs zvon-server

# Статус
pm2 status

# Автозапуск
pm2 save
pm2 startup
```

## Переменные окружения (.env)

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/zvon
JWT_SECRET=your-secret-key-here
NODE_ENV=production
CLIENT_URL=http://your-domain.com
```

## Проверка работы

```bash
# Проверка PM2
pm2 status

# Проверка Nginx
sudo systemctl status nginx

# Проверка MongoDB
sudo systemctl status mongod

# Проверка логов
pm2 logs zvon-server --lines 50
```

## Полезные ссылки

- Полная инструкция: `../VPS_DEPLOYMENT.md`
- Настройка MongoDB: `../MONGODB_SETUP.md`

