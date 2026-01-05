# Исправление ошибки 400 Bad Request при авторизации

Ошибка 400 Bad Request означает, что сервер не может обработать запрос из-за неверных данных или валидации.

## Возможные причины

1. **Неправильный формат email** - сервер ожидает валидный email
2. **Отсутствие password** - пароль обязателен
3. **Проблемы с Content-Type** - запрос должен быть в формате JSON
4. **Проблемы с валидацией** - данные не проходят валидацию express-validator

## Диагностика на сервере

Проверьте логи сервера для детальной информации:

```bash
# Просмотр логов PM2
pm2 logs zvon-server --lines 50

# Или логи приложения
tail -50 /var/www/zvon/server/logs/pm2-error.log
```

## Проверка валидации

Сервер использует express-validator и проверяет:
- `email` должен быть валидным email адресом
- `password` должен существовать (не пустой)

## Решение

### 1. Проверьте формат данных на клиенте

Убедитесь, что запрос отправляется правильно:

```javascript
// Должно быть:
{
  email: "user@example.com",  // Валидный email
  password: "password123"      // Не пустой пароль
}
```

### 2. Проверьте Content-Type заголовок

Убедитесь, что axios отправляет правильный Content-Type:

```javascript
axios.defaults.headers.post['Content-Type'] = 'application/json';
```

### 3. Добавьте логирование на сервере

Временно добавьте логирование в `server/routes/auth.js`:

```javascript
router.post('/login', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    // Добавьте это для отладки
    console.log('Login request body:', req.body);
    console.log('Content-Type:', req.headers['content-type']);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    // ... остальной код
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
```

### 4. Проверьте CORS настройки

Убедитесь, что CORS правильно настроен в `server.js`:

```javascript
app.use(cors({
  origin: function (origin, callback) {
    // Разрешить запросы без origin (например, мобильные приложения)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'https://serverzvon.duckdns.org',
      'http://serverzvon.duckdns.org'
    ];
    
    if (allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(null, true); // Разрешить все для отладки
    }
  },
  credentials: true
}));
```

### 5. Проверьте middleware для парсинга JSON

Убедитесь, что в `server.js` есть:

```javascript
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
```

## Тестирование запроса

Проверьте запрос напрямую с сервера:

```bash
# Тест логина
curl -X POST https://serverzvon.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

Если запрос работает через curl, но не через браузер, проблема в клиенте.

## Проверка на клиенте

Откройте DevTools в браузере и проверьте:

1. **Network tab** - посмотрите, что именно отправляется в запросе
2. **Request Headers** - убедитесь, что `Content-Type: application/json`
3. **Request Payload** - проверьте формат данных

## Временное решение для отладки

Добавьте обработку ошибок на клиенте:

```typescript
const login = async (email: string, password: string) => {
  try {
    console.log('Login attempt:', { email, password: '***' });
    const response = await axios.post('/api/auth/login', { email, password });
    // ...
  } catch (error: any) {
    console.error('Login error:', error.response?.data || error.message);
    throw error;
  }
};
```

## Частые проблемы

1. **Email не валидный** - проверьте формат (должен быть `user@domain.com`)
2. **Password пустой** - убедитесь, что пароль передается
3. **Content-Type не установлен** - axios должен автоматически устанавливать, но проверьте
4. **CORS блокирует** - проверьте настройки CORS на сервере

