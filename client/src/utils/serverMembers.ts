import { useMemo } from 'react';
import { Server } from '../types';

/**
 * Индекс участников сервера по id пользователя.
 *
 * Зачем: раньше профиль участника искали через server.members.find(...) прямо
 * в рендере — по разу (а местами дважды) на каждое сообщение, на каждого
 * участника голосового канала и на каждую строку списка. Это линейный проход по
 * всем участникам сервера на каждый элемент, то есть O(сообщений × участников).
 * На сервере с сотнями участников и парой сотен отрендеренных сообщений это
 * десятки тысяч сравнений строк за один рендер списка.
 *
 * Индекс строится один раз на изменение состава и дальше даёт O(1).
 *
 * Ключ приводится к строке, потому что member.user может быть как populate-нутым
 * объектом, так и голым ObjectId — в разных ответах API по-разному.
 */
export type ServerMember = Server['members'][number];

export const buildMemberMap = (server?: Server | null): Map<string, ServerMember> => {
    const map = new Map<string, ServerMember>();
    if (!server?.members) return map;
    for (const member of server.members) {
        const id = String((member.user as any)?._id || member.user);
        if (id) map.set(id, member);
    }
    return map;
};

export const useServerMemberMap = (server?: Server | null): Map<string, ServerMember> =>
    useMemo(() => buildMemberMap(server), [server?.members]);
