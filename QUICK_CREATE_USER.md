# Быстрое создание тестового пользователя

## Статус сервера ✅

Сервер работает правильно! Ответ `{"message":"Invalid credentials"}` - это нормально, просто пользователя с такими данными не существует.

## Создание пользователя

### Способ 1: Через API регистрации (рекомендуется)

```bash
curl -X POST https://serverzvon.duckdns.org/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "test123"
  }'
```

Если успешно, вы получите токен и данные пользователя.

### Способ 2: Через Node.js скрипт

На сервере выполните:

```bash
cd /var/www/zvon/server
node create-user.js
```

Или с параметрами:

```bash
node create-user.js myusername myemail@example.com mypassword
```

## Проверка входа

После создания пользователя попробуйте войти:

```bash
curl -X POST https://serverzvon.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

Должен вернуться ответ с токеном:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

## Важно

- Убедитесь, что MongoDB запущен: `sudo systemctl status mongod`
- Проверьте, что в `.env` указан правильный `MONGODB_URI`
- Пароль должен быть минимум 6 символов
- Email должен быть валидным форматом

