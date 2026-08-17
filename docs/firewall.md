# Фаервол и защита сервера

Настройка ufw, fail2ban и ограничений nginx на VPS с Zvon.

Порядок действий важен: сначала разведка, потом разрешения, и только в конце
запрет всего остального. Обратный порядок отрезает вас от сервера.

> Держите вкладку с консолью VPS в панели Aeza открытой всё время работы.
> Это запасной вход, если SSH оборвётся.

---

## 1. Разведка: что на самом деле слушает сеть

Не настраивайте фаервол по памяти. Сначала посмотрите, что есть.

```bash
sudo ss -tulpn | sort -k5
```

Читать так: `0.0.0.0:*` и `[::]:*` — служба доступна **из интернета**,
`127.0.0.1:*` — только локально, снаружи не видна.

Ожидаемая картина для Zvon:

| Порт | Служба | Должен быть виден снаружи |
|---|---|---|
| 22 | SSH | да |
| 80, 443 | nginx | да |
| 5000 | Zvon (Express) | **нет** — только через nginx |
| 27017 | MongoDB | **нет, категорически** |
| 25 | Postfix | см. раздел 6 |
| 7880 | LiveKit, сигнализация | нет, если её проксирует nginx |
| 7881 | LiveKit, запасной канал TCP | да |
| UDP-диапазон | LiveKit, медиа | да |

### 1.1 MongoDB — проверьте в первую очередь

```bash
grep -A2 "^net:" /etc/mongod.conf
```

Должно быть `bindIp: 127.0.0.1`. Если там `0.0.0.0` — база открыта всему
интернету. Это самая частая причина, по которой сервер «взламывают»: базу
находят сканером, выгружают и требуют выкуп за возврат. Исправьте немедленно,
не дожидаясь фаервола:

```bash
sudo sed -i 's/^\( *bindIp:\).*/\1 127.0.0.1/' /etc/mongod.conf && sudo systemctl restart mongod
```

### 1.2 Порты LiveKit

Значения из вашего конфига, а не из документации:

```bash
grep -E "port|rtc|turn|use_external_ip" -A4 /etc/livekit/config.yaml 2>/dev/null || sudo find / -name "livekit*.yaml" -not -path "*/node_modules/*" 2>/dev/null
```

Ищите `port` (обычно 7880), `port_range_start`/`port_range_end` (обычно
50000–60000) либо `udp_port` (обычно 7882), и включён ли `turn`.

**Медиа идут по UDP.** Если закрыть этот диапазон, голос либо не соединится,
либо свалится на TCP 7881 — со скачками задержки. Это ровно тот случай, когда
«всё работало, а после фаервола голос сломался».

### 1.3 LiveKit в Docker? Проверьте обязательно

```bash
docker ps 2>/dev/null
```

**Если LiveKit (или что угодно ещё) работает в Docker — ufw его не защищает.**
Docker вписывает свои правила в iptables до правил ufw, и опубликованный
контейнером порт остаётся открытым, даже когда ufw показывает `deny`. Это не
ошибка настройки, а известное поведение Docker.

Лечится двумя способами:

- публиковать порт только на петлю: `-p 127.0.0.1:7880:7880` вместо `-p 7880:7880`;
- либо добавить правила в цепочку `DOCKER-USER`, которую Docker не перезаписывает.

Если Docker не используется — пропустите, ufw работает как ожидается.

### 1.4 Кто и как вас атакует

Пока не глядя в логи, настройка идёт вслепую. Три команды дают картину.

Перебор паролей SSH — кто и сколько раз:

```bash
sudo grep "Failed password" /var/log/auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn | head -20
```

Самые активные адреса в nginx и что они запрашивают:

```bash
sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20
sudo awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20
```

Попытки переслать почту через ваш сервер:

```bash
sudo grep -c "NOQUEUE: reject" /var/log/mail.log
```

Сохраните вывод — по нему будет видно, помогла ли настройка.

---

## 2. Базовые правила ufw

Разрешения — первыми, запрет — последним. Ни в коем случае не наоборот.

```bash
sudo apt update && sudo apt install -y ufw
```

### 2.1 Сначала SSH

Если SSH не на 22 порту, подставьте свой — иначе следующий шаг вас отрежет.

```bash
sudo ufw limit 22/tcp comment 'SSH с ограничением частоты'
```

