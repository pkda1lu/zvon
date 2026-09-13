import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import VlyneIdNav from '../components/VlyneIdNav';
import './VlyneIdDocs.css';

/**
 * Техническая инструкция Vlyne ID — /vlyneid/developers.
 *
 * Отдельно от главной страницы намеренно. На главную приходит обычный человек
 * по ссылке «Подробнее» с экрана входа: ему нужно понять, что стало с его
 * аккаунтом, а таблица эндпоинтов и слова вроде PKCE только отпугивают. Сюда
 * же попадают те, кто действительно подключает вход к своему сервису, — им,
 * наоборот, нужны подробности без лишних уговоров.
 */

const ISSUER = 'https://vlyneid.zvonserver.ru';

// ===== Мелкие строительные блоки =====

const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang }) => {
    const [copied, setCopied] = useState(false);
    const [selected, setSelected] = useState(false);
    const preRef = React.useRef<HTMLPreElement>(null);

    const copy = async () => {
        // Современный путь. Он отказывает чаще, чем кажется: в незащищённом
        // контексте (http на локальной сети), при запрете в настройках и без
        // «жеста пользователя» — поэтому одного его мало.
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
            return;
        } catch { /* пробуем старый способ ниже */ }

        // Запасной путь через скрытое поле: работает там, где Clipboard API
        // недоступен. Устаревший, но пока единственный, и без него кнопка
        // молча ничего не делает — худший из возможных исходов.
        try {
            const area = document.createElement('textarea');
            area.value = code;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const done = document.execCommand('copy');
            document.body.removeChild(area);
            if (done) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
            }
        } catch { /* последний путь ниже */ }

        // Запись в буфер запрещена совсем (так ведут себя встроенные панели
        // предпросмотра и браузеры с отключённым доступом). Тогда хотя бы
        // выделяем код, чтобы человеку осталось нажать Ctrl+C, — молчащая
        // кнопка выглядит как поломка.
        try {
            const node = preRef.current;
            if (!node) return;
            const range = document.createRange();
            range.selectNodeContents(node);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            setSelected(true);
            setTimeout(() => setSelected(false), 2600);
        } catch { /* код всё равно виден и выделяется мышью */ }
    };

    return (
        <div className="vidoc-code">
            <div className="vidoc-code-head">
                <span className="vidoc-code-lang">{lang || 'code'}</span>
                <button className="vidoc-code-copy" onClick={copy}>
                    {copied ? 'Скопировано' : selected ? 'Нажмите Ctrl+C' : 'Копировать'}
                </button>
            </div>
            <pre ref={preRef}><code>{code}</code></pre>
        </div>
    );
};

const Section: React.FC<{ id: string; title: string; lead?: string; children: React.ReactNode }> =
    ({ id, title, lead, children }) => (
        <section id={id} className="vidoc-section">
            <h2>{title}</h2>
            {lead && <p className="vidoc-lead">{lead}</p>}
            {children}
        </section>
    );

// ===== Содержимое =====

const SCOPES = [
    ['openid', 'Постоянный идентификатор аккаунта (sub). Запрашивается всегда'],
    ['profile', 'Имя пользователя, аватар, баннер, описание'],
    ['email', 'Адрес почты и признак того, что она подтверждена'],
    ['telegram', 'Привязка к Telegram: идентификатор и имя'],
    ['vpn:read', 'Состояние VPN-подписки: срок, трафик, серверы'],
    ['vpn:manage', 'Покупка и продление подписки от имени пользователя'],
    ['offline_access', 'Долгий вход: refresh-токен, чтобы не спрашивать вход при каждом запуске']
];

const ENDPOINTS = [
    ['GET', '/.well-known/openid-configuration', 'Описание провайдера. Начинайте отсюда — остальные адреса библиотека возьмёт сама'],
    ['GET', '/oauth/authorize', 'Начало входа: сюда уводите браузер пользователя'],
    ['POST', '/oauth/token', 'Обмен кода на токены и обновление по refresh_token'],
    ['GET', '/oauth/userinfo', 'Данные о владельце access-токена'],
    ['GET', '/oauth/jwks.json', 'Публичный ключ подписи для локальной проверки'],
    ['POST', '/oauth/revoke', 'Отзыв refresh-токена'],
    ['POST', '/oauth/introspect', 'Состояние токена (только для серверных приложений с секретом)'],
    ['GET', '/oauth/logout', 'Выход, инициированный вашим приложением']
];

