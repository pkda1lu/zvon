import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Post } from './postTypes';
import PostEditor from './PostEditor';
import { useDialog } from '../../contexts/DialogContext';
import './Posts.css';

const PostsModeration: React.FC = () => {
  const { confirm } = useDialog();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Post | null | undefined>(undefined); // undefined => список, null => новый

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/moderation/posts');
      setPosts(res.data);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, []);

  const handleSaved = () => { setEditing(undefined); fetchPosts(); };

  const toggleActive = async (post: Post) => {
    try { await axios.put(`/api/moderation/posts/${post._id}`, { active: !post.active }); fetchPosts(); } catch { }
  };

  const deletePost = async (post: Post) => {
    if (!(await confirm('Удалить пост безвозвратно?'))) return;
    try { await axios.delete(`/api/moderation/posts/${post._id}`); fetchPosts(); } catch { }
  };

  if (editing !== undefined) {
    return <PostEditor post={editing} onSaved={handleSaved} onCancel={() => setEditing(undefined)} />;
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button className="settings-btn success-glass" onClick={() => setEditing(null)}>+ Новый пост</button>
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Активным может быть только один пост — он покажется всем при следующем входе.</span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 20 }}>Загрузка...</div>
      ) : posts.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>Постов пока нет.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {posts.map(post => {
            const seenCount = post.seenBy?.length || 0;
            const firstText = post.blocks?.find(b => b.type === 'text') as any;
            return (
              <div key={post._id} className="settings-card" style={{ margin: 0, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 16 }}>
                      {post.title || firstText?.content?.slice(0, 60) || '(без заголовка)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                      {post.author?.username || '—'} · {post.createdAt ? new Date(post.createdAt).toLocaleString('ru-RU') : ''} · блоков: {post.blocks?.length || 0} · просмотров: {seenCount}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap', background: post.active ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.06)', color: post.active ? 'var(--primary-neon)' : 'var(--text-dim)' }}>
                    {post.active ? 'Активен' : 'Выключен'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14, borderTop: '1px solid var(--glass-border)', paddingTop: 14 }}>
                  <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => toggleActive(post)}>{post.active ? 'Выключить' : 'Включить'}</button>
                  <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => setEditing(post)}>Редактировать</button>
                  <button className="settings-btn settings-btn-danger" onClick={() => deletePost(post)}>Удалить</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PostsModeration;