`limit` вместо `allow` — встроенная защита: больше 6 подключений с одного
адреса за 30 секунд начинают отклоняться. Это само по себе гасит основную массу
перебора паролей.

### 2.2 Сайт

```bash
sudo ufw allow 80/tcp  comment 'HTTP, перенаправление и обновление сертификата'
sudo ufw allow 443/tcp comment 'HTTPS и веб-сокеты'
```

Порт 80 нужен, даже если сайт полностью на HTTPS: по нему Let's Encrypt
продлевает сертификат.

### 2.3 LiveKit

Подставьте значения, найденные в пункте 1.2:

```bash
sudo ufw allow 7881/tcp comment 'LiveKit, запасной канал TCP'
sudo ufw allow 50000:60000/udp comment 'LiveKit, медиа'
```

Если в конфиге один UDP-порт вместо диапазона — вместо второй строки:

```bash
sudo ufw allow 7882/udp comment 'LiveKit, медиа'
```

Если включён TURN:

```bash
sudo ufw allow 3478/udp comment 'TURN'
sudo ufw allow 5349/tcp comment 'TURN поверх TLS'
```

Порт **7880 открывать не нужно**, если клиенты подключаются к
`wss://zvonserver.ru` и nginx проксирует их на 7880 локально. Проверить:

```bash
grep -rn "7880" /etc/nginx/
```

Если совпадения есть — nginx проксирует, порт наружу не открываем.
Если нет — клиенты ходят на 7880 напрямую, и тогда его нужно открыть, а заодно
подумать о переносе за nginx: так соединение шифруется и попадает под общие
ограничения.

### 2.4 Запрет всего остального

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

`allow outgoing` обязателен: сервер сам ходит наружу — отправляет почту,
доставляет push-уведомления, обновляет пакеты.

Проверьте результат:

```bash
sudo ufw status verbose numbered
```

Порты 5000 и 27017 в списке разрешённых быть **не должны**.

---

## 3. Страховка от блокировки

Если вы правите правила по SSH и есть шанс отрезать себя, поставьте отложенный
откат до опасной команды:

```bash
sudo apt install -y at
echo "ufw --force disable" | sudo at now + 10 minutes
```

Успели убедиться, что связь жива — отмените откат:

```bash
sudo atq              # посмотреть номер задания
sudo atrm НОМЕР       # отменить
```

Консоль в панели Aeza — второй запасной вход, ufw на неё не влияет.

---

## 4. fail2ban: блокировать тех, кто долбится

Фаервол не отличает злоумышленника от пользователя — он смотрит только на порт.
fail2ban читает логи и временно банит адреса, которые ведут себя как перебор.

```bash
sudo apt install -y fail2ban
```

Настройки правьте **только** в `jail.local` — `jail.conf` перезаписывается при
обновлении пакета.

```bash
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
# Время бана и окно наблюдения
bantime  = 1h
findtime = 10m
maxretry = 5
# Свои адреса, чтобы не забанить себя. Впишите свой домашний IP.
ignoreip = 127.0.0.1/8 ::1
backend  = systemd

[sshd]
enabled  = true
maxretry = 4
bantime  = 4h

# Повторные нарушители: кого забанили трижды — банится надолго
[recidive]
enabled  = true
bantime  = 7d
findtime = 1d
maxretry = 3

[nginx-http-auth]
enabled = true

# Срабатывает на превышение лимитов из раздела 5
[nginx-limit-req]
enabled  = true
maxretry = 10

[postfix]
enabled = true
mode    = aggressive
EOF

sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
```

Проверка:

```bash
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

Разбанить свой адрес, если случайно попали:

```bash
sudo fail2ban-client set sshd unbanip ВАШ_IP
```

---

## 5. Ограничения в nginx

**Против флуда на сайт фаервол бесполезен** — запросы приходят на разрешённый
443 порт и внешне неотличимы от настоящих. Ограничивать нужно в nginx.

В `/etc/nginx/nginx.conf`, внутри блока `http { }`:

```nginx
# Зоны счётчиков. 10m хватает примерно на 160 тысяч адресов.
limit_req_zone  $binary_remote_addr zone=zvon_api:10m   rate=20r/s;
limit_req_zone  $binary_remote_addr zone=zvon_login:10m rate=10r/m;
limit_conn_zone $binary_remote_addr zone=zvon_conn:10m;

