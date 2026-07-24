// Общая база иконок-значков — используется и как значки профиля пользователя
// (Настройки → Профиль), и как готовые иконки для значка сервера (Настройки
// сервера → Значок), чтобы не дублировать один и тот же набор в двух местах.
export interface BadgeIcon {
    id: string;
    label: string;
    image: string;
}

export const AVAILABLE_BADGES: BadgeIcon[] = [
    { id: 'dev', label: 'Разработчик', image: './badges/developer.png' },
    { id: 'premium', label: 'Премиум', image: './badges/premium.png' },
    { id: 'moderator', label: 'Модератор', image: './badges/moderate.png' },
    { id: 'artist', label: 'Художник', image: './badges/painter.png' },
    { id: 'gamer', label: 'Геймер', image: './badges/gamer.png' },
    { id: 'meow', label: 'Котик', image: './badges/cat.png' },
    { id: 'staff', label: 'Персонал', image: './badges/personal%20stuff.png' },
    { id: 'bug_hunter', label: 'Охотник за багами', image: './badges/Bug.png' }
];
