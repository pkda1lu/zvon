# Исправление ошибки MODULE_NOT_FOUND

Ошибка `MODULE_NOT_FOUND` означает, что зависимости Node.js не установлены на сервере.

## Решение

Выполните на сервере VPS:

```bash
# 1. Перейдите в директорию сервера
cd /var/www/zvon/server

# 2. Проверьте, существует ли node_modules
ls -la node_modules

# 3. Если node_modules отсутствует или пуст, установите зависимости
npm install

# 4. Если npm install не работает, попробуйте с очисткой кэша
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# 5. Проверьте, что зависимости установлены
ls node_modules | head -10

# 6. Перезапустите сервер через PM2
pm2 restart ecosystem.config.js

# 7. Проверьте логи
pm2 logs zvon-server --lines 50
```

## Если npm install не работает

```bash
# Проверьте версию Node.js и npm
node --version
npm --version

# Если Node.js не установлен или старая версия:
# Установите Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверьте версию
node --version
npm --version
```

## Проверка установки

После установки зависимостей проверьте:

```bash
# 1. Убедитесь, что node_modules существует и не пуст
ls -la /var/www/zvon/server/node_modules | wc -l
# Должно быть много файлов

# 2. Попробуйте запустить сервер вручную (для теста)
cd /var/www/zvon/server
node server.js
# Если запускается без ошибок, остановите (Ctrl+C) и запустите через PM2

# 3. Запустите через PM2
pm2 restart ecosystem.config.js

# 4. Проверьте статус
pm2 status
pm2 logs zvon-server
```

## Если проблема сохраняется

```bash
# 1. Удалите процесс из PM2
pm2 delete zvon-server

# 2. Очистите и переустановите зависимости
cd /var/www/zvon/server
rm -rf node_modules package-lock.json
npm install

# 3. Запустите заново
pm2 start ecosystem.config.js

# 4. Сохраните конфигурацию PM2
pm2 save
```

## Проверка прав доступа

Убедитесь, что у пользователя есть права на директорию:

```bash
# Проверьте владельца директории
ls -la /var/www/zvon/server

# Если нужно, измените владельца
sudo chown -R $USER:$USER /var/www/zvon/server

# Убедитесь, что есть права на запись
chmod -R 755 /var/www/zvon/server
```

