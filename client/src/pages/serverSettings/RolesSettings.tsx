import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Server, Role } from '../../types';
import { useDialog } from '../../contexts/DialogContext';
import { Permissions, hasPermission } from '../../utils/permissions';
import { SettingsToggle } from '../settings/SettingsUI';
import { PlusIcon, TrashIcon } from '../../components/Icons';

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

const PermissionMetadata: Record<string, { label: string; description: string; category: string }> = {
    ADMINISTRATOR: { category: 'Основные права', label: 'Администратор', description: 'Предоставляет все права доступа, а также позволяет обходить ограничения в каналах. Это опасное право.' },
    MANAGE_GUILD: { category: 'Основные права', label: 'Управление сервером', description: 'Позволяет менять название сервера, иконку, баннер и регион.' },
    MANAGE_ROLES: { category: 'Основные права', label: 'Управление ролями', description: 'Позволяет создавать новые роли и редактировать роли ниже этой.' },
    MANAGE_CHANNELS: { category: 'Основные права', label: 'Управление каналами', description: 'Позволяет создавать, редактировать и удалять каналы.' },
    VIEW_AUDIT_LOG: { category: 'Основные права', label: 'Просмотр журнала аудита', description: 'Позволяет видеть историю изменений на сервере.' },

    KICK_MEMBERS: { category: 'Управление участниками', label: 'Исключать участников', description: 'Позволяет выгонять пользователей с сервера.' },
    BAN_MEMBERS: { category: 'Управление участниками', label: 'Банить участников', description: 'Позволяет блокировать доступ пользователей к серверу.' },
    MODERATE_MEMBERS: { category: 'Управление участниками', label: 'Замучивать участников', description: 'Позволяет временно запрещать участникам отправку сообщений.' },
    CREATE_INSTANT_INVITE: { category: 'Управление участниками', label: 'Создание приглашения', description: 'Позволяет создавать ссылки для приглашения новых людей.' },
    CHANGE_NICKNAME: { category: 'Управление участниками', label: 'Изменение никнейма', description: 'Позволяет пользователю менять свой никнейм на этом сервере.' },
    MANAGE_NICKNAMES: { category: 'Управление участниками', label: 'Управление никнеймами', description: 'Позволяет менять никнеймы других участников.' },

    VIEW_CHANNEL: { category: 'Текстовые каналы', label: 'Просмотр каналов', description: 'Позволяет видеть список каналов и читать сообщения.' },
    SEND_MESSAGES: { category: 'Текстовые каналы', label: 'Отправка сообщений', description: 'Позволяет отправлять текстовые сообщения в каналы.' },
    MANAGE_MESSAGES: { category: 'Текстовые каналы', label: 'Управление сообщениями', description: 'Позволяет удалять и закреплять сообщения других пользователей.' },
    EMBED_LINKS: { category: 'Текстовые каналы', label: 'Встраивание ссылок', description: 'Ссылки в сообщениях будут преобразовываться в предпросмотр.' },
    ATTACH_FILES: { category: 'Текстовые каналы', label: 'Отправка файлов', description: 'Позволяет загружать и отправлять файлы и изображения.' },
    READ_MESSAGE_HISTORY: { category: 'Текстовые каналы', label: 'Чтение истории сообщений', description: 'Позволяет видеть сообщения, отправленные до входа в канал.' },
    MENTION_EVERYONE: { category: 'Текстовые каналы', label: 'Упоминание @everyone', description: 'Позволяет использовать теги @everyone и @here для уведомления всех.' },
    ADD_REACTIONS: { category: 'Текстовые каналы', label: 'Добавление реакций', description: 'Позволяет ставить эмодзи-реакции на сообщения.' },
    PIN_MESSAGES: { category: 'Текстовые каналы', label: 'Закрепление сообщений', description: 'Позволяет закреплять и откреплять сообщения.' },

    CONNECT: { category: 'Голосовые каналы', label: 'Подключение', description: 'Позволяет заходить в голосовые каналы.' },
    SPEAK: { category: 'Голосовые каналы', label: 'Говорить', description: 'Позволяет говорить в голосовых каналах.' },
    STREAM: { category: 'Голосовые каналы', label: 'Видеостриминг', description: 'Позволяет транслировать экран или включать камеру.' },
    MUTE_MEMBERS: { category: 'Голосовые каналы', label: 'Отключать микрофон участников', description: 'Позволяет выключать микрофон другим людям в голосовом канале.' },
    DEAFEN_MEMBERS: { category: 'Голосовые каналы', label: 'Отключать звук участникам', description: 'Позволяет выключать звук (наушники) другим людям.' },
    MOVE_MEMBERS: { category: 'Голосовые каналы', label: 'Перемещать участников', description: 'Позволяет перетаскивать людей между голосовыми каналами.' },
};

