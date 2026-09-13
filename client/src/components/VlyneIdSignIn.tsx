import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

/**
 * Вход на страницах Vlyne ID.
 *
 * Общий для личного кабинета и кабинета разработчика: это один и тот же
 * аккаунт и один и тот же экран, и расходиться они должны только намеренно.
 *
 * Поддомен — отдельный origin, поэтому токен сессии Zvon с основного домена
 * сюда не попадает и вход выполняется заново. Это не недоработка, а то же
 * правило, которое защищает вкладки друг от друга; API при этом общий.
 */

const VlyneIdSignIn: React.FC<{ title?: string; lead?: string }> = ({
    title = 'Личный кабинет',
    lead = 'Это тот же аккаунт, что и в Zvon: отдельной регистрации не нужно.'
}) => {
    const { login, verifyLogin } = useAuth();
    const [step, setStep] = useState<'password' | 'code'>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            if (step === 'password') {
                const data = await login(email, password);
                // Двухфакторная включена — сервер не выдал токен, а прислал
                // признак и адрес, на который ушёл код.
                if (data?.requires2FA) {
                    setEmail(data.email || email);
                    setStep('code');
                }
            } else {
                await verifyLogin(email, code);
            }
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось войти. Проверьте данные.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="vida-signin">
            <motion.form
                className="vida-signin-card"
                onSubmit={submit}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
                <h1>{title}</h1>
                <p className="vida-signin-lead">{lead}</p>

                {step === 'password' ? (
                    <>
                        <label className="vida-field">
                            <span>Почта или имя пользователя</span>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="username"
                                required
                            />
                        </label>
                        <label className="vida-field">
                            <span>Пароль</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </label>
                    </>
                ) : (
                    <label className="vida-field">
                        <span>Код из письма</span>
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                        />
                    </label>
                )}

                {error && <div className="vida-error">{error}</div>}

                <button className="vidoc-btn vidoc-btn-primary vida-submit" type="submit" disabled={busy}>
                    {busy ? 'Подождите…' : step === 'password' ? 'Войти' : 'Подтвердить'}
                </button>

                <p className="vida-signin-note">
                    Пароль проверяется тем же сервером, что и в Zvon. Забыли — восстановите
                    на <a href="https://zvonserver.ru/login">zvonserver.ru</a>.
                </p>
            </motion.form>
        </div>
    );
};

export default VlyneIdSignIn;
