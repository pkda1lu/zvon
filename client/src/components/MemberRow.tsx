import React from 'react';
import { useLongPress } from '../utils/useLongPress';

/**
 * Презентационная строка участника/сущности — единая обёртка `member-item`,
 * которую раньше независимо повторяли ServerMembers (список участников сервера)
 * и ProfilePreview (общие друзья/серверы).
 *
 * Разметка сохранена 1:1 с прежней, поэтому глобальные стили `.member-item`
 * (ServerMembers.css) и `.mutual-list-members .member-item` (UserProfileCard.css)
 * применяются как и прежде — визуально ничего не меняется.
 *
 * Слоты:
 *  - avatar   — содержимое `.member-avatar-wrap` (аватар + статус/значок);
 *  - children — содержимое `.member-name-row` (имя, бейджи и т.п.);
 *  - extra    — доп. блок после имени внутри `.member-info` (напр. активность);
 *  - offline  — оффлайн-вариант: без обёртки `.member-info` и с классом `offline`.
 */
export interface MemberRowProps {
    avatar: React.ReactNode;
    children: React.ReactNode;
    extra?: React.ReactNode;
    offline?: boolean;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

const MemberRow: React.FC<MemberRowProps> = ({
    avatar, children, extra, offline, className, onClick, onContextMenu,
}) => {
    /*
     * Долгое нажатие открывает то же меню, что и правый щелчок: на телефоне
     * правого щелчка нет. Подключено здесь, а не у каждого списка отдельно —
     * через MemberRow проходят и участники сервера, и предпросмотр профиля.
     *
     * Обработчик ждёт событие мыши, а у нас касание. Собираем объект с теми
     * полями, которыми пользуются вызывающие: координаты и отмена действия по
     * умолчанию. Полноценное MouseEvent здесь не создать, да и незачем.
     */
    const longPress = useLongPress(({ x, y }) => {
        onContextMenu?.({
            preventDefault: () => { },
            stopPropagation: () => { },
            clientX: x,
            clientY: y,
        } as React.MouseEvent);
    });

    const nameRow = <div className="member-name-row">{children}</div>;
    return (
        <div
            {...(onContextMenu ? longPress : {})}
            className={`member-item${offline ? ' offline' : ''}${className ? ' ' + className : ''}${onContextMenu ? ' ' + longPress.className : ''}`}
            onClick={onClick}
            onContextMenu={onContextMenu}
        >
            <div className="member-avatar-wrap">{avatar}</div>
            {offline ? nameRow : (
                <div className="member-info">
                    {nameRow}
                    {extra}
                </div>
            )}
        </div>
    );
};

export default MemberRow;
