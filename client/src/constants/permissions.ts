export const PERMISSIONS = {
    // General Server Permissions
    ADMINISTRATOR: 'ADMINISTRATOR',
    VIEW_AUDIT_LOG: 'VIEW_AUDIT_LOG',
    MANAGE_SERVER: 'MANAGE_SERVER',
    MANAGE_ROLES: 'MANAGE_ROLES',
    MANAGE_CHANNELS: 'MANAGE_CHANNELS',
    KICK_MEMBERS: 'KICK_MEMBERS',
    BAN_MEMBERS: 'BAN_MEMBERS',
    CREATE_INSTANT_INVITE: 'CREATE_INSTANT_INVITE',
    CHANGE_NICKNAME: 'CHANGE_NICKNAME',
    MANAGE_NICKNAMES: 'MANAGE_NICKNAMES',
    MANAGE_EMOJIS: 'MANAGE_EMOJIS',

    // Text Channel Permissions
    SEND_MESSAGES: 'SEND_MESSAGES',
    MANAGE_MESSAGES: 'MANAGE_MESSAGES', // Delete/Pin
    EMBED_LINKS: 'EMBED_LINKS',
    ATTACH_FILES: 'ATTACH_FILES',
    READ_MESSAGE_HISTORY: 'READ_MESSAGE_HISTORY',
    MENTION_EVERYONE: 'MENTION_EVERYONE',
    USE_EXTERNAL_EMOJIS: 'USE_EXTERNAL_EMOJIS',
    ADD_REACTIONS: 'ADD_REACTIONS',

    // Voice Channel Permissions
    CONNECT: 'CONNECT',
    SPEAK: 'SPEAK',
    VIDEO: 'VIDEO',
    MUTE_MEMBERS: 'MUTE_MEMBERS',
    DEAFEN_MEMBERS: 'DEAFEN_MEMBERS',
    MOVE_MEMBERS: 'MOVE_MEMBERS',
    PRIORITY_SPEAKER: 'PRIORITY_SPEAKER'
};

export const PERMISSION_GROUPS = [
    {
        name: 'Общие',
        permissions: [
            { id: PERMISSIONS.ADMINISTRATOR, name: 'Администратор', description: 'Пользователи с этим правом имеют все права, а также могут обходить ограничения прав каналов.' },
            { id: PERMISSIONS.VIEW_AUDIT_LOG, name: 'Просмотр журнала аудита', description: 'Позволяет просматривать журнал действий сервера.' },
            { id: PERMISSIONS.MANAGE_SERVER, name: 'Управление сервером', description: 'Позволяет изменять название сервера, регион и другие настройки.' },
            { id: PERMISSIONS.MANAGE_ROLES, name: 'Управление ролями', description: 'Позволяет создавать, редактировать и удалять роли.' },
            { id: PERMISSIONS.MANAGE_CHANNELS, name: 'Управление каналами', description: 'Позволяет создавать, редактировать и удалять каналы.' },
            { id: PERMISSIONS.KICK_MEMBERS, name: 'Выгонять участников', description: 'Позволяет выгонять участников с сервера.' },
            { id: PERMISSIONS.BAN_MEMBERS, name: 'Банить участников', description: 'Позволяет банить участников на сервере.' },
            { id: PERMISSIONS.CREATE_INSTANT_INVITE, name: 'Создание приглашений', description: 'Позволяет создавать приглашения на сервер.' },
            { id: PERMISSIONS.CHANGE_NICKNAME, name: 'Изменить никнейм', description: 'Позволяет изменить свой никнейм на сервере.' },
            { id: PERMISSIONS.MANAGE_NICKNAMES, name: 'Управление никнеймами', description: 'Позволяет изменять никнеймы других участников.' },
        ]
    },
    {
        name: 'Текстовые каналы',
        permissions: [
            { id: PERMISSIONS.SEND_MESSAGES, name: 'Отправлять сообщения', description: 'Позволяет отправлять сообщения в текстовых каналах.' },
            { id: PERMISSIONS.MANAGE_MESSAGES, name: 'Управление сообщениями', description: 'Позволяет удалять и закреплять сообщения других пользователей.' },
            { id: PERMISSIONS.EMBED_LINKS, name: 'Встраивать ссылки', description: 'Ссылки будут разворачиваться в предпросмотр.' },
            { id: PERMISSIONS.ATTACH_FILES, name: 'Прикреплять файлы', description: 'Позволяет загружать файлы.' },
            { id: PERMISSIONS.READ_MESSAGE_HISTORY, name: 'Читать историю сообщений', description: 'Позволяет читать предыдущие сообщения.' },
            { id: PERMISSIONS.MENTION_EVERYONE, name: 'Упоминание @everyone', description: 'Позволяет использовать @everyone и @here.' },
            { id: PERMISSIONS.ADD_REACTIONS, name: 'Добавлять реакции', description: 'Позволяет добавлять реакции к сообщениям.' },
        ]
    },
    {
        name: 'Голосовые каналы',
        permissions: [
            { id: PERMISSIONS.CONNECT, name: 'Подключаться', description: 'Позволяет подключаться к голосовым каналам.' },
            { id: PERMISSIONS.SPEAK, name: 'Говорить', description: 'Позволяет говорить в голосовых каналах.' },
            { id: PERMISSIONS.VIDEO, name: 'Видео', description: 'Позволяет транслировать видео и экран.' },
            { id: PERMISSIONS.MUTE_MEMBERS, name: 'Отключать микрофон участникам', description: 'Позволяет отключать микрофон другим участникам.' },
            { id: PERMISSIONS.DEAFEN_MEMBERS, name: 'Отключать звук участникам', description: 'Позволяет отключать звук другим участникам.' },
            { id: PERMISSIONS.MOVE_MEMBERS, name: 'Перемещать участников', description: 'Позволяет перемещать участников между каналами.' },
        ]
    }
];
