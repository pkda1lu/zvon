import React from 'react';
import { createRoot } from 'react-dom/client';
import MessageAttachment from '../src/components/MessageAttachment';
import '../src/components/Attachments.css';

// Видео из public/media под видом обычного вложения и видеосообщения.
const src = `${location.origin}/media/liminal-hands.mp4`;
const items = [
  { url: src, type: 'video/mp4', filename: 'clip.mp4' },
  { url: src, type: 'video/mp4', filename: 'video-message-5s.mp4' },
];

createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'flex', gap: 40, padding: 40, alignItems: 'flex-start' }}>
    {items.map((att, i) => (
      <div key={i} className="attachment-item" id={`att-${i}`} style={{ position: 'relative', width: 360 }}>
        <MessageAttachment att={att as any} />
      </div>
    ))}
  </div>
);
