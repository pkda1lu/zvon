import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Modal from '../Modal';
import PostBlockRenderer from './PostBlockRenderer';
import { Post } from './postTypes';
import { useAuth } from '../../contexts/AuthContext';
import './Posts.css';

// Всплывает у пользователя при входе: показывает непрочитанные посты-объявления
// по очереди. Каждый закрытый помечается просмотренным (показ один раз).
const PostAnnouncements: React.FC = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<Post[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    axios.get('/api/moderation/posts/pending')
      .then(res => { if (!cancelled) { setQueue(res.data || []); setIndex(0); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const current = queue[index];

  const dismiss = useCallback(async () => {
    if (!current) return;
    const id = current._id;
    axios.post(`/api/moderation/posts/${id}/seen`).catch(() => {});
    setIndex(i => i + 1);
  }, [current]);

  const handleVote = useCallback(async (blockId: string, optionIds: string[]) => {
    if (!current) return;
    try {
      const res = await axios.post(`/api/moderation/posts/${current._id}/vote`, { blockId, optionIds });
      const newVotes = res.data?.votes;
      setQueue(prev => prev.map(p => p._id !== current._id ? p : {
        ...p,
        blocks: p.blocks.map(b => (b.id === blockId && b.type === 'poll') ? { ...b, votes: newVotes } : b),
      }));
    } catch {}
  }, [current]);

  if (!current) return null;

  return (
    <Modal
      open={true}
      onClose={dismiss}
      title={current.title || undefined}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <button className="zv-btn zv-btn--primary" onClick={dismiss}>
          {queue.length - index > 1 ? 'Далее' : 'Прочитано'}
        </button>
      }
    >
      <div className="post-viewer-body">
        {current.blocks.map(b => (
          <PostBlockRenderer key={b.id} block={b} currentUserId={user?._id} interactive onVote={handleVote} />
        ))}
        <div className="post-viewer-meta">
          <span>{current.author?.username ? `Опубликовал: ${current.author.username}` : ''}</span>
          {queue.length > 1 && <span>{index + 1} / {queue.length}</span>}
        </div>
      </div>
    </Modal>
  );
};

export default PostAnnouncements;
