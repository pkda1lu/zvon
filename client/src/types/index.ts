export interface UserActivity {
  type: 'playing' | 'streaming' | 'listening' | 'watching' | 'competing';
  name: string;
  details?: string;
  state?: string;
  timestamps?: {
    start?: number;
    end?: number;
  };
  assets?: {
    largeImage?: string;
    largeText?: string;
    smallImage?: string;
    smallText?: string;
  };
  miniAppData?: MiniApp;
}

export interface User {
  _id: string;
  username: string;
  displayName?: string | null;
  email: string;
  avatar: string | null;
  banner: string | null;
  bannerColor?: string;
  bio: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  activity?: UserActivity | null;
  servers?: (string | any)[];
  primaryServer?: string | any | null;
  blockedUsers?: string[];
  notes?: Record<string, string>;
  isBot?: boolean;
    isPublished?: boolean;
    badges?: string[];
  displayedTag?: { type: 'badge' | 'serverTag'; server?: string | Server | null };
  is2FAEnabled?: boolean;
  role?: 'user' | 'moderator' | 'admin';
  isVerified?: boolean;
  isBanned?: boolean;
  banExpires?: string;
  banReason?: string;
  lastActiveAt?: string;
  joinedVoiceAt?: number;
  settings?: {
    showActivityStatus: boolean;
    activityVisibility: 'everyone' | 'friends' | 'none';
    hiddenActivities: string[];
    whoCanDM: 'everyone' | 'server_members' | 'friends' | 'nobody';
    whoCanFindInSearch: 'everyone' | 'friends_of_friends' | 'nobody';
    whoCanSeeFullProfile: 'everyone' | 'friends' | 'small_servers' | 'nobody';
    smallServerLimit?: number;
    appearance?: {
      theme: string;
      interfaceScale: number;
      appIcon: string;
      reduceMotion: boolean;
      performanceMode: boolean;
      customColors: { primary: string; secondary: string; accent: string };
    };
    chat?: {
      displayMode: string;
      showPreview: boolean;
      autoPlayGif: boolean;
      highlightMentions: boolean;
      emojiAutocomplete: boolean;
      showHoverBar: boolean;
      textToSpeech: boolean;
    };
    language?: {
      language: string;
      timeFormat: string;
    };
    streamerMode?: {
      enabled?: boolean;
      autoEnableWithOBS?: boolean;
      streamerLink?: string;
      censorInfo?: boolean;
      disableSounds?: boolean;
      disableNotifications?: boolean;
      changeStatusToStreaming?: boolean;
      confirmSettingsAccess?: boolean;
    };
    interaction?: {
      voice?: {
        noiseSuppression: boolean;
        echoCancellation: boolean;
        autoGainControl: boolean;
        attenuation: number;
        isAutomaticSensitivity: boolean;
        inputSensitivity: number;
      };
      keybinds?: Array<{
        id: string;
        action: string;
        accelerator: string;
        isEnabled: boolean;
      }>;
    };
  };
  createdAt: string;
}

export interface MiniApp {
    _id: string;
    name: string;
    url: string;
    owner: string | User;
    isPublished: boolean;
    avatar?: string;
    banner?: string;
    description?: string;
    createdAt: string;
}

export interface Role {
  _id: string;
  name: string;
  color: string;
  hoist: boolean;
  position: number;
  permissions: string;
  mentionable: boolean;
}

export interface PermissionOverwrite {
  _id?: string;
  id: string;
  type: 'role' | 'member';
  allow: string;
  deny: string;
}

export interface Emoji {
  name: string;
  url: string;
  id: string;
  animated: boolean;
  author?: string;
}

export interface ServerBan {
  user: User | string;
  reason?: string | null;
  expiresAt?: string | null;
  bannedAt?: string;
  bannedBy?: User | string | null;
}

export interface Server {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  banner?: string;
  bannerColor?: string;
  owner?: User | string;
  roles: Role[];
  members: Array<{
    user: User;
    nickname?: string;
    roles: string[]; // Role IDs
    joinedAt: string;
    communicationDisabledUntil?: string;
    bio?: string;
    avatar?: string;
    banner?: string;
    bannerColor?: string;
  }>;
  channels: Channel[];
  emojis?: Emoji[];
  bans?: ServerBan[];
  features?: string[];
  featuredActivities?: { name: string; image?: string | null }[];
  tag?: { text?: string | null; icon?: string | null; color?: string };
  welcomeEnabled?: boolean;
  welcomeMessages?: string[];
  welcomeChannel?: string | Channel | null;
  showMemberActivity?: boolean;
  showMembersList?: boolean;
  newcomerCooldownSeconds?: number;
  createdAt: string;
}

export interface Invite {
  _id: string;
  code: string;
  server: string | Server;
  creator: User | string;
  createdAt: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  uses: number;
}

export interface AuditLogEntry {
  _id: string;
  server: string;
  executor: User;
  target?: any;
  targetModel: string;
  action: string;
  changes?: Array<{ key: string; oldValue?: any; newValue?: any }>;
  reason?: string | null;
  createdAt: string;
}

export interface Channel {
  _id: string;
  name: string;
  type: 'text' | 'voice' | 'category' | 'room';
  server: string | Server;
  category?: string | Channel;
  position: number;
  topic?: string;
  permissionOverwrites?: PermissionOverwrite[];
  createdAt: string;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  image?: {
    url: string;
  };
  thumbnail?: {
    url: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

export interface Message {
  _id: string;
  content: string;
  author: User;
  channel: string | null;
  directMessage?: string | null;
  attachments: Array<{
    url: string;
    filename: string;
    size: number;
    type: string;
  }>;
  embeds?: Embed[];
  buttons?: Array<{
    label: string;
    url?: string;
    actionId?: string;
    style?: 'primary' | 'secondary' | 'danger' | 'success';
    row?: number;
  }>;
  edited: boolean;
  editedAt?: string;
  reactions?: Array<{
    emoji: string;
    users: string[];
  }>;
  poll?: {
    question: string;
    multiple?: boolean;
    allowCustom?: boolean;
    options: Array<{
      id: string;
      text: string;
      custom?: boolean;
      voters?: Array<string | { _id: string; username?: string }>;
    }>;
  } | null;
  mentions?: User[];
  replyTo?: Message;
  forwardedFrom?: {
    authorId?: string;
    authorUsername?: string;
    authorAvatar?: string | null;
    content?: string;
    createdAt?: string;
  } | null;
  type?: 'default' | 'missed-call' | 'call-ended' | 'server-join';
  pinned?: boolean;
  pinnedAt?: string;
  createdAt: string;
}

export interface Friendship {
  _id: string;
  requester: User;
  recipient: User;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: string;
}

export interface DirectMessage {
  _id: string;
  participants: User[];
  name?: string | null;
  icon?: string | null;
  messages?: Message[];
  isModeration?: boolean;
  moderator?: string | { _id: string } | null;
  createdAt: string;
  updatedAt: string;
}
