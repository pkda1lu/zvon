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
                if (typeof roleOrId === 'object' && roleOrId !== null) {
                    role = roleOrId;
                } else if (server.roles) {
                    // Normalize to string for comparison
                    const searchId = String(roleOrId);
                    role = server.roles.find(r =>
                        typeof r === 'object' && r !== null && String(r._id) === searchId
                    ) as Role | undefined;
                }

                if (role && role.permissions) {
                    role.permissions.forEach((p: string) => permissionsSet.add(p));
                }
            });
        }

        // 2. Default @everyone role permissions
        if (server.roles) {
            const everyoneRole = server.roles.find(r =>
                typeof r === 'object' && r !== null && (r as Role).name === '@everyone'
            ) as Role | undefined;

            if (everyoneRole && everyoneRole.permissions) {
                everyoneRole.permissions.forEach((p: string) => permissionsSet.add(p));
            } else {
                // Fallback: usually the one with position 0
                const firstRole = server.roles.find(r =>
                    typeof r === 'object' && r !== null && (r as Role).position === 0
                ) as Role | undefined;
                if (firstRole && firstRole.name === '@everyone' && firstRole.permissions) {
                    firstRole.permissions.forEach((p: string) => permissionsSet.add(p));
                }
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
