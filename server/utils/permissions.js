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

        // Owner bypass
        const ownerId = server.owner._id ? server.owner._id.toString() : server.owner.toString();
        if (ownerId === userId.toString()) return true;

        const member = server.members.find(m =>
            (m.user._id || m.user).toString() === userId.toString()
        );
        if (!member) return false;

        // Timeout check
        if (member.communicationDisabledUntil && new Date(member.communicationDisabledUntil) > new Date()) {
            const restricted = ['SEND_MESSAGES', 'SPEAK', 'ADD_REACTIONS', 'CONNECT'];
            if (restricted.includes(permission)) return false;
        }

        // Get member roles + @everyone
        const memberRoleIds = member.roles.map(r => (r._id || r).toString());
        const memberRoles = server.roles.filter(r =>
            memberRoleIds.includes(r._id.toString()) || r.name === '@everyone'
        );

        // Administrator check
        for (const role of memberRoles) {
            if (role.permissions.includes('ADMINISTRATOR')) return true;
            if (role.permissions.includes(permission)) return true;
        }

        return false;
    } catch (err) {
        console.error('hasPermission error:', err);
        return false;
    }
};

/**
 * Hierarchy check: Actor can moderate Target only if:
 * 1. Actor is Owner
 * 2. Actor has a role higher than Target's highest role
 * AND Target is NOT the Owner.
 */
const canPerformActionOn = async (actorId, targetId, serverId) => {
    try {
        const server = await Server.findById(serverId).populate('roles');
        if (!server) return false;

        const sActorId = actorId.toString();
        const sTargetId = targetId.toString();
        const sOwnerId = (server.owner._id || server.owner).toString();

        // 1. Owner can do anything to anyone
        if (sActorId === sOwnerId) return true;

        // 2. target is owner? No way.
        if (sTargetId === sOwnerId) return false;

        // 3. same person? (Usually allowed for nickname changes but handled in routes)
        if (sActorId === sTargetId) return true;

        const actor = server.members.find(m => (m.user._id || m.user).toString() === sActorId);
        const target = server.members.find(m => (m.user._id || m.user).toString() === sTargetId);

        if (!actor || !target) return false;

        // Get highest role position
        const getHighest = (member) => {
            const roleIds = member.roles.map(r => (r._id || r).toString());
            // Include roles assigned to member + any @everyone role
            const roles = server.roles.filter(r =>
                roleIds.includes(r._id.toString()) || r.name === '@everyone'
            );
            const positions = roles.map(r => r.position || 0);
            return positions.length > 0 ? Math.max(...positions) : -1;
        };

        const actorMax = getHighest(actor);
        const targetMax = getHighest(target);

        console.log(`Hierarchy: Actor ${actorMax} vs Target ${targetMax}`);

        return actorMax > targetMax;
    } catch (err) {
        console.error('canPerformActionOn error:', err);
        return false;
    }
};

/**
 * Can Actor modify Role? 
 * Actor must be Owner or have highest role strictly above Role position.
 */
const canModifyRole = async (actorId, roleId, serverId) => {
    try {
        const server = await Server.findById(serverId).populate('roles');
        const role = await Role.findById(roleId);
        if (!server || !role) return false;

        if (actorId.toString() === (server.owner._id || server.owner).toString()) return true;

        const actor = server.members.find(m => (m.user._id || m.user).toString() === actorId.toString());
        if (!actor) return false;

        const roleIds = actor.roles.map(r => (r._id || r).toString());
        const actorRoles = server.roles.filter(r => roleIds.includes(r._id.toString()));
        const actorMax = actorRoles.length > 0 ? Math.max(...actorRoles.map(r => r.position)) : -1;

        return actorMax > role.position;
    } catch (err) {
        return false;
    }
};

module.exports = { hasPermission, canPerformActionOn, canModifyRole };
