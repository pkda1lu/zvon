import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Шапка страниц Vlyne ID — витрины и личного кабинета.
 *
 * Вынесена в отдельный файл, потому что она общая для двух страниц: логотип и
 * набор ссылок должны расходиться только намеренно, а не потому, что правку
 * внесли в одну копию из двух.
 *
 * Переходы делаем через router, а не через href: на поддомене
 * vlyneid.zvonserver.ru это одно и то же SPA, и полная перезагрузка страницы
 * ради смены раздела — лишняя.
 */

export const VLYNE_ID_LOGO = '/iconVlyneID-64.png';

type Action = { label: string; to?: string; href?: string; primary?: boolean };

const VlyneIdNav: React.FC<{ actions?: Action[] }> = ({ actions = [] }) => {
    const navigate = useNavigate();

    // На поддомене витрина живёт в корне, на основном домене — по /vlyneid.
    const home = /^vlyneid\./i.test(window.location.hostname) ? '/' : '/vlyneid';

    return (
        <nav className="vidoc-nav">
            <div className="vidoc-logo" onClick={() => navigate(home)} role="link" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(home); }}>
                <img className="vidoc-mark-img" src={VLYNE_ID_LOGO} alt="" />
                <span className="vidoc-name">Vlyne ID</span>
            </div>

            <div className="vidoc-nav-actions">
                {actions.map((a) => (
                    a.href ? (
                        <a
                            key={a.label}
                            className={a.primary ? 'vidoc-btn vidoc-btn-primary' : 'vidoc-nav-link'}
                            href={a.href}
                        >
                            {a.label}
                        </a>
                    ) : (
                        <button
                            key={a.label}
                            className={a.primary ? 'vidoc-btn vidoc-btn-primary' : 'vidoc-nav-link vidoc-nav-link-btn'}
                            onClick={() => a.to && navigate(a.to)}
                        >
                            {a.label}
                        </button>
                    )
                ))}
            </div>
        </nav>
    );
};

export default VlyneIdNav;
