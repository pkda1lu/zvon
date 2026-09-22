const STORAGE_KEY = 'zvon-recent-reactions';

export const DEFAULT_QUICK_EMOJIS = ['❤️', '👍', '🔥', '😂', '🎉'];

export interface StoredReactionItem {
  emoji: string;
  serverId?: string;
}

export function isCustomEmoji(emoji: string): boolean {
  return typeof emoji === 'string' && (emoji.startsWith('/') || emoji.startsWith('http'));
}

export function getRecentReactions(currentServerId?: string): string[] {
  let list: StoredReactionItem[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed.map((item: any) => {
          if (typeof item === 'string') {
            return { emoji: item };
          }
          if (item && typeof item.emoji === 'string') {
            return { emoji: item.emoji, serverId: item.serverId };
          }
          return null;
        }).filter(Boolean) as StoredReactionItem[];
      }
    }
  } catch (_) {
    list = [];
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!item.emoji || seen.has(item.emoji)) continue;

    if (isCustomEmoji(item.emoji)) {
      // Server reaction: only show if on the same server
      if (currentServerId && item.serverId === currentServerId) {
        seen.add(item.emoji);
        result.push(item.emoji);
      }
    } else {
      // Standard unicode reaction: show everywhere
      seen.add(item.emoji);
      result.push(item.emoji);
    }

    if (result.length >= 5) break;
  }

  // Fill remainder up to 5 with DEFAULT_QUICK_EMOJIS
  for (const defEmoji of DEFAULT_QUICK_EMOJIS) {
    if (result.length >= 5) break;
    if (!seen.has(defEmoji)) {
      seen.add(defEmoji);
      result.push(defEmoji);
    }
  }

  return result.slice(0, 5);
}

export function recordRecentReaction(emoji: string, serverId?: string): void {
  if (!emoji) return;
  try {
    let list: StoredReactionItem[] = [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed.map((item: any) => {
          if (typeof item === 'string') {
            return { emoji: item };
          }
          if (item && typeof item.emoji === 'string') {
            return { emoji: item.emoji, serverId: item.serverId };
          }
          return null;
        }).filter(Boolean) as StoredReactionItem[];
      }
    }

    // Filter out previous occurrences of this emoji
    list = list.filter(item => item.emoji !== emoji);

    // If custom emoji, attach serverId
    const isCustom = isCustomEmoji(emoji);
    const newItem: StoredReactionItem = {
      emoji,
      ...(isCustom && serverId ? { serverId } : {})
    };

    list.unshift(newItem);

    // Keep max 30 items
    if (list.length > 30) {
      list = list.slice(0, 30);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
}