const NAV = [
    ['how', 'Как устроен вход'],
    ['start', 'Быстрый старт'],
    ['verify', 'Проверка токена'],
    ['scopes', 'Права доступа'],
    ['endpoints', 'Эндпоинты'],
    ['security', 'Безопасность'],
    ['access', 'Получить доступ']
];

const SAMPLE_BROWSER = `import { VlyneID } from './vlyne-id/browser.js';

const id = new VlyneID({
  issuer: '${ISSUER}',
  clientId: 'vlyne_ваш_идентификатор',
  redirectUri: window.location.origin + '/auth/callback',
  scopes: ['openid', 'profile', 'email', 'offline_access']
});

// На странице возврата /auth/callback
if (VlyneID.isCallback()) await id.handleCallback();

// Где угодно в приложении
if (!id.isAuthenticated()) await id.login();

const user = id.user();                      // данные из id_token, без сети
const res  = await id.fetch('/api/profile'); // токен подставится и обновится сам`;

const SAMPLE_MANUAL = `// 1. PKCE: секрет попытки входа и его отпечаток
const verifier  = base64url(crypto.getRandomValues(new Uint8Array(48)));
const challenge = base64url(await crypto.subtle.digest('SHA-256',
                    new TextEncoder().encode(verifier)));

// 2. Уводим браузер на Vlyne ID
location.assign('${ISSUER}/oauth/authorize?' + new URLSearchParams({
  client_id: 'vlyne_ваш_идентификатор',
  redirect_uri: 'https://ваш-сервис/auth/callback',
  response_type: 'code',
  scope: 'openid profile email',
  state, nonce,
  code_challenge: challenge,
  code_challenge_method: 'S256'
}));

// 3. На странице возврата меняем код на токены
const r = await fetch('${ISSUER}/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code, client_id: 'vlyne_ваш_идентификатор',
    redirect_uri: 'https://ваш-сервис/auth/callback',
    code_verifier: verifier
  })
});
const { access_token, id_token, refresh_token } = await r.json();`;

const SAMPLE_NODE = `const { VlyneVerifier } = require('./vlyne-id/node');

const verifier = new VlyneVerifier({
  issuer: '${ISSUER}',
  audience: 'vlyne_ваш_идентификатор'
});

app.get('/api/profile', verifier.middleware({ scopes: ['profile'] }), (req, res) => {
  // req.vlyne = { sub, clientId, scopes, claims }
  res.json({ userId: req.vlyne.sub });
});`;

const SAMPLE_PYTHON = `from vlyne_id import VlyneVerifier, VlyneTokenError, VlyneScopeError

verifier = VlyneVerifier("${ISSUER}", audience="vlyne_ваш_идентификатор")

try:
    claims = verifier.verify(token, require_scopes=["profile"])
except VlyneScopeError:
    ...  # прав не хватает: обновление токена не поможет, нужен новый вход
except VlyneTokenError:
    ...  # токен негоден

user_id = claims["sub"]`;

const SAMPLE_ANY = `# Любая библиотека OIDC: достаточно одного адреса,
# всё остальное она вычитает из discovery
issuer:     ${ISSUER}
client_id:  vlyne_ваш_идентификатор
scopes:     openid profile email
PKCE:       обязателен, метод S256`;

