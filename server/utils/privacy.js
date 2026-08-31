// Серверная проверка настроек приватности пользователя.
// Используется при создании ЛС (whoCanDM) и в поиске пользователей (whoCanFindInSearch).
// whoCanSeeFullProfile проверяется прямо в routes/users.js (профиль).
const Friendship = require('../models/Friendship');
const Server = require('../models/Server');
const User = require('../models/User');

// Приводим правило к массиву категорий (в схеме whoCanDM/whoCanSeeFullProfile — [String]).
const asList = (v, fallback) => (Array.isArray(v) ? v : [v || fallback]);

// Дружат ли двое (заявка в статусе accepted).
async function areFriends(aId, bId) {
    const f = await Friendship.findOne({
        status: 'accepted',
        $or: [
            { requester: aId, recipient: bId },
            { requester: bId, recipient: aId },
        ],
    }).select('_id');
    return !!f;
}

// Есть ли у двоих хотя бы один общий сервер.
async function shareServer(aId, bId) {
    const s = await Server.findOne({ 'members.user': { $all: [aId, bId] } }).select('_id');
    return !!s;
}

// Заблокировал ли userDoc пользователя otherId.
function hasBlocked(userDoc, otherId) {
    return (userDoc.blockedUsers || []).some(id => id.toString() === otherId.toString());
}

// Множество id друзей пользователя (по списку дружб).
function friendIdSet(friendships, ownerId) {
    const owner = ownerId.toString();
    const set = new Set();
    for (const f of friendships) {
        const r = f.requester.toString();
        const rc = f.recipient.toString();
        set.add(r === owner ? rc : r);
    }
    return set;
}

// Может ли requester начать ЛС с target (по настройкам приватности target).
// target — документ User с полями settings и blockedUsers.
async function canDirectMessage(requesterId, target) {
    if (requesterId.toString() === target._id.toString()) return true;

    // Блокировка в любую сторону полностью запрещает ЛС.
    if (hasBlocked(target, requesterId)) return false;
    const requester = await User.findById(requesterId).select('blockedUsers');
    if (requester && hasBlocked(requester, target._id)) return false;

    const rule = asList(target.settings?.whoCanDM, 'everyone');
    if (rule.includes('nobody')) return false;
    if (rule.includes('everyone')) return true;
    if (rule.includes('friends') && (await areFriends(requesterId, target._id))) return true;
    if (rule.includes('server_members') && (await shareServer(requesterId, target._id))) return true;
    return false;
}

/**
 * Состояние блокировки между двумя людьми.
 *
 * Возвращает обе стороны отдельно, потому что последствия у них разные:
 * заблокировавший просто не пишет, а заблокированному нельзя ещё и показывать
 * аватарку со статусом.
 *
 * Один запрос на двоих вместо двух: обе записи достаются разом.
 */
async function getBlockState(aId, bId) {
    const a = aId.toString();
    const b = bId.toString();
    if (a === b) return { iBlocked: false, blockedMe: false };

    const docs = await User.find({ _id: { $in: [a, b] } }).select('blockedUsers').lean();
    const byId = new Map(docs.map(d => [d._id.toString(), (d.blockedUsers || []).map(x => x.toString())]));

    return {
        iBlocked: (byId.get(a) || []).includes(b),
        blockedMe: (byId.get(b) || []).includes(a),
    };
}

/** Запрещено ли общение между двумя — блокировка в любую сторону. */
async function isCommunicationBlocked(aId, bId) {
    const { iBlocked, blockedMe } = await getBlockState(aId, bId);
    return iBlocked || blockedMe;
}

/**
 * Убирает из данных пользователя то, что заблокированному видеть не следует:
 * аватарку, оформление и присутствие в сети. Имя остаётся — иначе переписка
 * превратится в разговор с пустотой, и человек не поймёт, чей это чат.
 */
function stripForBlocked(userObj) {
    if (!userObj) return userObj;
    const plain = typeof userObj.toObject === 'function' ? userObj.toObject() : { ...userObj };
    plain.avatar = null;
    plain.banner = null;
    plain.status = 'offline';
    plain.activity = null;
    plain.badges = [];
    plain.displayedTag = null;
    plain.blockedYou = true;
    return plain;
}

module.exports = {
    asList,
    areFriends,
    shareServer,
    hasBlocked,
    friendIdSet,
    canDirectMessage,
    getBlockState,
    isCommunicationBlocked,
    stripForBlocked,
};
