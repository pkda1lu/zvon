"""
Vlyne ID — проверка токенов на стороне ресурса (Python).

Половина SDK для сервисов, которые токены принимают, а не выпускают:
телеграм-бот Vlyne и всё, что появится рядом. Подпись проверяется публичным
ключом из JWKS, взятым один раз и закешированным, — обращаться к Vlyne ID на
каждый запрос не нужно, и бот продолжает работать, даже если Vlyne ID
недоступен.

Зависимости: requests и cryptography (обе уже есть у бота; cryptography
приходит вместе с aiohttp/telethon-стеком). Проверять RSA-подпись вручную
через стандартную библиотеку можно, но такой код никто не станет читать,
а ошибка в нём означает принимать поддельные токены.

    from vlyne_id import VlyneVerifier, VlyneTokenError

    verifier = VlyneVerifier("https://vlyneid.zvonserver.ru", audience="vlyne_xxx")

    try:
        claims = verifier.verify(token, require_scopes=["vpn:read"])
    except VlyneTokenError as e:
        return {"ok": False, "error": str(e)}

    zvon_user_id = claims["sub"]   # тот же id, что бот знает как zvonId
"""

import base64
import json
import threading
import time

import requests
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidSignature


class VlyneTokenError(Exception):
    """Токен не прошёл проверку. Текст пригоден для лога, не для пользователя."""


class VlyneScopeError(VlyneTokenError):
    """Токен настоящий, но прав в нём меньше, чем требует ресурс."""

    def __init__(self, missing):
        self.missing = missing
        super().__init__("Токену не хватает прав: " + ", ".join(missing))


def _b64url(data: str) -> bytes:
    # JWT режет выравнивающие "=" — возвращаем их перед декодированием.
    padding_needed = -len(data) % 4
    return base64.urlsafe_b64decode(data + "=" * padding_needed)


def _int_from_b64(data: str) -> int:
    return int.from_bytes(_b64url(data), "big")


class VlyneVerifier:
    def __init__(self, issuer: str, audience=None, jwks_ttl: int = 3600, clock_tolerance: int = 60):
        self.issuer = issuer.rstrip("/")
        if audience is None:
            self.audience = None
        elif isinstance(audience, str):
            self.audience = [audience]
        else:
            self.audience = list(audience)
        self.jwks_ttl = jwks_ttl
        self.clock_tolerance = clock_tolerance

        self._keys = {}
        self._fetched_at = 0.0
        # Бот многопоточный: без блокировки на старте несколько обработчиков
        # одновременно полезут за одним и тем же JWKS.
        self._lock = threading.Lock()

    # ---- Ключи ----

    def _load_jwks(self, force: bool = False):
        with self._lock:
            fresh = (time.time() - self._fetched_at) < self.jwks_ttl
            if self._keys and fresh and not force:
                return

            resp = requests.get(f"{self.issuer}/oauth/jwks.json", timeout=10)
            resp.raise_for_status()

            keys = {}
            for jwk in resp.json().get("keys", []):
                if jwk.get("kty") != "RSA":
                    continue
                numbers = rsa.RSAPublicNumbers(_int_from_b64(jwk["e"]), _int_from_b64(jwk["n"]))
                keys[jwk["kid"]] = numbers.public_key()

            if not keys:
                raise VlyneTokenError("В JWKS Vlyne ID нет пригодных ключей")

            self._keys = keys
            self._fetched_at = time.time()

    def _key_for(self, kid: str):
        self._load_jwks()
        key = self._keys.get(kid)
        if key is None:
            # Неизвестный kid обычно значит, что ключ обновили. Одна
            # принудительная перезагрузка — и только потом отказ.
            self._load_jwks(force=True)
            key = self._keys.get(kid)
        if key is None:
            raise VlyneTokenError("Ключ подписи неизвестен")
        return key

    # ---- Проверка ----

    def verify(self, token: str, require_scopes=None, token_type: str = "access") -> dict:
        parts = str(token).split(".")
        if len(parts) != 3:
            raise VlyneTokenError("Некорректный формат токена")

        try:
            header = json.loads(_b64url(parts[0]))
            claims = json.loads(_b64url(parts[1]))
            signature = _b64url(parts[2])
        except Exception:
            raise VlyneTokenError("Токен не разбирается")

        # Алгоритм берём свой, а не из заголовка токена: доверять полю alg
        # внутри проверяемых данных — классическая дыра (alg: none).
        if header.get("alg") != "RS256":
            raise VlyneTokenError("Недопустимый алгоритм подписи")

        key = self._key_for(header.get("kid"))
        try:
            key.verify(
                signature,
                f"{parts[0]}.{parts[1]}".encode("ascii"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
        except InvalidSignature:
            raise VlyneTokenError("Подпись токена не совпала")

        now = time.time()
        if claims.get("iss") != self.issuer:
            raise VlyneTokenError("Токен выпущен другим сервером")
        if claims.get("exp") and claims["exp"] + self.clock_tolerance < now:
            raise VlyneTokenError("Срок действия токена истёк")
        if claims.get("nbf") and claims["nbf"] - self.clock_tolerance > now:
            raise VlyneTokenError("Токен ещё не действует")
        if token_type and claims.get("typ") and claims["typ"] != token_type:
            raise VlyneTokenError(f"Ожидался токен типа {token_type}")

        if self.audience:
            aud = claims.get("aud")
            aud_list = aud if isinstance(aud, list) else [aud]
            if not any(a in self.audience for a in aud_list):
                raise VlyneTokenError("Токен предназначен другому приложению")

        if require_scopes:
            granted = str(claims.get("scope", "")).split()
            missing = [s for s in require_scopes if s not in granted]
            if missing:
                raise VlyneScopeError(missing)

        return claims

    # ---- Дополнительно ----

    def userinfo(self, access_token: str) -> dict:
        """Свежие данные пользователя, когда claims токена не хватает."""
        resp = requests.get(
            f"{self.issuer}/oauth/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def exchange_code(self, code: str, client_id: str, redirect_uri: str,
                      code_verifier: str, client_secret: str = None) -> dict:
        """
        Обмен кода на токены — для серверной части, которая сама водит
        пользователя через вход (например, веб-страница бота).
        """
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        }
        if client_secret:
            data["client_secret"] = client_secret

        resp = requests.post(f"{self.issuer}/oauth/token", data=data, timeout=15)
        payload = resp.json()
        if resp.status_code != 200:
            raise VlyneTokenError(payload.get("error_description") or payload.get("error") or "Обмен кода не удался")
        return payload

    def refresh(self, refresh_token: str, client_id: str, client_secret: str = None) -> dict:
        data = {"grant_type": "refresh_token", "refresh_token": refresh_token, "client_id": client_id}
        if client_secret:
            data["client_secret"] = client_secret

        resp = requests.post(f"{self.issuer}/oauth/token", data=data, timeout=15)
        payload = resp.json()
        if resp.status_code != 200:
            raise VlyneTokenError(payload.get("error_description") or payload.get("error") or "Обновление не удалось")
        return payload
