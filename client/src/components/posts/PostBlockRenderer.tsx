import React from 'react';
import { PostBlock } from './postTypes';
import { getFullUrl } from '../../utils/avatar';

interface PostBlockRendererProps {
  block: PostBlock;
  currentUserId?: string;
  interactive?: boolean;
  onVote?: (blockId: string, optionIds: string[]) => void;
  onAddOption?: (blockId: string, text: string) => void;
}

const PostBlockRenderer: React.FC<PostBlockRendererProps> = ({ block, currentUserId, interactive = false, onVote, onAddOption }) => {
  const [customText, setCustomText] = React.useState('');
  const wrap: React.CSSProperties = {
    marginTop: block.marginTop ?? 0,
    marginBottom: block.marginBottom ?? 0,
  };

  if (block.type === 'text') {
    return (
      <div style={{
        ...wrap,
        fontSize: block.fontSize,
        fontWeight: block.fontWeight,
        fontFamily: block.fontFamily,
        color: block.color,
        textAlign: block.align,
        lineHeight: block.lineHeight,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {block.content}
      </div>
    );
  }

  if (block.type === 'image') {
    if (!block.url) return null;
    const justify = block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center';
    return (
      <div style={{ ...wrap, display: 'flex', justifyContent: justify }}>
        <img
          src={getFullUrl(block.url) || block.url}
          alt={block.filename || ''}
          style={{ width: `${block.width}%`, maxWidth: '100%', borderRadius: block.radius, display: 'block' }}
        />
      </div>
    );
  }

  if (block.type === 'video') {
    if (!block.url) return null;
    return (
      <div style={wrap}>
        <video
          src={getFullUrl(block.url) || block.url}
          controls
          style={{ width: '100%', borderRadius: block.radius, display: 'block' }}
        />
      </div>
    );
  }

  if (block.type === 'divider') {
    return <div style={{ ...wrap, height: 1, background: 'var(--glass-border, rgba(255,255,255,0.1))' }} />;
  }

  if (block.type === 'poll') {
    const votes = block.votes || {};
    const totalVotes = Object.values(votes).reduce((s, arr) => s + (arr?.length || 0), 0);
    const myVotedOptions = currentUserId
      ? block.options.filter(o => (votes[o.id] || []).map(String).includes(String(currentUserId))).map(o => o.id)
      : [];
    const hasVoted = myVotedOptions.length > 0;

    const handleClick = (optionId: string) => {
      if (!interactive || !onVote) return;
      if (block.multiple) {
        const next = myVotedOptions.includes(optionId)
          ? myVotedOptions.filter(id => id !== optionId)
          : [...myVotedOptions, optionId];
        onVote(block.id, next);
      } else {
        onVote(block.id, [optionId]);
      }
    };

    return (
      <div style={{ ...wrap, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: 'var(--text-main, #fff)' }}>{block.question}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {block.options.map(opt => {
            const count = (votes[opt.id] || []).length;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const mine = myVotedOptions.includes(opt.id);
            const showResults = hasVoted || !interactive;
            return (
              <button
                key={opt.id}
                onClick={() => handleClick(opt.id)}
                disabled={!interactive}
                style={{
                  position: 'relative',
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${mine ? 'var(--primary-neon, #00e5ff)' : 'rgba(255,255,255,0.1)'}`,
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--text-main, #fff)',
                  cursor: interactive ? 'pointer' : 'default',
                  overflow: 'hidden',
                }}
              >
                {showResults && (
                  <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: mine ? 'rgba(0,229,255,0.18)' : 'rgba(255,255,255,0.06)', transition: 'width 0.3s' }} />
                )}
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>{mine ? '✓ ' : ''}{opt.text}</span>
                  {showResults && <span style={{ color: 'var(--text-dim, rgba(255,255,255,0.5))', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>}
                </div>
              </button>
            );
          })}
        </div>
        {interactive && block.allowCustom && onAddOption && (
          <form
            style={{ display: 'flex', gap: 8, marginTop: 8 }}
            onSubmit={e => {
              e.preventDefault();
              const t = customText.trim();
              if (!t) return;
              onAddOption(block.id, t);
              setCustomText('');
            }}
          >
            <input
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Свой вариант…"
              maxLength={120}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-main, #fff)', fontSize: 14, outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!customText.trim()}
              style={{
                padding: '0 16px', borderRadius: 10, border: '1px solid rgba(0,229,255,0.4)',
                background: 'rgba(0,229,255,0.12)', color: 'var(--primary-neon, #00e5ff)',
                fontWeight: 600, cursor: customText.trim() ? 'pointer' : 'default',
                opacity: customText.trim() ? 1 : 0.4,
              }}
            >
              Добавить
            </button>
          </form>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim, rgba(255,255,255,0.5))' }}>
          {totalVotes} голос(ов){block.multiple ? ' · можно выбрать несколько' : ''}
        </div>
      </div>
    );
  }

  return null;
};

export default PostBlockRenderer;
