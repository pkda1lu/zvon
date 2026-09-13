import React from 'react';
import { getIconBrand } from '../utils/branding';
import { VLYNE_ID_LOGO } from './VlyneIdNav';

/**
 * Пояснение про Vlyne ID на страницах входа и регистрации.
 *
 * Аккаунт здесь и есть Vlyne ID, но человек об этом не знает: он пришёл
 * регистрироваться в Zvon. Молча превращать его учётную запись в ключ от
 * нескольких сервисов — значит потом получить вопрос «откуда этот сайт знает
 * мою почту». Поэтому говорим об этом там, где решение принимается.
 *
 * Название бренда подставляется: на maxcord.fun фраза «аккаунт Zvon» была бы
 * просто неверной.
 */

const VlyneIdNotice: React.FC<{ variant: 'register' | 'login' }> = ({ variant }) => {
    const brand = getIconBrand().name;

    return (
        <div
            style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                textAlign: 'left',
                padding: '14px 16px',
                marginBottom: '28px',
                background: 'rgba(124, 140, 255, 0.07)',
                border: '1px solid rgba(124, 140, 255, 0.2)',
                borderRadius: '14px'
            }}
        >
            <img
                src={VLYNE_ID_LOGO}
                alt=""
                style={{ width: 30, height: 30, flexShrink: 0, objectFit: 'contain' }}
            />
            <div style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'var(--text-dim)' }}>
                {variant === 'register' ? (
                    <>
                        Регистрируясь, вы создаёте <strong style={{ color: '#fff' }}>Vlyne ID</strong> — единый
                        аккаунт для всех проектов экосистемы Vlyne. Отдельная регистрация в них не понадобится.
                    </>
                ) : (
                    <>
                        Ваш аккаунт {brand} теперь <strong style={{ color: '#fff' }}>Vlyne ID</strong> — один вход
                        во все проекты экосистемы Vlyne. Делать ничего не нужно: логин и пароль те же.
                    </>
                )}
                {' '}
                <a
                    href="https://vlyneid.zvonserver.ru"
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: '#7c8cff', whiteSpace: 'nowrap' }}
                >
                    Подробнее
                </a>
            </div>
        </div>
    );
};

export default VlyneIdNotice;
