export interface User {
  _id: string;
  username: string;
  email: string;
  avatar: string | null;
  status: 'online' | 'offline' | 'away' | 'busy';
  servers?: string[];
}

export interface Server {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  owner: User;
  members: Array<{
    user: User;
    roles: string[];
    joinedAt: string;
  }>;
  channels: Channel[];
  roles?: Role[];
  createdAt: string;
}

export interface Channel {
  _id: string;
  name: string;
  type: 'text' | 'voice' | 'category';
  server: string | Server;
  category?: string | Channel;
  position: number;
  topic?: string;
  permissions?: any[];
  createdAt: string;
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
  edited: boolean;
  editedAt?: string;
  reactions?: Array<{
    emoji: string;
    users: string[];
  }>;
  replyTo?: Message;
  createdAt: string;
}

export interface Role {
  _id: string;
  name: string;
  server: string;
  color: string;
  permissions: string[];
  position: number;
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
  messages?: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  owner: User;
  members: Array<{
    user: User;
    role: 'owner' | 'admin' | 'member';
    joinedAt: string;
  }>;
  channels: Channel[];
  createdAt: string;
}

