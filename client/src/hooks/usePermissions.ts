import { useMemo } from 'react';
import { Server, User } from '../types';

export const usePermissions = (user: User | null, server: Server | null) => {
    return useMemo(() => {
        if (!user || !server) return {
            hasPermission: () => false,
            isOwner: false,
            permissions: [] as string[]
        };

        const ownerId = typeof server.owner === 'object' ? (server.owner as any)._id : server.owner;
        const isOwner = String(user._id) === String(ownerId);

        if (isOwner) return {
            hasPermission: () => true,
            isOwner: true,
            permissions: ['ADMINISTRATOR']
        };

        const member = server.members.find(m => String(m.user._id) === String(user._id));
        if (!member) return {
            hasPermission: () => false,
            isOwner: false,
            permissions: []
        };

        // Extract permissions from roles
        const permissionsSet = new Set<string>();

        // Ensure roles are handled correctly whether they are populated or just IDs
        member.roles.forEach((role: any) => {
            if (typeof role === 'object' && role.permissions) {
                role.permissions.forEach((p: string) => permissionsSet.add(p));
            }
        });

        const permissions = Array.from(permissionsSet);
        const hasAdmin = permissions.includes('ADMINISTRATOR');

        return {
            hasPermission: (perm: string) => hasAdmin || permissions.includes(perm),
            isOwner,
            permissions
        };
    }, [user, server]);
};
