# Установка и запуск MongoDB на Windows

## Вариант 1: Установка MongoDB Community Server (рекомендуется)

### Шаг 1: Скачать MongoDB
1. Перейдите на https://www.mongodb.com/try/download/community
2. Выберите:
   - Version: последняя стабильная версия
   - Platform: Windows
   - Package: MSI
3. Нажмите "Download"

### Шаг 2: Установка
1. Запустите скачанный MSI файл
2. Выберите "Complete" установку
3. Установите MongoDB как службу Windows (рекомендуется)
4. Установите MongoDB Compass (GUI инструмент) - опционально
5. Завершите установку

### Шаг 3: Проверка запуска
MongoDB должен автоматически запуститься как служба Windows.

Проверить можно через:
- Диспетчер задач → Службы → найти "MongoDB"
- Или через командную строку:
```powershell
Get-Service MongoDB
```

### Шаг 4: Подключение
MongoDB будет доступен по адресу: `mongodb://localhost:27017`

---

## Вариант 2: MongoDB через Docker (альтернатива)

Если у вас установлен Docker Desktop:

```powershell
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

Проверка:
```powershell
docker ps
```

---

## Вариант 3: MongoDB Atlas (облачный, бесплатный)

Если не хотите устанавливать локально:

1. Перейдите на https://www.mongodb.com/cloud/atlas
2. Создайте бесплатный аккаунт
3. Создайте кластер (бесплатный tier M0)
4. Получите connection string
5. Используйте его в `server/.env`:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/zvon
   ```

---

## Ручной запуск MongoDB (если не установлен как служба)

Если MongoDB не запускается автоматически:

1. Откройте командную строку от имени администратора
2. Перейдите в директорию установки MongoDB (обычно `C:\Program Files\MongoDB\Server\<version>\bin`)
3. Запустите:
```powershell
mongod --dbpath "C:\data\db"
```

**Важно:** Создайте директорию `C:\data\db` перед запуском, если её нет:
```powershell
mkdir C:\data\db
```

---

## Проверка работы MongoDB

### Через командную строку:
```powershell
mongosh
```

Или старый клиент:
```powershell
mongo
```

Если подключение успешно, вы увидите приглашение MongoDB shell.

### Через приложение:
Используйте MongoDB Compass или Studio 3T для визуального управления.

---

## Решение проблем

### MongoDB не запускается
1. Проверьте, что порт 27017 не занят другим приложением
2. Проверьте логи MongoDB
3. Убедитесь, что у вас есть права администратора

### Ошибка подключения
1. Проверьте, что MongoDB запущен
2. Проверьте URI в `.env` файле
3. Убедитесь, что firewall не блокирует порт 27017

### Порт занят
Измените порт в конфигурации MongoDB или освободите порт 27017

---

## Быстрая проверка для проекта Zvon

После установки MongoDB, проверьте подключение:

1. Убедитесь, что MongoDB запущен
2. В файле `server/.env` должна быть строка:
   ```
   MONGODB_URI=mongodb://localhost:27017/zvon
   ```
3. Запустите сервер:
   ```powershell
   cd server
   npm run dev
   ```
4. Если видите "MongoDB connected" - всё работает!




