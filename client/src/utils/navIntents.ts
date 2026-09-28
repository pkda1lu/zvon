/**
 * Отложенные цели навигации: «открой вкладку заявок», «прокрути к сообщению».
 *
 * Переход по уведомлению часто ведёт в экран, которого ещё нет: список друзей
 * смонтируется только после setShowFriends, сообщения канала подгрузятся
 * позже. Поэтому цель кладётся сюда, а экран забирает её, когда готов, —
 * при монтировании или по событию, если уже открыт.
 */
export interface NavIntents {
    friendsTab?: 'friends' | 'pending';
    jump?: { channelId: string; messageId: string; createdAt?: string };
}

export const NAV_INTENT_EVENT = 'zvon-nav-intent';

const intents: NavIntents = {};

export const setNavIntent = <K extends keyof NavIntents>(key: K, value: NavIntents[K]) => {
    intents[key] = value;
    window.dispatchEvent(new CustomEvent(NAV_INTENT_EVENT, { detail: key }));
};

/** Забрать цель, если она есть и подходит этому экрану. */
export const consumeNavIntent = <K extends keyof NavIntents>(
    key: K,
    match?: (value: NonNullable<NavIntents[K]>) => boolean
): NavIntents[K] | undefined => {
    const value = intents[key];
    if (value === undefined) return undefined;
    if (match && !match(value as NonNullable<NavIntents[K]>)) return undefined;
    delete intents[key];
    return value;
};

/** Событие «перейти к уведомлению»: его слушает Main, шлют входящие, тосты и системные уведомления. */
export const OPEN_NOTIFICATION_EVENT = 'zvon-open-notification';
