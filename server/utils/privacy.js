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

module.exports = {
    asList,
    areFriends,
    shareServer,
    hasBlocked,
    friendIdSet,
    canDirectMessage,
};