const VlyneIdDocs: React.FC = () => {
    const [tab, setTab] = useState<'browser' | 'manual'>('browser');
    const [verifyTab, setVerifyTab] = useState<'node' | 'python' | 'any'>('node');
    const [active, setActive] = useState('how');
    const navigate = useNavigate();

    // Подсветка текущего раздела в боковом меню. Без неё на длинной странице
    // невозможно понять, где ты находишься.
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (visible) setActive(visible.target.id);
            },
            { rootMargin: '-20% 0px -70% 0px' }
        );
        NAV.forEach(([id]) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    // На поддомене разделы Vlyne ID живут в корне, на основном — под /vlyneid.
    const isSubdomain = /^vlyneid\./i.test(window.location.hostname);
    const homePath = isSubdomain ? '/' : '/vlyneid';
    const accountPath = isSubdomain ? '/account' : '/vlyneid/account';
    const devCabinetPath = isSubdomain ? '/developers/cabinet' : '/vlyneid/developers/cabinet';

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="vidoc">
            <VlyneIdNav actions={[
                { label: 'О Vlyne ID', to: homePath },
                { label: 'Кабинет разработчика', to: devCabinetPath, primary: true }
            ]} />

            <header className="vidoc-pagehead">
                <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                    <button className="vidoc-back" onClick={() => navigate(homePath)}>
                        ← Vlyne ID
                    </button>
                    <div className="vidoc-badge">OAuth 2.1 · OpenID Connect</div>
                    <h1>Подключение Vlyne ID</h1>
                    <p className="vidoc-hero-text">
                        Вход через Vlyne ID снимает с вашего сервиса аутентификацию целиком:
                        пароли остаются у нас, вы получаете проверяемый токен и постоянный
                        идентификатор пользователя.
                    </p>
                    <div className="vidoc-hero-meta">
                        <span>PKCE обязателен</span>
                        <span>Подпись RS256</span>
                        <span>Проверка без обращения к нам</span>
                    </div>
                </motion.div>
            </header>

            <div className="vidoc-layout">
                <aside className="vidoc-side">
                    {NAV.map(([id, label]) => (
                        <button
                            key={id}
                            className={`vidoc-side-item ${active === id ? 'active' : ''}`}
                            onClick={() => scrollTo(id)}
                        >
                            {label}
                        </button>
                    ))}
                </aside>

                <main className="vidoc-main">
                    <Section
                        id="how"
                        title="Как устроен вход"
                        lead="Стандартный поток authorization code с PKCE. Ваш код участвует в двух местах: отправляет пользователя и обменивает код на токены."
                    >
                        <ol className="vidoc-steps">
                            <li>
                                <span className="vidoc-step-n">1</span>
                                <div>
                                    <h4>Вы уводите браузер на Vlyne ID</h4>
                                    <p>С параметрами: кто вы (<code>client_id</code>), куда вернуть
                                        (<code>redirect_uri</code>), что просите (<code>scope</code>) и отпечаток
                                        секрета попытки (<code>code_challenge</code>).</p>
                                </div>
                            </li>
                            <li>
                                <span className="vidoc-step-n">2</span>
                                <div>
                                    <h4>Пользователь подтверждает доступ</h4>
                                    <p>Если он уже вошёл в Vlyne — это одно нажатие. Если входил в ваш сервис
                                        раньше — экран не показывается вообще, согласие уже запомнено.</p>
                                </div>
                            </li>
                            <li>
                                <span className="vidoc-step-n">3</span>
                                <div>
                                    <h4>Браузер возвращается к вам с кодом</h4>
                                    <p>Код одноразовый и живёт минуту. Сам по себе он бесполезен: без секрета
                                        попытки (<code>code_verifier</code>), который не покидал ваше приложение,
                                        обменять его нельзя.</p>
                                </div>
                            </li>
                            <li>
                                <span className="vidoc-step-n">4</span>
                                <div>
                                    <h4>Вы меняете код на токены</h4>
                                    <p><code>access_token</code> для доступа к API, <code>id_token</code> —
                                        кто вошёл, <code>refresh_token</code> — чтобы не спрашивать вход заново.</p>
                                </div>
                            </li>
                        </ol>

                        <div className="vidoc-note">
                            <strong>Идентификатор пользователя</strong> приходит в поле <code>sub</code> и не
                            меняется никогда — ни при смене почты, ни при смене имени. Привязывайте свои записи
                            именно к нему, а не к почте или нику.
                        </div>
                    </Section>

                    <Section
                        id="start"
                        title="Быстрый старт"
                        lead="Три шага: получить идентификатор приложения, увести пользователя на вход, обменять код на токены."
                    >
                        <h3 className="vidoc-sub">1. Зарегистрируйте приложение</h3>
                        <p>
                            Напишите нам (см. <button className="vidoc-inline-link" onClick={() => scrollTo('access')}>Получить
                            доступ</button>), указав название сервиса и точные адреса возврата. В ответ придёт
                            <code>client_id</code>, а для серверных приложений — ещё и секрет.
                        </p>
                        <div className="vidoc-note vidoc-note-warn">
                            Адреса возврата сверяются <strong>посимвольно</strong>: ни префиксов, ни шаблонов.
                            Если у вас есть отладочный адрес вроде <code>http://localhost:3000/auth/callback</code>,
                            перечислите его сразу — иначе локальная разработка не заработает.
                        </div>

                        <h3 className="vidoc-sub">2. Проведите пользователя через вход</h3>
                        <div className="vidoc-tabs">
                            <button className={tab === 'browser' ? 'active' : ''} onClick={() => setTab('browser')}>
                                С нашим SDK
                            </button>
                            <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>
                                Вручную
                            </button>
                        </div>
                        {tab === 'browser'
                            ? <>
                                <CodeBlock lang="javascript" code={SAMPLE_BROWSER} />
                                <p className="vidoc-muted">
                                    SDK — один файл без зависимостей: он копируется в проект, а не ставится пакетом.
                                    Сам делает PKCE, проверяет <code>state</code> и <code>nonce</code>, хранит токены
                                    и обновляет их до истечения.
                                </p>
                            </>
                            : <>
                                <CodeBlock lang="javascript" code={SAMPLE_MANUAL} />
                                <p className="vidoc-muted">
                                    Если пишете сами — обязательно сверяйте вернувшийся <code>state</code> с
                                    отправленным и <code>nonce</code> внутри <code>id_token</code>. Иначе чужая
                                    вкладка сможет подсунуть вашему приложению ответ от другой попытки входа.
                                </p>
                            </>}

                        <h3 className="vidoc-sub">3. Проверяйте токен на своём сервере</h3>
                        <p>Дальше — раздел ниже: проверка полностью локальная, обращаться к нам на каждый запрос не нужно.</p>
                    </Section>

                    <Section
                        id="verify"
                        title="Проверка токена"
                        lead="Access-токен — подписанный JWT. Публичный ключ берётся один раз и кешируется, поэтому ваш сервис не зависит от нашей доступности."
                    >
                        <div className="vidoc-tabs">
                            <button className={verifyTab === 'node' ? 'active' : ''} onClick={() => setVerifyTab('node')}>Node.js</button>
                            <button className={verifyTab === 'python' ? 'active' : ''} onClick={() => setVerifyTab('python')}>Python</button>
                            <button className={verifyTab === 'any' ? 'active' : ''} onClick={() => setVerifyTab('any')}>Другой язык</button>
                        </div>
                        {verifyTab === 'node' && <CodeBlock lang="javascript" code={SAMPLE_NODE} />}
                        {verifyTab === 'python' && <CodeBlock lang="python" code={SAMPLE_PYTHON} />}
                        {verifyTab === 'any' && <>
                            <CodeBlock lang="конфигурация" code={SAMPLE_ANY} />
                            <p className="vidoc-muted">
                                Vlyne ID отдаёт стандартный <code>/.well-known/openid-configuration</code>, поэтому
                                подойдёт любая проверенная библиотека OIDC для вашего языка. Своя реализация
                                проверки подписи не нужна и не рекомендуется.
                            </p>
                        </>}

                        <div className="vidoc-note vidoc-note-warn">
                            Что бы вы ни использовали, алгоритм подписи задавайте явно (<code>RS256</code>), а не
                            берите из заголовка токена. Доверие к полю <code>alg</code> внутри проверяемых данных —
                            классический способ принять подделку.
                        </div>
                    </Section>

                    <Section
                        id="scopes"
                        title="Права доступа"
                        lead="Просите ровно то, что нужно: каждое право — отдельная строка на экране согласия, и лишние уменьшают шанс, что человек нажмёт «Разрешить»."
                    >
                        <div className="vidoc-table-wrap">
                            <table className="vidoc-table">
                                <thead><tr><th>Право</th><th>Что даёт</th></tr></thead>
                                <tbody>
                                    {SCOPES.map(([scope, text]) => (
                                        <tr key={scope}><td><code>{scope}</code></td><td>{text}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="vidoc-muted">
                            Права <code>vpn:read</code> и <code>vpn:manage</code> выдаются не всем — они касаются
                            чужих денег и подписки, поэтому запрашивайте их, только если ваш сервис действительно
                            работает с VPN Vlyne.
                        </p>
                    </Section>

                    <Section id="endpoints" title="Эндпоинты" lead={`Базовый адрес — ${ISSUER}`}>
                        <div className="vidoc-table-wrap">
                            <table className="vidoc-table">
                                <thead><tr><th>Метод</th><th>Адрес</th><th>Назначение</th></tr></thead>
                                <tbody>
                                    {ENDPOINTS.map(([method, path, text]) => (
                                        <tr key={path}>
                                            <td><span className="vidoc-method">{method}</span></td>
                                            <td><code>{path}</code></td>
                                            <td>{text}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    <Section
                        id="security"
                        title="Безопасность"
                        lead="Что Vlyne ID гарантирует со своей стороны — и что остаётся на вашей."
                    >
                        <div className="vidoc-cards vidoc-cards-two">
                            <div className="vidoc-card">
                                <h3>PKCE обязателен всем</h3>
                                <p>Включая серверные приложения с секретом. Он защищает не от кражи секрета, а от
                                    перехвата кода на редиректе — это разные угрозы.</p>
                            </div>
                            <div className="vidoc-card">
                                <h3>Ключ подписи не покидает сервер</h3>
                                <p>Вы получаете только публичную половину. Выпустить токен от имени пользователя
                                    не может никто, кроме Vlyne ID.</p>
                            </div>
                            <div className="vidoc-card">
                                <h3>Долгие токены ротируются</h3>
                                <p>Каждое обновление выдаёт новый refresh-токен. Повторное использование старого
                                    считается кражей и гасит всю цепочку входа.</p>
                            </div>
                            <div className="vidoc-card">
                                <h3>Доступ отзываем в любой момент</h3>
                                <p>Пользователь отключает приложение в настройках аккаунта — и уже выданные долгие
                                    токены перестают работать сразу, а не по истечении срока.</p>
                            </div>
                        </div>

                        <div className="vidoc-note">
                            <strong>На вашей стороне остаётся немного:</strong> хранить <code>client_secret</code>
                            только на сервере (в браузерном приложении его быть не должно вовсе), не передавать
                            токены третьим лицам и проверять <code>aud</code> — токен, выписанный другому
                            приложению, не должен приниматься только потому, что подпись верна.
                        </div>
                    </Section>

                    <Section
                        id="access"
                        title="Получить доступ"
                        lead="Регистрация приложений не самообслуживаемая — и это осознанно."
                    >
                        <p>
                            Vlyne ID отдаёт доступ к аккаунтам людей, поэтому заявку читает человек, а не
                            обрабатывает форма. Но «читает человек» не значит «заводится руками в консоли»:
                            модератор принимает решение, а приложение создаётся само — из тех же полей, что
                            он только что прочитал.
                        </p>
                        <p>
                            Подайте заявку в{' '}
                            <button className="vidoc-inline-link" onClick={() => navigate(devCabinetPath)}>
                                кабинете разработчика
                            </button>{' '}
                            — там же видно её состояние и переписку с модератором.
                        </p>
                        <ul className="vidoc-list">
                            <li>название сервиса, адрес сайта и политика конфиденциальности;</li>
                            <li>точные адреса возврата, включая отладочные;</li>
                            <li>какие права нужны и зачем именно они;</li>
                            <li>тип приложения: публичное (секрет хранить негде) или серверное.</li>
                        </ul>
                        <p className="vidoc-muted">
                            После одобрения <code>client_id</code> появится в кабинете. Секрет серверного
                            приложения там же выпускается по кнопке и показывается один раз: у нас хранится
                            только его хеш, как у пароля.
                        </p>
                        <button className="vidoc-btn vidoc-btn-primary" onClick={() => navigate(devCabinetPath)}>
                            Открыть кабинет разработчика
                        </button>
                    </Section>
                </main>
            </div>

            <footer className="vidoc-footer">
                <div>Vlyne ID — единый вход экосистемы Vlyne</div>
                <div className="vidoc-footer-links">
                    <a href={accountPath}>Личный кабинет</a>
                    <a href="https://zvonserver.ru">Zvon</a>
                    <a href="mailto:support@zvonserver.ru">Поддержка</a>
                    <a href={`${ISSUER}/.well-known/openid-configuration`}>Discovery</a>
                </div>
            </footer>
        </div>
    );
};

export default VlyneIdDocs;
