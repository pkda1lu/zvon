# Развертывание серверной части на Ubuntu VPS

Полное руководство по настройке серверной части Zvon на Ubuntu VPS.

## Требования

- Ubuntu 20.04 или выше
- Root доступ или пользователь с sudo правами
- Минимум 1GB RAM (рекомендуется 2GB+)
- Открытые порты: 22 (SSH), 80 (HTTP), 443 (HTTPS), 5000 (или ваш порт API)

## Шаг 1: Подключение к серверу

```bash
ssh root@your-server-ip
# или
ssh username@your-server-ip
```

## Шаг 2: Обновление системы

```bash
sudo apt update
sudo apt upgrade -y
```

## Шаг 3: Установка Node.js

### Вариант 1: Через NodeSource (рекомендуется, последняя LTS версия)

```bash
# Установка Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версии
node --version
npm --version
```

### Вариант 2: Через nvm (Node Version Manager)

```bash
# Установка nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Перезагрузка терминала или выполните:
source ~/.bashrc

# Установка Node.js
nvm install 20
nvm use 20
nvm alias default 20
```

## Шаг 4: Установка MongoDB

### Вариант 1: MongoDB Community Edition (локально)

```bash
# Импорт ключа MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Добавление репозитория
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Обновление и установка
sudo apt update
sudo apt install -y mongodb-org

# Запуск и автозапуск MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Проверка статуса
sudo systemctl status mongod
```

### Вариант 2: MongoDB Atlas (облачный, рекомендуется для продакшена)

1. Перейдите на https://www.mongodb.com/cloud/atlas
2. Создайте бесплатный аккаунт
3. Создайте кластер (бесплатный tier M0)
4. Получите connection string
5. Добавьте IP вашего VPS в whitelist MongoDB Atlas

## Шаг 5: Установка PM2 (менеджер процессов)

```bash
sudo npm install -g pm2
```

## Шаг 6: Клонирование и настройка проекта

```bash
# Создание директории для приложения
sudo mkdir -p /var/www
cd /var/www

# Если используете Git:
# git clone your-repository-url zvon
# cd zvon

# Или загрузите файлы через SCP/SFTP в /var/www/zvon

# Переход в директорию сервера
cd zvon/server

# Установка зависимостей
npm install --production
```

## Шаг 7: Настройка переменных окружения

```bash
# Создание файла .env
nano /var/www/zvon/server/.env
```

Добавьте следующие переменные:

```env
# Порт сервера
PORT=5000

# MongoDB URI
# Для локального MongoDB:
MONGODB_URI=mongodb://localhost:27017/zvon
# Для MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/zvon?retryWrites=true&w=majority

# JWT Secret (ОБЯЗАТЕЛЬНО измените на случайную строку!)
JWT_SECRET=your-super-secret-jwt-key-change-this-to-random-string-min-32-chars

# URL клиента (ваш домен или IP)
CLIENT_URL=http://your-domain.com
# или для разработки:
# CLIENT_URL=http://localhost:3000

# Окружение
NODE_ENV=production
```

**Важно:** Сгенерируйте безопасный JWT_SECRET:
```bash
openssl rand -base64 32
```

## Шаг 8: Создание директории для загрузок

```bash
mkdir -p /var/www/zvon/server/uploads
chmod 755 /var/www/zvon/server/uploads
```

## Шаг 9: Запуск приложения через PM2

```bash
cd /var/www/zvon/server

# Запуск приложения
pm2 start server.js --name zvon-server

# Сохранение конфигурации PM2 для автозапуска
pm2 save
pm2 startup

# Проверка статуса
pm2 status
pm2 logs zvon-server
```

## Шаг 10: Настройка Nginx (Reverse Proxy)

### Установка Nginx

```bash
sudo apt install -y nginx
```

### Создание конфигурации

```bash
sudo nano /etc/nginx/sites-available/zvon
```

