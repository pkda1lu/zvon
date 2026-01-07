const Server = require('../models/Server');
const Role = require('../models/Role');
const User = require('../models/User');

/**
 * Checks if a user has a specific permission on a server
 */
const hasPermission = async (userId, serverId, permission) => {
    try {
        const server = await Server.findById(serverId).populate('roles');
        if (!server) return false;

        const sUserId = userId.toString();
        const sOwnerId = (server.owner._id || server.owner).toString();

        // 1. Owner bypass
        if (sUserId === sOwnerId) return true;

        const member = server.members.find(m =>
            (m.user._id || m.user).toString() === sUserId
        );
        if (!member) return false;

        // 2. Identify all roles for this member (including @everyone)
        const memberRoleIds = member.roles.map(r => (r._id || r).toString());
        const validRoles = (server.roles || []).filter(r => r && typeof r === 'object');
        const memberRoles = validRoles.filter(r =>
            memberRoleIds.includes(r._id.toString()) || r.name === '@everyone'
        );

        // 3. Check for Administrator or specific permission
        const perms = new Set();
        for (const role of memberRoles) {
            if (role.permissions.includes('ADMINISTRATOR')) return true;
            role.permissions.forEach(p => perms.add(p));
        }

        // 4. Handle communication timeout (restricted permissions)
        if (member.communicationDisabledUntil && new Date(member.communicationDisabledUntil) > new Date()) {
            const restricted = ['SEND_MESSAGES', 'SPEAK', 'ADD_REACTIONS', 'CONNECT'];
            if (restricted.includes(permission)) return false;
        }

        return perms.has(permission);
    } catch (err) {
        console.error('hasPermission error:', err);
        return false;
    }
};

/**
 * Hierarchy check (Gradation): 
 * Actor can manage Target if Actor is Owner OR Actor's highest role is STRICTLY above Target's highest role.
 * Target can NEVER be the Owner.
 */
const canPerformActionOn = async (actorId, targetId, serverId) => {
    try {
        const server = await Server.findById(serverId).populate('roles');
        if (!server) return false;

        const sActorId = actorId.toString();
        const sTargetId = targetId.toString();
        const sOwnerId = (server.owner._id || server.owner).toString();

        // 1. Owner bypass
        if (sActorId === sOwnerId) return true;

        // 2. Nobody can touch the owner
        if (sTargetId === sOwnerId) return false;

        // 3. Self-action (allowed for profiles, check specific route for logic)
        if (sActorId === sTargetId) return true;

        const actor = server.members.find(m => (m.user._id || m.user).toString() === sActorId);
        const target = server.members.find(m => (m.user._id || m.user).toString() === sTargetId);

        if (!actor || !target) return false;

        const getHighestPos = (member) => {
            if (!member || !member.roles) return 0;
            const roleIds = member.roles.map(r => (r._id || r).toString());

            // Log for debugging
            // console.log(`Checking roles for member:`, roleIds);

            const validRoles = (server.roles || []).filter(r => r && typeof r === 'object');
            const roles = validRoles.filter(r => roleIds.includes(r._id.toString()) || r.name === '@everyone');
            const positions = roles.map(r => r.position || 0);

            return positions.length > 0 ? Math.max(...positions) : 0;
        };

        const actorMax = getHighestPos(actor);
        const targetMax = getHighestPos(target);

        // Debug line
        console.log(`[Hierarchy Check] Server: ${server.name}, Actor: ${actorMax}, Target: ${targetMax}`);

        // IMPORTANT: In Discord, if you have MANAGE_NICKNAMES, you can change your OWN nickname
        // regardless of hierarchy (if you have CHANGE_NICKNAME) or others' if you are STRICTLY above them.
        // The owner bypasses everything.

        return actorMax > targetMax;
    } catch (err) {
        console.error('canPerformActionOn error:', err);
        return false;
    }
};

/**
 * Can Actor modify or assign a Role?
 * Actor must be Owner OR have a higher role than the one they are touching.
 */
const canModifyRole = async (actorId, roleId, serverId) => {
    try {
        const server = await Server.findById(serverId).populate('roles');
        const role = await Role.findById(roleId);
        if (!server || !role) return false;

        const sActorId = actorId.toString();
        const sOwnerId = (server.owner._id || server.owner).toString();

        if (sActorId === sOwnerId) return true;

        const actor = server.members.find(m => (m.user._id || m.user).toString() === sActorId);
        if (!actor) return false;

        const roleIds = actor.roles.map(r => (r._id || r).toString());
        const validRoles = (server.roles || []).filter(r => r && typeof r === 'object');
        const actorRoles = validRoles.filter(r => roleIds.includes(r._id.toString()) || r.name === '@everyone');
        const actorMax = actorRoles.length > 0 ? Math.max(...actorRoles.map(r => r.position || 0)) : 0;

        // Discord Rule: You can only touch roles STRICTLY BELOW yours.
        return actorMax > (role.position || 0);
    } catch (err) {
        return false;
    }
};

module.exports = { hasPermission, canPerformActionOn, canModifyRole };
