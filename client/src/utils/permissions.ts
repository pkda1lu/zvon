import { Server, Role, User } from '../types';
import { PERMISSIONS } from '../constants/permissions';

// Helper type for Member as it appears in Server interface
export type ServerMember = {
    user: User;
    roles: (Role | string)[]; // Can be populated Roles or ID strings
};

export const hasPermission = (
    user: User | null | undefined,
    server: Server | null | undefined,
    permission: string
): boolean => {
    if (!user || !server) return false;

    // 1. Owner always has all permissions
    if (server.owner._id === user._id || (server.owner as any) === user._id) return true;

    // Find the member record for this user
    const member = server.members.find(m => m.user._id === user._id || (m.user as any) === user._id);
    if (!member) return false;

    // 2. Aggregate permissions from all roles
    const memberPermissions = new Set<string>();

    member.roles.forEach(roleOrId => {
        // If roles are populated
        let role: Role | undefined;
        if (typeof roleOrId === 'string') {
            // If we have the full roles list in the server object, try to find it
            role = server.roles?.find(r => r._id === roleOrId);
        } else {
            role = roleOrId;
        }

        if (role && role.permissions) {
            role.permissions.forEach(p => memberPermissions.add(p));
        }
    });

    // 3. Administrator overrides everything
    if (memberPermissions.has(PERMISSIONS.ADMINISTRATOR)) return true;

    // 4. Check specific permission
    return memberPermissions.has(permission);
};
