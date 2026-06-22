// Блоки поста-объявления. Хранятся на сервере как Mixed, поэтому типы здесь —
// договорённость между редактором (админ) и просмотрщиком (пользователь).

export type BlockType = 'text' | 'image' | 'video' | 'divider' | 'poll';

export interface BaseBlock {
  id: string;
  type: BlockType;
  marginTop?: number;
  marginBottom?: number;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  url: string;
  filename?: string;
  width: number; // в процентах от ширины поста
  radius: number;
  align: 'left' | 'center' | 'right';
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  url: string;
  filename?: string;
  radius: number;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

export interface PollOption {
  id: string;
  text: string;
  custom?: boolean; // вариант, добавленный пользователем
}

export interface PollBlock extends BaseBlock {
  type: 'poll';
  question: string;
  multiple: boolean;
  allowCustom?: boolean; // разрешить пользователям добавлять свой вариант
  options: PollOption[];
  votes?: Record<string, string[]>; // optionId -> массив userId
}

export type PostBlock = TextBlock | ImageBlock | VideoBlock | DividerBlock | PollBlock;

export interface Post {
  _id: string;
  title: string;
  blocks: PostBlock[];
  active: boolean;
  author?: { _id: string; username: string; avatar?: string | null };
  seenBy?: string[];
  createdAt?: string;
}

const FONT_FAMILIES = [
  { value: 'inherit', label: 'Системный' },
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Georgia', serif", label: 'Georgia (с засечками)' },
  { value: "'Courier New', monospace", label: 'Моноширинный' },
  { value: "'Comic Sans MS', cursive", label: 'Comic Sans' },
];

export const POST_FONT_FAMILIES = FONT_FAMILIES;

let counter = 0;
export const genId = (): string => {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
};

export const createBlock = (type: BlockType): PostBlock => {
  const base = { id: genId(), marginTop: 0, marginBottom: 16 };
  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Новый текст', fontSize: 16, fontWeight: 400, fontFamily: 'inherit', color: '#ffffff', align: 'left', lineHeight: 1.5 };
    case 'image':
      return { ...base, type: 'image', url: '', width: 100, radius: 12, align: 'center' };
    case 'video':
      return { ...base, type: 'video', url: '', radius: 12 };
    case 'divider':
      return { ...base, type: 'divider', marginTop: 8, marginBottom: 8 };
    case 'poll':
      return { ...base, type: 'poll', question: 'Ваш вопрос?', multiple: false, allowCustom: false, options: [{ id: genId(), text: 'Вариант 1' }, { id: genId(), text: 'Вариант 2' }], votes: {} };
  }
};
