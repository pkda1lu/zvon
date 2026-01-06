const Server = require('../models/Server');
const Role = require('../models/Role');

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
        if (!member) return false;

        // Get all roles for this member
        const roleIds = member.roles ? member.roles.filter(r => r).map(r => r.toString()) : [];
        // Find member's assigned roles
        const assignedRoles = server.roles.filter(r => r && r._id && roleIds.includes(r._id.toString()));

        // Find default @everyone role
        const everyoneRole = server.roles.find(r => r && r.name === '@everyone');

        // Combine them
        const rolesToCheck = [...assignedRoles];
        if (everyoneRole) {
            rolesToCheck.push(everyoneRole);
        }

        for (const role of rolesToCheck) {
            if (!role || !role.permissions || !Array.isArray(role.permissions)) continue;
            // Administrator permission grants everything
            if (role.permissions.includes('ADMINISTRATOR')) return true;
            if (role.permissions.includes(permission)) return true;
        }

        // Fallback for legacy servers without @everyone role
        if (!everyoneRole) {
            const DEFAULT_PERMISSIONS = ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'CONNECT', 'SPEAK', 'CREATE_INSTANT_INVITE', 'VIEW_CHANNELS'];
            if (DEFAULT_PERMISSIONS.includes(permission)) return true;
        }

        return false;
    } catch (err) {
        console.error('Permission check error:', err);
        return false;
    }
};

module.exports = { hasPermission };
