import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import './MessagePoll.css';

export interface ChatPollOption {
  id: string;
  text: string;
  custom?: boolean;
  voters?: Array<string | { _id: string; username?: string }>;
}

export interface ChatPoll {
  question: string;
  multiple?: boolean;
  allowCustom?: boolean;
  options: ChatPollOption[];
}

interface MessagePollProps {
  messageId: string;
  poll: ChatPoll;
  currentUserId?: string;
}

const voterId = (v: string | { _id: string }): string => String(typeof v === 'object' ? v._id : v);

const MessagePoll: React.FC<MessagePollProps> = ({ messageId, poll, currentUserId }) => {
  const [customText, setCustomText] = useState('');
  const [busy, setBusy] = useState(false);

  const options = poll.options || [];
  const totalVotes = options.reduce((s, o) => s + (o.voters?.length || 0), 0);
  const myVoted = currentUserId
    ? options.filter(o => (o.voters || []).some(v => voterId(v) === String(currentUserId))).map(o => o.id)
    : [];

  const vote = async (optionId: string) => {
    if (busy) return;
    let next: string[];
    if (poll.multiple) {
      next = myVoted.includes(optionId) ? myVoted.filter(id => id !== optionId) : [...myVoted, optionId];
    } else {
      next = [optionId];
    }
    setBusy(true);
    try {
      await axios.post(`/api/messages/${messageId}/poll-vote`, { optionIds: next });
    } catch {} finally { setBusy(false); }
  };

  const addCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = customText.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await axios.post(`/api/messages/${messageId}/poll-vote`, { customText: t });
      setCustomText('');
    } catch {} finally { setBusy(false); }
  };

  return (
    <motion.div
      className="msg-poll"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
    >
      <div className="msg-poll__question">{poll.question}</div>
      <div className="msg-poll__options">
        {options.map(opt => {
          const count = opt.voters?.length || 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const mine = myVoted.includes(opt.id);
          return (
            <button
              key={opt.id}
              className={`msg-poll__option${mine ? ' msg-poll__option--mine' : ''}`}
              onClick={() => vote(opt.id)}
              disabled={busy}
            >
              <motion.div
                className="msg-poll__bar"
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 30 }}
              />
              <div className="msg-poll__row">
                <span className="msg-poll__text">{mine ? '✓ ' : ''}{opt.text}</span>
                <span className="msg-poll__pct">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {poll.allowCustom && (
        <form className="msg-poll__custom" onSubmit={addCustom}>
          <input
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="Свой вариант…"
            maxLength={120}
            disabled={busy}
          />
          <button type="submit" disabled={!customText.trim() || busy}>Добавить</button>
        </form>
      )}

      <div className="msg-poll__meta">
        {totalVotes} голос(ов){poll.multiple ? ' · можно выбрать несколько' : ''}
      </div>
    </motion.div>
  );
};

export default MessagePoll;
