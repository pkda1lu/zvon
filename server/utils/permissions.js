const Server = require('../models/Server');
const Role = require('../models/Role');

/**
 * Checks if a user has a specific permission on a server
 * @param {string} userId - User ID
 * @param {string} serverId - Server ID
 * @param {string} permission - Permission ID (e.g. 'ADMINISTRATOR', 'MANAGE_SERVER')
 * @returns {Promise<boolean>}
 */
/**
 * Checks if a user has a specific permission on a server
 * @param {string} userId - User ID
 * @param {string} serverId - Server ID
 * @param {string} permission - Permission ID (e.g. 'ADMINISTRATOR', 'MANAGE_SERVER')
 * @returns {Promise<boolean>}
 */
const hasPermission = async (userId, serverId, permission) => {
    try {
        const server = await Server.findById(serverId).populate('roles');
        if (!server) return false;

        // Owner has all permissions
        if (!server.owner) return false;
        const ownerId = server.owner._id ? server.owner._id.toString() : server.owner.toString();
        if (ownerId === userId.toString()) return true;

        const member = server.members.find(m => {
            if (!m || !m.user) return false;
            const mUserId = m.user._id ? m.user._id.toString() : m.user.toString();
            return mUserId === userId.toString();
        });

        if (!member) {
            console.log(`Permission check: Member ${userId} not found in server ${serverId}`);
            return false;
        }

        // Check for timeout
        if (member.communicationDisabledUntil && new Date(member.communicationDisabledUntil) > new Date()) {
            const restrictedPermissions = ['SEND_MESSAGES', 'SPEAK', 'ADD_REACTIONS', 'CONNECT'];
            if (restrictedPermissions.includes(permission)) {
                return false;
            }
        }

        // Administrator permission grants everything
        // Get all roles for this member
        const roleIds = member.roles ? member.roles.filter(r => r).map(r => r.toString()) : [];
        const assignedRoles = server.roles.filter(r => r && r._id && roleIds.includes(r._id.toString()));
        const everyoneRole = server.roles.find(r => r && (r.name === '@everyone' || (r._id && r._id.toString() === server.roles[0].toString()))); // Heuristic or explicit

        const rolesToCheck = [...assignedRoles];

        // If everyoneRole is just an ID (not populated), we should still try to find it properly or use fallback
        if (everyoneRole && everyoneRole.permissions) {
            rolesToCheck.push(everyoneRole);
        }

        console.log(`Permission check for ${userId} (${permission}): checking ${rolesToCheck.length} roles`);

        for (const role of rolesToCheck) {
            if (!role || !role.permissions) continue;
            if (role.permissions.includes('ADMINISTRATOR')) return true;
            if (role.permissions.includes(permission)) return true;
        }

        // Fallback for legacy or if @everyone role is restricted/missing
        const DEFAULT_PERMISSIONS = ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'CONNECT', 'SPEAK', 'CREATE_INSTANT_INVITE', 'VIEW_CHANNELS'];
        if (DEFAULT_PERMISSIONS.includes(permission)) {
            // For now, allow these by default if not explicitly denied by roles (future: DENY overrides)
            // But if @everyone role exists and doesn't have it, we should respect that.
            // However, to avoid total lockout during dev:
            if (!everyoneRole || !everyoneRole.permissions) return true;
        }

        return false;
    } catch (err) {
        console.error('Permission check error:', err);
        return false;
    }
};

/**
 * Compares two users' hierarchy in a server.
 * Actor can only perform actions on Target if Actor's highest role position is GREATER than Target's.
 * Server Owner is always above everyone else.
 * @returns {Promise<boolean>} - True if Actor is strictly above Target
 */
const canPerformActionOn = async (actorId, targetId, serverId) => {
    try {
        const server = await Server.findById(serverId).populate('roles');
        if (!server) return false;

        const ownerId = server.owner._id ? server.owner._id.toString() : server.owner.toString();

        // Owner can do anything to anyone
        if (actorId.toString() === ownerId) return true;

        // Nobody can do anything to the owner
        if (targetId.toString() === ownerId) return false;

        const actor = server.members.find(m => m.user && (m.user._id || m.user).toString() === actorId.toString());
        const target = server.members.find(m => m.user && (m.user._id || m.user).toString() === targetId.toString());

        if (!actor || !target) {
            console.log(`Hierarchy check: Actor ${actorId} or Target ${targetId} not found in server ${serverId}`);
            return false;
        }

        // Get highest role position for actor
        const actorRoleIds = actor.roles ? actor.roles.filter(r => r).map(r => (r._id || r).toString()) : [];
        const actorRoles = server.roles.filter(r => r && r._id && actorRoleIds.includes(r._id.toString()));
        const actorHighest = actorRoles.length > 0 ? Math.max(...actorRoles.map(r => r.position || 0)) : -1;

        // Get highest role position for target
        const targetRoleIds = target.roles ? target.roles.filter(r => r).map(r => (r._id || r).toString()) : [];
        const targetRoles = server.roles.filter(r => r && r._id && targetRoleIds.includes(r._id.toString()));
        const targetHighest = targetRoles.length > 0 ? Math.max(...targetRoles.map(r => r.position || 0)) : -1;

        console.log(`Hierarchy check in ${serverId}: actorHighest=${actorHighest}, targetHighest=${targetHighest}`);

        // Actor must be strictly higher
        return actorHighest > targetHighest;
    } catch (err) {
        console.error('Hierarchy check error:', err);
        return false;
    }
};

module.exports = { hasPermission, canPerformActionOn };
