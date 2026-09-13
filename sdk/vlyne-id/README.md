# Vlyne ID SDK

Три файла без зависимостей — по одному на каждую роль в экосистеме. Они
копируются в проект, а не ставятся пакетом: пакет со своим деревом зависимостей
ради двухсот строк проверки подписи — обуза, а не удобство.

| Файл | Роль | Требует |
|---|---|---|
| `browser.js` | приложение ведёт пользователя через вход (PKCE) | браузер / Electron |
| `node.js` | сервис принимает токены и проверяет их | Node 18+ |
| `python/vlyne_id.py` | то же на Python (телеграм-бот) | `requests`, `cryptography` |

Полное описание системы — [`docs/vlyne-id.md`](../../docs/vlyne-id.md).

## browser.js

```js
import { VlyneID } from './vlyne-id/browser.js';

const id = new VlyneID({
  issuer: 'https://vlyneid.zvonserver.ru',
  clientId: 'vlyne_xxx',
  redirectUri: window.location.origin + '/auth/callback',
  scopes: ['openid', 'profile', 'email', 'offline_access']
});

if (VlyneID.isCallback()) await id.handleCallback();  // на странице возврата
if (!id.isAuthenticated()) await id.login();

id.user();                      // данные из id_token, без обращения к сети
await id.getAccessToken();      // обновится сам за минуту до истечения
await id.fetch('/api/…');       // то же, но токен подставлен в заголовок
await id.logoutRemote();        // выход с отзывом refresh-токена
```

Вход во всплывающем окне: `await id.loginPopup()`, а страница возврата
вызывает `VlyneID.notifyOpener()` и закрывается.

Токены хранятся в `localStorage`, промежуточные значения входа — в
`sessionStorage`. Оба заменяются через опции `storage` и `transientStorage` —
например, на хранилище Electron, если держать токены в `localStorage`
нежелательно.

## node.js

```js
const { VlyneVerifier } = require('./vlyne-id/node');
const verifier = new VlyneVerifier({ issuer: 'https://vlyneid.zvonserver.ru', audience: 'vlyne_xxx' });

app.get('/api/subscription', verifier.middleware({ scopes: ['vpn:read'] }), (req, res) => {
  req.vlyne; // { sub, clientId, scopes, claims }
});

// или вручную
const claims = await verifier.verify(token, { requireScopes: ['vpn:read'] });
```

## python/vlyne_id.py

```python
from vlyne_id import VlyneVerifier, VlyneTokenError, VlyneScopeError

verifier = VlyneVerifier("https://vlyneid.zvonserver.ru", audience="vlyne_xxx")

try:
    claims = verifier.verify(token, require_scopes=["vpn:read"])
except VlyneScopeError as e:
    ...  # прав не хватает: просить доступ заново, обновление не поможет
except VlyneTokenError as e:
    ...  # токен негоден
```

Есть и серверная половина потока — `exchange_code()` и `refresh()`, если
вход ведёт не браузер, а страница на стороне бота.

## Что делают все три одинаково

- **Алгоритм подписи берут свой, а не из заголовка токена.** Доверять полю
  `alg` внутри проверяемых данных — классический способ принять подделку
  (`alg: none`, или HS256, подписанный нашим же публичным ключом).
- **Ключи кешируют.** Обращение к Vlyne ID происходит раз в час, а не на
  каждый запрос; неизвестный `kid` вызывает одну принудительную перезагрузку
  и только потом отказ. Сервис переживает недоступность Vlyne ID.
- **Проверяют `iss`, `exp` и, если задан, `aud`.** Токен, выписанный другому
  приложению, не должен приниматься только потому, что подпись верна.