# Чтобы fail2ban видел срабатывания
limit_req_log_level warn;
limit_req_status 429;
```

В блоке `server { }` вашего сайта:

```nginx
# Вход и регистрация — самое ценное для перебора, лимит жёстче
location /api/auth/ {
    limit_req zone=zvon_login burst=5 nodelay;
    proxy_pass http://127.0.0.1:5000;
    include proxy_params;
}

location /api/ {
    limit_req  zone=zvon_api burst=40 delay=20;
    limit_conn zone=zvon_conn 20;
    proxy_pass http://127.0.0.1:5000;
    include proxy_params;
}

# Веб-сокеты ограничивать по частоте нельзя — это одно долгое соединение.
# Ограничиваем только их количество с адреса.
location /socket.io/ {
    limit_conn zone=zvon_conn 20;
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    include proxy_params;
}

# Размер тела запроса. Загрузка файлов идёт с ограничением 100 МБ,
# поэтому ниже опускать нельзя — иначе сломается отправка вложений.
client_max_body_size 100m;

# Обрыв медленных соединений: приём заголовков и тела по байту в секунду —
# дешёвый способ занять все рабочие процессы
client_body_timeout   15s;
client_header_timeout 15s;
send_timeout          15s;
```

`burst` с `nodelay` пропускает всплеск и режет только сверх него — обычный
пользователь, открывающий приложение, шлёт десяток запросов подряд и не должен
получать отказ.

Проверить и применить:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` обязателен: `reload` с битым конфигом оставит nginx на старом, а вот
`restart` — уронит сайт.

---

## 6. Почта

Здесь нужно ваше решение.

Изначально сервер настраивался **только на отправку** — Postfix слушал петлю,
принимать письма извне не требовалось. Но по 152-ФЗ адрес `privacy@zvonserver.ru`
опубликован как контакт для обращений субъектов, и он **должен принимать почту**.

Если приём нужен:

```bash
sudo ufw allow 25/tcp comment 'SMTP, входящая почта'
```

И обязательно убедитесь, что сервер не пересылает чужую почту — открытый релэй
за сутки превращает домен в спам-источник и рассылки перестают доходить:

```bash
postconf mynetworks smtpd_relay_restrictions
```

В `smtpd_relay_restrictions` должно присутствовать `reject_unauth_destination`.
В `mynetworks` — только `127.0.0.0/8` и локальные адреса, никаких `0.0.0.0/0`.

Если приём не нужен — порт 25 наружу **не открывайте**, отправка через него
продолжит работать (исходящие соединения разрешены).

Отдельно: порты 587 и 465 нужны, только если вы подключаете почтовый клиент
снаружи. Для Zvon они не требуются.

---

## 7. SSH: где основная выгода

Перебор паролей перестаёт быть проблемой, когда пароли отключены.

**Сначала ключ, потом запрет.** Обратный порядок закроет вам вход.

На своей машине:

```bash
ssh-keygen -t ed25519
ssh-copy-id пользователь@zvonserver.ru
```

Проверьте, что вход по ключу работает, **не закрывая текущую сессию**. Только
после этого в `/etc/ssh/sshd_config`:

```
PasswordAuthentication no
PermitRootLogin prohibit-password
```

```bash
sudo sshd -t && sudo systemctl reload sshd
```

`sshd -t` проверяет конфиг — без него опечатка оставит вас без SSH.

---

## 8. Проверка

Снаружи, со своей машины (не с сервера — оттуда все порты видны локально):

```bash
nmap -Pn -p 22,25,80,443,5000,7880,7881,27017 zvonserver.ru
```

Ожидаем `open` на 22, 80, 443, 7881 и `filtered` на 5000 и 27017.
Если 5000 или 27017 показывают `open` — правила не применились либо порт
опубликован Docker в обход ufw (см. 1.3).

Изнутри:

```bash
sudo ufw status verbose
sudo fail2ban-client status
curl -s -o /dev/null -w "%{http_code}\n" https://zvonserver.ru/api/health
```

И обязательно **проверьте голос вживую**, зайдя в голосовой канал вдвоём.
Ограничения UDP ломают именно его, и в логах это никак не отражается.

---

## 9. Откат

```bash
sudo ufw disable                       # снять фаервол целиком
sudo ufw status numbered               # посмотреть номера правил
sudo ufw delete НОМЕР                  # удалить одно правило
sudo systemctl stop fail2ban           # снять баны
```

Правила ufw переживают перезагрузку. fail2ban после перезапуска службы забывает
активные баны, но не историю.
