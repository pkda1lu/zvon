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
        if (server.owner.toString() === userId.toString()) return true;

        const member = server.members.find(m => m.user.toString() === userId.toString());
        if (!member) return false;

        // Get all roles for this member
        const roleIds = member.roles.map(r => r.toString());
        const roles = await Role.find({ _id: { $in: roleIds } });

        for (const role of roles) {
            // Administrator permission grants everything
            if (role.permissions.includes('ADMINISTRATOR')) return true;
            if (role.permissions.includes(permission)) return true;
        }

        return false;
    } catch (err) {
        console.error('Permission check error:', err);
        return false;
    }
};

module.exports = { hasPermission };
