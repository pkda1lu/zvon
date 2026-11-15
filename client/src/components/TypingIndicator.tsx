import React from 'react';

export default function TypingIndicator({ names }: { names: Array<string | undefined> }) {
  const typingNames = names.filter(Boolean);

  return (
    <div className="chat-typing-slot" role="status">
      {typingNames.length > 0 && (
        <div className="typing-indicator-new">
          <div className="typing-dots" aria-hidden="true">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
          <span className="typing-text">
            {typingNames.length === 1 ? (
              <><strong>{typingNames[0]}</strong> печатает...</>
            ) : typingNames.length === 2 ? (
              <><strong>{typingNames[0]}</strong> и <strong>{typingNames[1]}</strong> печатают...</>
            ) : (
              <><strong>Несколько человек</strong> печатают...</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
