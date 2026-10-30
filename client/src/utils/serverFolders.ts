export interface ServerFolder {
  id: string;
  name: string;
  serverIds: string[];
  isolated: boolean;
}

/** Ignore corrupt cache entries and keep a server in at most one folder. */
export function normalizeServerFolders(value: unknown): ServerFolder[] {
  if (!Array.isArray(value)) return [];
  const folderIds = new Set<string>();
  const serverIds = new Set<string>();
  return value.slice(0, 50).flatMap(folder => {
    if (!folder || typeof folder.id !== 'string' || !folder.id || folder.id.length > 80 || folderIds.has(folder.id)) return [];
    folderIds.add(folder.id);
    return [{
      id: folder.id,
      name: typeof folder.name === 'string' ? folder.name.trim().slice(0, 40) || 'Папка' : 'Папка',
      isolated: folder.isolated === true,
      serverIds: Array.isArray(folder.serverIds) ? folder.serverIds.filter((id: unknown): id is string => {
        if (typeof id !== 'string' || !id || id.length > 80 || serverIds.has(id)) return false;
        serverIds.add(id);
        return true;
      }).slice(0, 500) : [],
    }];
  });
}
