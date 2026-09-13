/**
 * Права доступа Vlyne ID.
 *
 * Vlyne ID отвечает за вход и за данные самого аккаунта — имя, почту, привязки.
 * Ничего сверх этого здесь появляться не должно: подписки, покупки и прочее
 * принадлежат своим сервисам, и права на них выдаёт тот, кто ими распоряжается.
 * Единый вход, который заодно раздаёт доступ к чужим предметным областям,
 * перестаёт быть входом и становится общей связкой ключей от всего.
 *
 * Каждое право — отдельная строка на экране согласия, поэтому набор нарочно
 * мелкий и понятный: человек должен прочитать список за пару секунд. Новое
 * право добавляется сюда, иначе запрос с ним будет отклонён — приложение не
 * может выдумать себе доступ на ходу.
 */
const SCOPES = {
  openid: {
    title: 'Ваш Vlyne ID',
    description: 'Постоянный идентификатор аккаунта — по нему приложение узнаёт вас при следующем входе',
    required: true
  },
  profile: {
    title: 'Профиль',
    description: 'Имя пользователя, аватар, баннер и описание'
  },
  email: {
    title: 'Адрес почты',
    description: 'Почта аккаунта и признак того, что она подтверждена'
  },
  telegram: {
    title: 'Привязка Telegram',
    description: 'Привязан ли аккаунт к Telegram и под каким именем'
  },
  offline_access: {
    title: 'Долгий вход',
    description: 'Не спрашивать вход заново при каждом запуске приложения'
  }
};

const ALL_SCOPES = Object.keys(SCOPES);

/** Разбирает строку scope из запроса: пробелы, дубли и мусор отсеиваются. */
function parseScopes(raw) {
  const list = String(raw || '')
    .split(/[\s+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

/** Права, которых нет в справочнике. */
function unknownScopes(scopes) {
  return scopes.filter((s) => !SCOPES[s]);
}

/** Права, которые приложению не разрешены его регистрацией. */
function disallowedScopes(scopes, client) {
  const allowed = client.allowedScopes || [];
  return scopes.filter((s) => !allowed.includes(s));
}

/** Описания для экрана согласия. offline_access скрываем — это не доступ к данным. */
function describe(scopes) {
  return scopes
    .filter((s) => SCOPES[s] && s !== 'offline_access')
    .map((s) => ({ scope: s, title: SCOPES[s].title, description: SCOPES[s].description }));
}

/**
 * Заявления о пользователе для id_token и /userinfo — ровно те, что покрыты
 * выданными правами. Список собирается здесь в одном месте, чтобы новое поле
 * в модели пользователя не утекало в токены само собой.
 */
function claimsForScopes(user, scopes) {
  const claims = {};

  if (scopes.includes('profile')) {
    claims.name = user.username;
    claims.preferred_username = user.username;
    claims.nickname = user.username;
    claims.picture = user.avatar || null;
    claims.profile_banner = user.banner || null;
    claims.banner_color = user.bannerColor || null;
    claims.bio = user.bio || '';
    if (user.createdAt) claims.created_at = Math.floor(new Date(user.createdAt).getTime() / 1000);
  }

  if (scopes.includes('email')) {
    claims.email = user.email;
    claims.email_verified = !!user.isVerified;
  }

  if (scopes.includes('telegram')) {
    claims.telegram = user.telegram && user.telegram.id
      ? { id: user.telegram.id, username: user.telegram.username || '', linked_at: user.telegram.linkedAt || null }
      : null;
  }

  return claims;
}

module.exports = { SCOPES, ALL_SCOPES, parseScopes, unknownScopes, disallowedScopes, describe, claimsForScopes };
