import React from 'react';
import { useSocket } from '../contexts/SocketContext';
import { discardMessage, retryMessage, PendingMessage } from '../utils/outbox';
import './ChatReliability.css';

/*
 * Подпись под своим сообщением, которое ещё не подтвердил сервер:
 * «Отправляется…», «Ожидает подключения» или «Не отправлено» с кнопками.
 */
const PendingMessageStatus: React.FC<{ msg: PendingMessage }> = ({ msg }) => {
  const { socket, connected } = useSocket();
  if (!msg._pending || !msg.nonce) return null;
  const nonce = msg.nonce;

  if (msg._pending === 'sending') {
    return (
      <div className="pending-status" role="status">
        <span className="pending-status-spinner" aria-hidden="true" />
        {connected ? 'Отправляется…' : 'Ожидает подключения — отправится автоматически'}
      </div>
    );
  }

  return (
    <div className="pending-status failed" role="alert">
      <span className="pending-status-icon" aria-hidden="true">!</span>
      <span className="pending-status-text">Не отправлено{msg._error ? ` · ${msg._error}` : ''}</span>
      <button type="button" className="pending-status-btn" onClick={() => retryMessage(nonce, socket)}>
        Повторить
      </button>
      <button type="button" className="pending-status-btn subtle" onClick={() => discardMessage(nonce)}>
        Удалить
      </button>
    </div>
  );
};

export default PendingMessageStatus;
