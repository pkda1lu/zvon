# Быстрое исправление ошибки MODULE_NOT_FOUND

## Проблема
Сервер не может найти модули Node.js, потому что зависимости не установлены.

## Решение (выполните на сервере VPS)

```bash
# 1. Перейдите в директорию сервера
cd /var/www/zvon/server

# 2. Установите зависимости
npm install --production

# 3. Проверьте, что node_modules создан
ls -la node_modules | head -5

# 4. Перезапустите сервер через PM2
pm2 restart ecosystem.config.js

# 5. Проверьте логи
pm2 logs zvon-server --lines 20
```

## Если npm install не работает

```bash
# Проверьте версию Node.js
node --version
npm --version

# Если Node.js не установлен или старая версия:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Затем снова установите зависимости
cd /var/www/zvon/server
npm install --production
```

## Полная переустановка (если нужно)

```bash
# 1. Остановите PM2 процесс
pm2 delete zvon-server

# 2. Очистите и переустановите
cd /var/www/zvon/server
rm -rf node_modules package-lock.json
npm install --production

# 3. Запустите заново
pm2 start ecosystem.config.js

# 4. Сохраните конфигурацию
pm2 save

# 5. Проверьте статус
pm2 status
pm2 logs zvon-server
```

## Проверка прав доступа

Если возникают проблемы с правами:

```bash
# Проверьте владельца
ls -la /var/www/zvon/server

# Если нужно, измените владельца (замените username на ваше имя пользователя)
sudo chown -R $USER:$USER /var/www/zvon/server
```

После выполнения этих команд сервер должен запуститься без ошибок.