const CATEGORIES = Array.from(new Set(Object.values(PermissionMetadata).map(m => m.category)));

const RolesSettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const { confirm, alert } = useDialog();
    const [roles, setRoles] = useState<Role[]>(server.roles || []);
    const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

    useEffect(() => {
        setRoles(server.roles || []);
    }, [server.roles]);

    // Выбираем первую роль по умолчанию, как только список ролей загрузился.
    useEffect(() => {
        if (!selectedRoleId && roles.length > 0) {
            setSelectedRoleId([...roles].sort((a, b) => b.position - a.position)[0]._id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roles.length]);

    // Держим актуальный server в ref, чтобы дебаунс-эффекты не перезапускались при каждом обновлении.
    const serverRef = useRef(server);
    useEffect(() => { serverRef.current = server; }, [server]);

    const persistRole = useCallback(async (roleId: string, updates: Partial<Role>) => {
        try {
            const res = await axios.patch(`/api/servers/${serverRef.current._id}/roles/${roleId}`, updates);
            const merge = (list: Role[]) => list.map(r => String(r._id) === String(roleId) ? { ...r, ...res.data } : r);
            setRoles(merge);
            onServerUpdate({ ...serverRef.current, roles: merge(serverRef.current.roles || []) });
        } catch (err) {
            await alert('Не удалось сохранить изменения роли');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    // Локально обновляем сразу (отзывчивый ввод), а сохранение на сервер — сразу для дискретных
    // действий (тоггл, выбор цвета) или с паузой после набора текста (название, hex-цвет).
    const updateRoleField = (roleId: string, updates: Partial<Role>, debounceKey?: string) => {
        setRoles(prev => prev.map(r => (String(r._id) === String(roleId)) ? { ...r, ...updates } : r));
        if (debounceKey) {
            const key = `${roleId}:${debounceKey}`;
            if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
            debounceTimers.current[key] = setTimeout(() => persistRole(roleId, updates), 900);
        } else {
            persistRole(roleId, updates);
        }
    };

    const handleCreateRole = async () => {
        try {
            const res = await axios.post(`/api/servers/${server._id}/roles`, { name: 'Новая роль' });
            const newRole = res.data;
            const updated = [...roles, newRole];
            setRoles(updated);
            onServerUpdate({ ...server, roles: updated });
            setSelectedRoleId(newRole._id);
        } catch (err) { await alert('Ошибка при создании роли'); }
    };

    const handleDeleteRole = async (roleId: string) => {
        if (!(await confirm('Удалить эту роль?'))) return;
        try {
            await axios.delete(`/api/servers/${server._id}/roles/${roleId}`);
            const updated = roles.filter(r => r._id !== roleId);
            setRoles(updated);
            onServerUpdate({ ...server, roles: updated });
            if (selectedRoleId === roleId) setSelectedRoleId(updated[0]?._id || null);
        } catch (err) { await alert('Ошибка при удалении роли'); }
    };

    const handleMoveRole = async (roleId: string, direction: 'up' | 'down') => {
        const sorted = [...roles].sort((a, b) => b.position - a.position);
        const idx = sorted.findIndex(r => String(r._id) === String(roleId));
        if (idx === -1) return;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= sorted.length) return;

        // Переставляем элементы в массиве по новому порядку
        const newSorted = [...sorted];
        const [movedRole] = newSorted.splice(idx, 1);
        newSorted.splice(targetIdx, 0, movedRole);

        // Назначаем четкие позиции (от самой высокой вверху до 0 внизу)
        const total = newSorted.length;
        const updatedRolesWithPositions = newSorted.map((r, index) => ({
            ...r,
            position: total - 1 - index
        }));

        const updates = updatedRolesWithPositions.map(r => ({ id: r._id, position: r.position }));

        setRoles(updatedRolesWithPositions);
        try {
            await axios.patch(`/api/servers/${server._id}/roles/positions`, { roles: updates });
            onServerUpdate({ ...server, roles: updatedRolesWithPositions });
        } catch (err) {
            setRoles(roles);
            await alert('Не удалось переместить роль');
        }
    };

    const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
    const selectedRole = sortedRoles.find(r => r._id === selectedRoleId) || null;

    return (
        <div className="settings-content-inner full-width-layout">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="settings-page-title" style={{ marginBottom: 0 }}>Роли сервера</h2>
                <button className="settings-btn" onClick={handleCreateRole}><PlusIcon size={16} /> Создать роль</button>
            </div>
            <p className="settings-description">
                Приоритет ролей определяет их порядок в списке участников и цвет никнейма (учитывается наивысшая роль пользователя).
                Выберите роль слева, чтобы настроить её справа. Изменения сохраняются автоматически.
            </p>

            <div className="roles-layout">
                <div className="roles-list-column">
                    {sortedRoles.map((role, idx) => (
                        <div
                            key={role._id}
                            className={`server-role-row ${selectedRoleId === role._id ? 'active' : ''}`}
                            onClick={() => setSelectedRoleId(role._id)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                                <div className="server-role-dot" style={{ backgroundColor: role.color, color: role.color }} />
                                <span style={{ color: role.color, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.name}</span>
                            </div>
                            <div className="server-role-row-reorder" onClick={(e) => e.stopPropagation()}>
                                <button className="action-button" title="Выше" onClick={() => handleMoveRole(role._id, 'up')} disabled={idx === 0}>▲</button>
                                <button className="action-button" title="Ниже" onClick={() => handleMoveRole(role._id, 'down')} disabled={idx === sortedRoles.length - 1}>▼</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="roles-detail-column">
                    {selectedRole ? (
                        <div className="server-role-editor" key={selectedRole._id}>
                            <h3 className="settings-section-title" style={{ marginTop: 0 }}>Название роли</h3>
                            <input
                                className="settings-input"
                                value={selectedRole.name || ''}
                                onChange={(e) => updateRoleField(selectedRole._id, { name: e.target.value }, 'name')}
                                disabled={selectedRole.name === '@everyone'}
                            />

                            <h3 className="settings-section-title">Цвет роли</h3>
                            <div className="server-role-color-row">
                                <input type="color" value={selectedRole.color || '#99aab5'} onChange={(e) => updateRoleField(selectedRole._id, { color: e.target.value })} />
                                <input className="settings-input" style={{ maxWidth: '140px' }} value={selectedRole.color || '#99aab5'} onChange={(e) => updateRoleField(selectedRole._id, { color: e.target.value }, 'color')} />
                            </div>

                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Показывать отдельно</h3>
                                    <p>Участники с этой ролью будут отображаться в отдельной категории в списке участников.</p>
                                </div>
                                <SettingsToggle checked={selectedRole.hoist || false} onChange={(v) => updateRoleField(selectedRole._id, { hoist: v })} />
                            </div>

                            {CATEGORIES.map(category => (
                                <div key={category}>
                                    <h3 className="settings-section-title">{category}</h3>
                                    {Object.entries(PermissionMetadata).filter(([_, data]) => data.category === category).map(([key, data]) => {
                                        const bit = (Permissions as any)[key];
                                        const hasPerm = hasPermission(BigInt(selectedRole.permissions || '0'), bit);
                                        return (
                                            <div key={key} className="settings-row">
                                                <div className="settings-row-text">
                                                    <h3 style={{ fontSize: '14px' }}>{data.label}</h3>
                                                    <p>{data.description}</p>
                                                </div>
                                                <SettingsToggle
                                                    checked={hasPerm}
                                                    onChange={(checked) => {
                                                        const currentPerms = BigInt(selectedRole.permissions || '0');
                                                        const newPerms = checked ? currentPerms | bit : currentPerms & ~BigInt(bit);
                                                        updateRoleField(selectedRole._id, { permissions: newPerms.toString() });
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}

                            {selectedRole.name !== '@everyone' && (
                                <>
                                    <div className="settings-sidebar-divider" style={{ margin: '24px 0 16px' }} />
                                    <button className="settings-btn danger" onClick={() => handleDeleteRole(selectedRole._id)}>
                                        <TrashIcon size={16} /> Удалить роль
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="server-settings-empty-state">Нет ни одной роли.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RolesSettings;
