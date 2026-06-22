import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Post, PostBlock, BlockType, createBlock, genId, POST_FONT_FAMILIES } from './postTypes';
import PostBlockRenderer from './PostBlockRenderer';
import { useNotifications } from '../../contexts/NotificationContext';
import './Posts.css';

interface PostEditorProps {
  post: Post | null; // null => создание нового
  onSaved: () => void;
  onCancel: () => void;
}

const ADD_BUTTONS: { type: BlockType; label: string }[] = [
  { type: 'text', label: '+ Текст' },
  { type: 'image', label: '+ Картинка' },
  { type: 'video', label: '+ Видео' },
  { type: 'poll', label: '+ Опрос' },
  { type: 'divider', label: '+ Разделитель' },
];

const PostEditor: React.FC<PostEditorProps> = ({ post, onSaved, onCancel }) => {
  const { addNotification } = useNotifications();
  const [title, setTitle] = useState(post?.title || '');
  const [blocks, setBlocks] = useState<PostBlock[]>(post?.blocks || []);
  const [active, setActive] = useState(post?.active ?? true);
  const [resetSeen, setResetSeen] = useState(false);
  const [saving, setSaving] = useState(false);
  const uploadTarget = useRef<{ id: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateBlock = (id: string, patch: Partial<PostBlock>) => {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } as PostBlock : b)));
  };

  const addBlock = (type: BlockType) => setBlocks(prev => [...prev, createBlock(type)]);
  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const triggerUpload = (blockId: string) => {
    uploadTarget.current = { id: blockId };
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTarget.current;
    if (!file || !target) return;
    const formData = new FormData();
    formData.append('files', file);
    try {
      const res = await axios.post('/api/upload-files', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const uploaded = res.data?.[0];
      if (uploaded) updateBlock(target.id, { url: uploaded.url, filename: uploaded.filename } as Partial<PostBlock>);
    } catch {
      addNotification({ title: 'Ошибка загрузки', content: 'Не удалось загрузить файл.', type: 'error' });
    } finally {
      uploadTarget.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (blocks.length === 0) {
      addNotification({ title: 'Пустой пост', content: 'Добавьте хотя бы один блок.', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const payload = { title, blocks, active };
      if (post) {
        await axios.put(`/api/moderation/posts/${post._id}`, { ...payload, resetSeen });
      } else {
        await axios.post('/api/moderation/posts', payload);
      }
      addNotification({ title: 'Сохранено', content: post ? 'Пост обновлён.' : 'Пост создан.', type: 'success' });
      onSaved();
    } catch (err: any) {
      addNotification({ title: 'Ошибка', content: err?.response?.data?.message || 'Не удалось сохранить пост.', type: 'error' });
      setSaving(false);
    }
  };

  const numInput = (value: number | undefined, onChange: (n: number) => void, min: number, max: number, step = 1) => (
    <input type="number" value={value ?? 0} min={min} max={max} step={step}
      onChange={e => onChange(Number(e.target.value))} className="post-num-input" />
  );

  const renderControls = (block: PostBlock) => {
    if (block.type === 'text') {
      return (
        <>
          <textarea className="post-text-area" value={block.content} onChange={e => updateBlock(block.id, { content: e.target.value } as any)} placeholder="Текст…" />
          <div className="post-ctrl-row">
            <label>Размер {numInput(block.fontSize, v => updateBlock(block.id, { fontSize: v } as any), 8, 96)}</label>
            <label>Жирность
              <select value={block.fontWeight} onChange={e => updateBlock(block.id, { fontWeight: Number(e.target.value) } as any)} className="post-select">
                {[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label>Шрифт
              <select value={block.fontFamily} onChange={e => updateBlock(block.id, { fontFamily: e.target.value } as any)} className="post-select">
                {POST_FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
          </div>
          <div className="post-ctrl-row">
            <label>Цвет <input type="color" value={block.color} onChange={e => updateBlock(block.id, { color: e.target.value } as any)} className="post-color" /></label>
            <label>Выравнивание
              <select value={block.align} onChange={e => updateBlock(block.id, { align: e.target.value as any } as any)} className="post-select">
                <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
              </select>
            </label>
            <label>Интерлиньяж {numInput(block.lineHeight, v => updateBlock(block.id, { lineHeight: v } as any), 1, 3, 0.1)}</label>
          </div>
        </>
      );
    }
    if (block.type === 'image') {
      return (
        <>
          <button type="button" className="settings-btn" onClick={() => triggerUpload(block.id)} style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }}>
            {block.url ? 'Заменить картинку' : 'Загрузить картинку'}
          </button>
          <div className="post-ctrl-row">
            <label>Ширина % {numInput(block.width, v => updateBlock(block.id, { width: v } as any), 10, 100)}</label>
            <label>Скругление {numInput(block.radius, v => updateBlock(block.id, { radius: v } as any), 0, 40)}</label>
            <label>Выравнивание
              <select value={block.align} onChange={e => updateBlock(block.id, { align: e.target.value as any } as any)} className="post-select">
                <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
              </select>
            </label>
          </div>
        </>
      );
    }
    if (block.type === 'video') {
      return (
        <>
          <button type="button" className="settings-btn" onClick={() => triggerUpload(block.id)} style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }}>
            {block.url ? 'Заменить видео' : 'Загрузить видео'}
          </button>
          <div className="post-ctrl-row">
            <label>Скругление {numInput(block.radius, v => updateBlock(block.id, { radius: v } as any), 0, 40)}</label>
          </div>
        </>
      );
    }
    if (block.type === 'poll') {
      return (
        <>
          <input className="post-num-input" style={{ width: '100%' }} value={block.question} onChange={e => updateBlock(block.id, { question: e.target.value } as any)} placeholder="Вопрос опроса" />
          <label className="post-checkbox">
            <input type="checkbox" checked={block.multiple} onChange={e => updateBlock(block.id, { multiple: e.target.checked } as any)} /> Можно выбрать несколько
          </label>
          <label className="post-checkbox">
            <input type="checkbox" checked={!!block.allowCustom} onChange={e => updateBlock(block.id, { allowCustom: e.target.checked } as any)} /> Разрешить свой вариант ответа
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {block.options.map((opt, i) => (
              <div key={opt.id} style={{ display: 'flex', gap: 8 }}>
                <input className="post-num-input" style={{ flex: 1 }} value={opt.text}
                  onChange={e => updateBlock(block.id, { options: block.options.map(o => o.id === opt.id ? { ...o, text: e.target.value } : o) } as any)}
                  placeholder={`Вариант ${i + 1}`} />
                {block.options.length > 2 && (
                  <button type="button" className="post-mini-btn" onClick={() => updateBlock(block.id, { options: block.options.filter(o => o.id !== opt.id) } as any)}>✕</button>
                )}
              </div>
            ))}
          </div>
          {block.options.length < 20 && (
            <button type="button" className="post-mini-btn" style={{ alignSelf: 'flex-start' }}
              onClick={() => updateBlock(block.id, { options: [...block.options, { id: genId(), text: '' }] } as any)}>+ Вариант</button>
          )}
        </>
      );
    }
    return <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Горизонтальный разделитель.</div>;
  };

  const blockLabel: Record<BlockType, string> = { text: 'Текст', image: 'Картинка', video: 'Видео', poll: 'Опрос', divider: 'Разделитель' };

  return (
    <div className="post-editor">
      <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleUpload} />

      <div className="post-editor-grid">
        <div className="post-editor-pane">
          <label className="post-field-label">Заголовок (не обязателен)</label>
          <input className="post-num-input" style={{ width: '100%', marginBottom: 16 }} value={title} onChange={e => setTitle(e.target.value)} placeholder="Заголовок поста" maxLength={200} />

          {blocks.map((block, idx) => (
            <div key={block.id} className="post-block-card">
              <div className="post-block-head">
                <span className="post-block-type">{blockLabel[block.type]}</span>
                <div className="post-block-actions">
                  <button type="button" className="post-mini-btn" disabled={idx === 0} onClick={() => moveBlock(block.id, -1)}>↑</button>
                  <button type="button" className="post-mini-btn" disabled={idx === blocks.length - 1} onClick={() => moveBlock(block.id, 1)}>↓</button>
                  <button type="button" className="post-mini-btn danger" onClick={() => removeBlock(block.id)}>✕</button>
                </div>
              </div>
              <div className="post-block-body">{renderControls(block)}</div>
              <div className="post-ctrl-row">
                <label>Отступ сверху {numInput(block.marginTop, v => updateBlock(block.id, { marginTop: v } as any), 0, 120)}</label>
                <label>Отступ снизу {numInput(block.marginBottom, v => updateBlock(block.id, { marginBottom: v } as any), 0, 120)}</label>
              </div>
            </div>
          ))}

          <div className="post-add-row">
            {ADD_BUTTONS.map(b => (
              <button key={b.type} type="button" className="post-mini-btn" onClick={() => addBlock(b.type)}>{b.label}</button>
            ))}
          </div>
        </div>

        <div className="post-editor-pane">
          <label className="post-field-label">Предпросмотр</label>
          <div className="post-preview">
            {title && <div className="post-preview-title">{title}</div>}
            {blocks.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>Добавьте блоки слева</div>
            ) : blocks.map(b => <PostBlockRenderer key={b.id} block={b} />)}
          </div>
        </div>
      </div>

      <div className="post-editor-footer">
        <label className="post-checkbox"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Активен (показывать пользователям)</label>
        {post && <label className="post-checkbox"><input type="checkbox" checked={resetSeen} onChange={e => setResetSeen(e.target.checked)} /> Показать заново всем (сброс просмотров)</label>}
        <div style={{ flex: 1 }} />
        <button type="button" className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={onCancel} disabled={saving}>Отмена</button>
        <button type="button" className="settings-btn success-glass" onClick={handleSave} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
      </div>
    </div>
  );
};

export default PostEditor;
