import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
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

  const handleAddOption = useCallback(async (blockId: string, text: string) => {
    if (!current) return;
    try {
      const res = await axios.post(`/api/moderation/posts/${current._id}/poll-option`, { blockId, text });
      const { options, votes } = res.data || {};
      setQueue(prev => prev.map(p => p._id !== current._id ? p : {
        ...p,
        blocks: p.blocks.map(b => (b.id === blockId && b.type === 'poll') ? { ...b, options, votes } : b),
      }));
    } catch {}
  }, [current]);

  if (!current) return null;

  return (
    <Modal
      open={true}
      onClose={dismiss}
      title={current.title || undefined}
      subtitle={queue.length > 1 ? `${index + 1} из ${queue.length}` : undefined}
      size="lg"
      closeOnBackdrop={false}
      className="post-viewer-modal"
      footer={
        <button className="zv-btn post-viewer-btn" onClick={dismiss}>
          {queue.length - index > 1 ? 'Далее' : 'Прочитано'}
        </button>
      }
    >
      <motion.div
        className="post-viewer-body"
        key={current._id}
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
      >
        {current.blocks.map(b => (
          <motion.div
            key={b.id}
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <PostBlockRenderer block={b} currentUserId={user?._id} interactive onVote={handleVote} onAddOption={handleAddOption} />
          </motion.div>
        ))}
        {current.author?.username && (
          <motion.div className="post-viewer-meta" variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
            {current.author.username}
          </motion.div>
        )}
      </motion.div>
    </Modal>
  );
};

export default PostAnnouncements;
