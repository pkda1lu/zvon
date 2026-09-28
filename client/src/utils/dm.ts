import { DirectMessage } from '../types';

/**
 * Групповой ли чат. Новые группы помечены сервером (isGroup); у старых
 * признак прежний — больше двух участников или есть название. По одному числу
 * участников судить нельзя: из группы могут выйти все, кроме двоих.
 */
export const isGroupDM = (dm: Pick<DirectMessage, 'participants' | 'name' | 'isGroup'> | null | undefined): boolean =>
    !!dm && (!!dm.isGroup || (dm.participants?.length || 0) > 2 || !!dm.name);