Добавьте следующую конфигурацию:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Замените на ваш домен или IP

    # Увеличение размера загружаемых файлов
    client_max_body_size 50M;

    # API и WebSocket прокси
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты для WebSocket
        proxy_read_timeout 86400;
    }

    # Статические файлы (загрузки)
    location /api/uploads {
        alias /var/www/zvon/server/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### Активация конфигурации

```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/zvon /etc/nginx/sites-enabled/

# Удаление дефолтной конфигурации (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
```

## Шаг 11: Настройка Firewall (UFW)

```bash
# Разрешение SSH (важно сделать первым!)
sudo ufw allow 22/tcp

# Разрешение HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включение firewall
sudo ufw enable

# Проверка статуса
sudo ufw status
```

## Шаг 12: Настройка SSL (Let's Encrypt) - опционально, но рекомендуется

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение SSL сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление (настроено автоматически)
sudo certbot renew --dry-run
```

После этого Certbot автоматически обновит конфигурацию Nginx для использования HTTPS.

## Шаг 13: Обновление переменных окружения для HTTPS

Если вы настроили SSL, обновите `.env`:

```bash
nano /var/www/zvon/server/.env
```

Измените `CLIENT_URL`:
```env
CLIENT_URL=https://your-domain.com
```

Перезапустите приложение:
```bash
pm2 restart zvon-server
```

## Полезные команды PM2

```bash
# Просмотр логов
pm2 logs zvon-server

# Просмотр статуса
pm2 status

# Перезапуск
pm2 restart zvon-server

# Остановка
pm2 stop zvon-server

# Удаление из PM2
pm2 delete zvon-server

# Мониторинг
pm2 monit
```

## Обновление приложения

```bash
cd /var/www/zvon/server

# Если используете Git:
# git pull origin main

# Установка новых зависимостей
npm install --production

# Перезапуск
pm2 restart zvon-server
```

## Проверка работы

1. Проверьте статус PM2: `pm2 status`
2. Проверьте логи: `pm2 logs zvon-server`
3. Проверьте Nginx: `sudo systemctl status nginx`
4. Проверьте MongoDB: `sudo systemctl status mongod`
5. Откройте в браузере: `http://your-domain.com` или `http://your-server-ip`

## Решение проблем

### Приложение не запускается

```bash
# Проверьте логи
pm2 logs zvon-server --lines 50

# Проверьте переменные окружения
cat /var/www/zvon/server/.env

# Проверьте подключение к MongoDB
mongosh
# или
mongo
```

### MongoDB не подключается

```bash
# Проверьте статус
sudo systemctl status mongod

# Проверьте логи
sudo journalctl -u mongod -n 50

# Перезапустите MongoDB
sudo systemctl restart mongod
```

### Nginx не работает

```bash
# Проверьте конфигурацию
sudo nginx -t

# Проверьте логи
sudo tail -f /var/log/nginx/error.log

# Перезапустите Nginx
sudo systemctl restart nginx
```

### Порт занят

```bash
# Проверьте, что использует порт 5000
sudo lsof -i :5000
# или
sudo netstat -tulpn | grep 5000

# Убейте процесс или измените порт в .env
```

### Проблемы с правами доступа

```bash
# Установите правильные права
sudo chown -R $USER:$USER /var/www/zvon
sudo chmod -R 755 /var/www/zvon
```

## Резервное копирование

### Резервное копирование MongoDB

```bash
# Создание бэкапа
mongodump --out /var/backups/mongodb/$(date +%Y%m%d)

# Восстановление
mongorestore /var/backups/mongodb/YYYYMMDD
```

### Резервное копирование загрузок

```bash
# Создание архива
tar -czf /var/backups/zvon/uploads-$(date +%Y%m%d).tar.gz /var/www/zvon/server/uploads
```

## Мониторинг

### Установка мониторинга PM2

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Мониторинг ресурсов

```bash
# Использование памяти и CPU
pm2 monit

# Системные ресурсы
htop
# или
top
```

## Дополнительные настройки безопасности

1. **Отключение root SSH** (если еще не сделано):
```bash
sudo nano /etc/ssh/sshd_config
# Установите: PermitRootLogin no
sudo systemctl restart sshd
```

2. **Настройка fail2ban** (защита от брутфорса):
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

3. **Регулярные обновления**:
```bash
# Настройка автоматических обновлений безопасности
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Готово!

Ваш сервер должен быть доступен по адресу:
- HTTP: `http://your-domain.com` или `http://your-server-ip`
- HTTPS: `https://your-domain.com` (если настроен SSL)

API будет доступно на том же адресе, например:
- `http://your-domain.com/api/auth/register`
- `http://your-domain.com/api/servers`

