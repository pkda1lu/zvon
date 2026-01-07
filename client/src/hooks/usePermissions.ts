import { useMemo } from 'react';
import { Server, User, Role } from '../types';

export const usePermissions = (user: User | null, server: Server | null) => {
    return useMemo(() => {
        if (!user || !server) return {
            hasPermission: () => false,
            isOwner: false,
            permissions: [] as string[]
        };

        const ownerId = server.owner?._id || server.owner;
        const isOwner = String(user._id) === String(ownerId);

        if (isOwner) return {
            hasPermission: () => true,
            isOwner: true,
            permissions: ['ADMINISTRATOR']
        };

        const member = server.members.find(m => String(m.user?._id || m.user) === String(user._id));

        // Extract permissions from roles
        const permissionsSet = new Set<string>();

        // 1. Roles explicitly assigned to the member
        if (member) {
            member.roles.forEach((roleOrId: any) => {
                let role: Role | undefined;
                if (typeof roleOrId === 'object') {
                    role = roleOrId;
                } else if (server.roles) {
                    role = server.roles.find(r => r._id === roleOrId);
                }

                if (role && role.permissions) {
                    role.permissions.forEach((p: string) => permissionsSet.add(p));
                }
            });
        }

        // 2. Default @everyone role permissions
        const everyoneRole = server.roles?.find(r => r.name === '@everyone');
        if (everyoneRole && everyoneRole.permissions) {
            everyoneRole.permissions.forEach((p: string) => permissionsSet.add(p));
        } else if (server.roles && server.roles.length > 0) {
            // Fallback: usually the first role or one with position 0
            const firstRole = server.roles.find(r => r.position === 0);
            if (firstRole && firstRole.name === '@everyone' && firstRole.permissions) {
                firstRole.permissions.forEach((p: string) => permissionsSet.add(p));
            }
        }

        const permissions = Array.from(permissionsSet);
        const hasAdmin = permissions.includes('ADMINISTRATOR');

        return {
            hasPermission: (perm: string) => hasAdmin || permissions.includes(perm),
            isOwner,
            permissions
        };
    }, [user, server]);
};
