import React, { useState, useCallback, useMemo } from 'react';
import { getFullUrl } from '../utils/avatar';
import { downloadFile } from '../utils/transfers';
import { matchInviteCode, openInviteInApp } from '../utils/inviteLinks';
import { User, Server } from '../types';
import './MarkdownContent.css';

export type { User, Server };

/**
 * Маркер статьи: сообщения, созданные через редактор статей, начинаются с этой
 * невидимой последовательности (BOM + Zero-Width Space).
 * Обычные сообщения не содержат этот маркер и отображаются стандартно
 * (без заголовков, таблиц и т.д., сохраняя обычные теги и #упоминания каналов).
 */
export const ARTICLE_MARKER = '\uFEFF\u200B';

export interface MarkdownContentProps {
  content: string;
  mentions?: User[];
  server?: Server;
  onUserClick?: (userId: string, event?: React.MouseEvent) => void;
  customConfirm?: (msg: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>;
  openLink?: (url: string) => void;
  onImageClick?: (url: string, alt?: string) => void;
  className?: string;
  forceArticle?: boolean;
}

// Default openLink handler
export const defaultOpenLink = (url: string) => {
  if ((window as any).electron?.util?.openExternal) {
    (window as any).electron.util.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

// Code block with copy button
const CodeBlock: React.FC<{ lang?: string; code: string }> = ({ lang, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="md-code-block" onClick={e => e.stopPropagation()}>
      <div className="md-code-header">
        <span className="md-code-lang">{lang || 'text'}</span>
        <button
          type="button"
          className="md-code-copy-btn"
          onClick={handleCopy}
          title="Копировать код"
        >
          {copied ? 'Скопировано!' : 'Копировать'}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>{code.replace(/^\n/, '').replace(/\n$/, '')}</code>
      </pre>
    </div>
  );
};

// Spoiler with toggle
const Spoiler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`md-spoiler ${revealed ? 'revealed' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(r => !r);
      }}
      title={revealed ? 'Спойлер (нажмите, чтобы скрыть)' : 'Спойлер (нажмите, чтобы показать)'}
    >
      {children}
    </span>
  );
};

// Image element with error fallback & click preview
const MarkdownImage: React.FC<{
  src: string;
  alt?: string;
  title?: string;
  inline?: boolean;
  onOpen?: (url: string, alt?: string) => void;
}> = ({ src, alt, title, inline, onOpen }) => {
  const [error, setError] = useState(false);
  const resolvedSrc = getFullUrl(src) || src;

  if (error) {
    return (
      <span className="md-image-error" title={`Не удалось загрузить: ${resolvedSrc}`}>
        🖼️ [{alt || 'Изображение'}]
      </span>
    );
  }

  const content = (
    <img
      src={resolvedSrc}
      alt={alt || ''}
      title={title || alt || ''}
      className="md-image"
      loading="lazy"
      onError={() => setError(true)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(resolvedSrc, alt);
      }}
    />
  );

  if (inline) {
    return <span className="md-image-inline">{content}</span>;
  }

  return (
    <div className="md-image-block">
      {content}
      {alt ? <span className="md-image-caption">{alt}</span> : null}
    </div>
  );
};

// Block types for articles
type Block =
  | { type: 'code'; lang: string; code: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'table'; headers: string[]; alignments: ('left' | 'center' | 'right' | null)[]; rows: string[][] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: { text: string; checked?: boolean; level: number }[] }
  | { type: 'hr' }
  | { type: 'image'; src: string; alt?: string; title?: string }
  | { type: 'paragraph'; text: string };

// Parse markdown text into block tokens (only for articles)
function parseBlocks(content: string): Block[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (``` or ~~~)
    const codeMatch = line.match(/^([`~]{3,})(\w*)\s*$/);
    if (codeMatch) {
      const fence = codeMatch[1];
      const lang = codeMatch[2] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    // Horizontal Rule (---, ***, ___)
    if (/^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Heading (# to ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Table check: line contains '|' and next line is a delimiter row '|---|---|'
    if (line.includes('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const delimiterMatch = nextLine.match(/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/);
      if (delimiterMatch) {
        const splitRow = (r: string) => {
          let row = r.trim();
          if (row.startsWith('|')) row = row.slice(1);
          if (row.endsWith('|')) row = row.slice(0, -1);
          return row.split('|').map(c => c.trim());
        };

        const headers = splitRow(line);
        const delimParts = splitRow(nextLine);
        const alignments: ('left' | 'center' | 'right' | null)[] = delimParts.map(d => {
          const l = d.startsWith(':');
          const r = d.endsWith(':');
          if (l && r) return 'center';
          if (l) return 'left';
          if (r) return 'right';
          return null;
        });

        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim().length > 0) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        blocks.push({ type: 'table', headers, alignments, rows });
        continue;
      }
    }

    // Blockquote (> ...)
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    // List item (ordered, unordered, task)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: { text: string; checked?: boolean; level: number }[] = [];

      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/);
        if (!itemMatch) break;
        const indent = itemMatch[1].length;
        const level = Math.floor(indent / 2);
        const checked = itemMatch[3] !== undefined ? itemMatch[3].toLowerCase() === 'x' : undefined;
        items.push({
          text: itemMatch[4],
          checked,
          level,
        });
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Standalone image on its own line: ![alt](url "title")
    const standaloneImgMatch = line.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|[^\s)]+)(?:\s+"([^"]*)")?\)$/);
    if (standaloneImgMatch) {
      blocks.push({
        type: 'image',
        alt: standaloneImgMatch[1],
        src: standaloneImgMatch[2],
        title: standaloneImgMatch[3],
      });
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph: collect consecutive non-empty lines that don't start other blocks
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^([`~]{3,}|#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+|(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$)/) &&
      !(lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].trim().match(/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/)) &&
      !lines[i].trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|[^\s)]+)(?:\s+"([^"]*)")?\)$/)
    ) {
      pLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: pLines.join('\n') });
  }

  return blocks;
}

// Inline token types
type InlineToken =
  | { type: 'code'; content: string }
  | { type: 'image'; src: string; alt: string; title?: string }
  | { type: 'link'; href: string; text: string }
  | { type: 'autolink'; href: string }
  | { type: 'spoiler'; content: string }
  | { type: 'bold_italic'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'strike'; content: string }
  | { type: 'underline'; content: string }
  | { type: 'server_emoji'; name: string }
  | { type: 'channel_mention'; channelName: string }
  | { type: 'user_mention'; rawName: string }
  | { type: 'text'; content: string };

// Tokenize inline markdown for articles
function tokenizeInline(text: string, server?: Server): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;

  const patterns: { type: InlineToken['type']; regex: RegExp }[] = [
    { type: 'code', regex: /`([^`]+)`/ },
    { type: 'image', regex: /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|[^\s)]+)(?:\s+"([^"]*)")?\)/ },
    { type: 'link', regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^\s)]+)(?:\s+"([^"]*)")?\)/ },
    { type: 'autolink', regex: /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/ },
    { type: 'spoiler', regex: /\|\|(?![\s|])([\s\S]+?)(?<![\s|])\|\|/ },
    { type: 'bold_italic', regex: /(?<!\*)\*\*\*(?![\s*])([\s\S]+?)(?<![\s*])\*\*\*(?!\*)|(?<!_)___(?![\s_])([\s\S]+?)(?<![\s_])___(?!_)/ },
    { type: 'bold', regex: /(?<!\*)\*\*(?![\s*])([\s\S]+?)(?<![\s*])\*\*(?!\*)/ },
    { type: 'underline', regex: /<u>([\s\S]+?)<\/u>|(?<!_)__(?![\s_])([\s\S]+?)(?<![\s_])__(?!_)/ },
    { type: 'italic', regex: /(?<!\*)\*(?![\s*])([\s\S]+?)(?<![\s*])\*(?!\*)|(?<!_)_(?![\s_])([\s\S]+?)(?<![\s_])_(?!_)/ },
    { type: 'strike', regex: /~~(?![\s~])([\s\S]+?)(?<![\s~])~~/ },
    { type: 'server_emoji', regex: /:([a-zA-Z0-9_+-]+):/ },
    { type: 'channel_mention', regex: /#([\p{L}\p{N}_-]+)/u },
    { type: 'user_mention', regex: /@+([\p{L}\p{N}_.-]+)/u },
  ];

  while (cursor < text.length) {
    const sub = text.slice(cursor);
    let bestMatch: { type: InlineToken['type']; match: RegExpExecArray; index: number } | null = null;

    for (const p of patterns) {
      p.regex.lastIndex = 0;
      const m = p.regex.exec(sub);
      if (m && (bestMatch === null || m.index < bestMatch.index)) {
        // If channel_mention matched, only prioritize it if it matches a real channel
        if (p.type === 'channel_mention') {
          const chName = m[1].toLowerCase();
          const exists = server?.channels?.some(c => c.name.toLowerCase() === chName);
          if (!exists) {
            continue; // Not a channel on this server, ignore as mention
          }
        }
        bestMatch = { type: p.type, match: m, index: m.index };
      }
    }

    if (!bestMatch) {
      tokens.push({ type: 'text', content: sub });
      break;
    }

    if (bestMatch.index > 0) {
      tokens.push({ type: 'text', content: sub.slice(0, bestMatch.index) });
    }

    const m = bestMatch.match;
    switch (bestMatch.type) {
      case 'code':
        tokens.push({ type: 'code', content: m[1] });
        break;
      case 'image':
        tokens.push({ type: 'image', alt: m[1], src: m[2], title: m[3] });
        break;
      case 'link':
        tokens.push({ type: 'link', text: m[1], href: m[2] });
        break;
      case 'autolink':
        tokens.push({ type: 'autolink', href: m[0] });
        break;
      case 'spoiler':
        tokens.push({ type: 'spoiler', content: m[1] });
        break;
      case 'bold_italic':
        tokens.push({ type: 'bold_italic', content: m[1] || m[2] });
        break;
      case 'bold':
        tokens.push({ type: 'bold', content: m[1] });
        break;
      case 'italic':
        tokens.push({ type: 'italic', content: m[1] || m[2] });
        break;
      case 'strike':
        tokens.push({ type: 'strike', content: m[1] });
        break;
      case 'underline':
        tokens.push({ type: 'underline', content: m[1] || m[2] });
        break;
      case 'server_emoji':
        tokens.push({ type: 'server_emoji', name: m[1] });
        break;
      case 'channel_mention':
        tokens.push({ type: 'channel_mention', channelName: m[1] });
        break;
      case 'user_mention':
        tokens.push({ type: 'user_mention', rawName: m[1] });
        break;
      default:
        tokens.push({ type: 'text', content: m[0] });
    }

    cursor += bestMatch.index + m[0].length;
  }

  return tokens;
}

/**
 * Basic inline formatting shared with embeds and regular chat messages:
 * **bold**, *italic*, __underline__, `code`, https:// links, ~~strike~~, ||spoiler||
 * Supports nested inline formatting (e.g. ***bold italic***, ~~**strike bold**~~).
 */
export const renderBasicInline = (
  text: string,
  customConfirm?: (msg: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>,
  openLink: (url: string) => void = defaultOpenLink
): React.ReactNode => {
  if (!text) return null;

  const basicPatterns: { type: string; regex: RegExp }[] = [
    { type: 'code', regex: /`([^`]+)`/ },
    { type: 'spoiler', regex: /\|\|(?![\s|])([\s\S]+?)(?<![\s|])\|\|/ },
    { type: 'bold_italic', regex: /(?<!\*)\*\*\*(?![\s*])([\s\S]+?)(?<![\s*])\*\*\*(?!\*)|(?<!_)___(?![\s_])([\s\S]+?)(?<![\s_])___(?!_)/ },
    { type: 'bold', regex: /(?<!\*)\*\*(?![\s*])([\s\S]+?)(?<![\s*])\*\*(?!\*)/ },
    { type: 'underline', regex: /<u>([\s\S]+?)<\/u>|(?<!_)__(?![\s_])([\s\S]+?)(?<![\s_])__(?!_)/ },
    { type: 'italic', regex: /(?<!\*)\*(?![\s*])([\s\S]+?)(?<![\s*])\*(?!\*)|(?<!_)_(?![\s_])([\s\S]+?)(?<![\s_])_(?!_)/ },
    { type: 'strike', regex: /~~(?![\s~])([\s\S]+?)(?<![\s~])~~/ },
    { type: 'link', regex: /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/ },
  ];

  let cursor = 0;
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;

  while (cursor < text.length) {
    const sub = text.slice(cursor);
    let bestMatch: { type: string; match: RegExpExecArray; index: number } | null = null;

    for (const p of basicPatterns) {
      p.regex.lastIndex = 0;
      const m = p.regex.exec(sub);
      if (m && (bestMatch === null || m.index < bestMatch.index)) {
        bestMatch = { type: p.type, match: m, index: m.index };
      }
    }

    if (!bestMatch) {
      elements.push(sub);
      break;
    }

    if (bestMatch.index > 0) {
      elements.push(sub.slice(0, bestMatch.index));
    }

    const m = bestMatch.match;
    const inner = m[1] || m[2] || '';
    const curKey = `bi-${keyIdx++}`;

    switch (bestMatch.type) {
      case 'code':
        elements.push(<code key={curKey} className="inline-code">{m[1]}</code>);
        break;
      case 'spoiler':
        elements.push(<Spoiler key={curKey}>{renderBasicInline(inner, customConfirm, openLink)}</Spoiler>);
        break;
      case 'bold_italic':
        elements.push(<strong key={curKey}><em>{renderBasicInline(inner, customConfirm, openLink)}</em></strong>);
        break;
      case 'bold':
        elements.push(<strong key={curKey}>{renderBasicInline(inner, customConfirm, openLink)}</strong>);
        break;
      case 'underline':
        elements.push(<u key={curKey}>{renderBasicInline(inner, customConfirm, openLink)}</u>);
        break;
      case 'italic':
        elements.push(<em key={curKey}>{renderBasicInline(inner, customConfirm, openLink)}</em>);
        break;
      case 'strike':
        elements.push(<del key={curKey}>{renderBasicInline(inner, customConfirm, openLink)}</del>);
        break;
      case 'link': {
        const url = m[0];
        const inviteCode = matchInviteCode(url);
        if (inviteCode) {
          elements.push(
            <a
              key={curKey}
              href={url}
              className="message-link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openInviteInApp(inviteCode);
              }}
            >
              {url}
            </a>
          );
        } else {
          elements.push(
            <a
              key={curKey}
              href={url}
              className="message-link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (customConfirm) {
                  customConfirm(
                    `Вы собираетесь перейти на внешний ресурс: ${url}. Продолжить?`,
                    'Внешняя ссылка',
                    'Перейти',
                    'Отмена'
                  ).then((ok) => { if (ok) openLink(url); });
                } else {
                  openLink(url);
                }
              }}
            >
              {url}
            </a>
          );
        }
        break;
      }
    }

    cursor += bestMatch.index + m[0].length;
  }

  return elements;
};

// Aliased export for compatibility
export const renderInlineMarkdown = renderBasicInline;

// Render inline markdown tokens to React elements for articles
const renderArticleInline = (
  text: string,
  customConfirm?: (msg: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>,
  openLink: (url: string) => void = defaultOpenLink,
  server?: Server,
  mentions: User[] = [],
  onUserClick?: (userId: string, event?: React.MouseEvent) => void,
  onImageClick?: (url: string, alt?: string) => void
): React.ReactNode => {
  if (!text) return null;
  const tokens = tokenizeInline(text, server);

  const handleLinkClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    e.stopPropagation();

    const inviteCode = matchInviteCode(href);
    if (inviteCode) {
      openInviteInApp(inviteCode);
      return;
    }

    if (customConfirm) {
      customConfirm(
        `Вы собираетесь перейти на внешний ресурс: ${href}. Продолжить?`,
        'Внешняя ссылка',
        'Перейти',
        'Отмена'
      ).then((ok) => {
        if (ok) openLink(href);
      });
    } else {
      openLink(href);
    }
  };

  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'code':
        return <code key={idx} className="inline-code">{token.content}</code>;

      case 'image':
        return (
          <MarkdownImage
            key={idx}
            src={token.src}
            alt={token.alt}
            title={token.title}
            inline
            onOpen={onImageClick}
          />
        );

      case 'link':
        return (
          <a
            key={idx}
            href={token.href}
            className="message-link"
            onClick={(e) => handleLinkClick(e, token.href)}
          >
            {renderArticleInline(token.text, customConfirm, openLink, server, mentions, onUserClick, onImageClick)}
          </a>
        );

      case 'autolink':
        return (
          <a
            key={idx}
            href={token.href}
            className="message-link"
            onClick={(e) => handleLinkClick(e, token.href)}
          >
            {token.href}
          </a>
        );

      case 'spoiler':
        return (
          <Spoiler key={idx}>
            {renderArticleInline(token.content, customConfirm, openLink, server, mentions, onUserClick, onImageClick)}
          </Spoiler>
        );

      case 'bold_italic':
        return (
          <strong key={idx}>
            <em>{renderArticleInline(token.content, customConfirm, openLink, server, mentions, onUserClick, onImageClick)}</em>
          </strong>
        );

      case 'bold':
        return (
          <strong key={idx}>
            {renderArticleInline(token.content, customConfirm, openLink, server, mentions, onUserClick, onImageClick)}
          </strong>
        );

      case 'italic':
        return (
          <em key={idx}>
            {renderArticleInline(token.content, customConfirm, openLink, server, mentions, onUserClick, onImageClick)}
          </em>
        );

      case 'strike':
        return (
          <del key={idx}>
            {renderArticleInline(token.content, customConfirm, openLink, server, mentions, onUserClick, onImageClick)}
          </del>
        );

      case 'underline':
        return (
          <u key={idx}>
            {renderArticleInline(token.content, customConfirm, openLink, server, mentions, onUserClick, onImageClick)}
          </u>
        );

      case 'server_emoji': {
        const serverEmoji = server?.emojis?.find(e => e.name === token.name);
        if (serverEmoji) {
          return (
            <img
              key={idx}
              src={getFullUrl(serverEmoji.url) || serverEmoji.url}
              alt={`:${token.name}:`}
              title={`:${token.name}:`}
              style={{
                width: '1.3em',
                height: '1.3em',
                verticalAlign: 'middle',
                objectFit: 'contain',
                display: 'inline-block',
                margin: '0 2px'
              }}
            />
          );
        }
        return `:${token.name}:`;
      }

      case 'channel_mention': {
        const targetChannel = server?.channels?.find(
          c => c.name.toLowerCase() === token.channelName.toLowerCase()
        );
        if (targetChannel && server) {
          return (
            <span
              key={idx}
              className="mention-tag channel-mention"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('select-server', {
                  detail: { serverId: server._id, channelId: targetChannel._id }
                }));
              }}
            >
              #{targetChannel.name}
            </span>
          );
        }
        return `#${token.channelName}`;
      }

      case 'user_mention': {
        const rawName = token.rawName;
        const isSpecialMention = rawName === 'everyone' || rawName === 'here';
        const role = !isSpecialMention
          ? server?.roles?.find(r => r.name === rawName || r.name.replace(/^@+/, '') === rawName)
          : undefined;
        const userMention = (!isSpecialMention && !role)
          ? mentions.find(m => m.username === rawName || m.displayName === rawName)
          : undefined;

        if (userMention || role || isSpecialMention) {
          const color = role ? role.color : (isSpecialMention ? 'var(--primary-neon)' : 'inherit');
          const displayText = `@${role ? role.name.replace(/^@+/, '') : (userMention ? userMention.username : rawName)}`;

          return (
            <span
              key={idx}
              className={`mention-tag ${role ? 'role-mention' : (isSpecialMention ? 'special-mention' : 'user-mention')}`}
              style={{
                ...(color !== 'inherit' ? { color } : {}),
                ...((isSpecialMention || role) ? { cursor: 'default' } : {})
              }}
              onClick={(e) => {
                if (!isSpecialMention && !role && userMention && onUserClick) {
                  e.stopPropagation();
                  onUserClick(userMention._id, e);
                }
              }}
            >
              {displayText}
            </span>
          );
        }
        return `@${rawName}`;
      }

      case 'text':
      default:
        return token.content;
    }
  });
};

/**
 * Рендер обычного сообщения:
 * Сохраняет проверенную логику Zvon для обычных сообщений:
 * - Код-блоки ```...```
 * - Каналы #имя_канала
 * - Эмодзи :эмодзи:
 * - Упоминания @пользователь
 * - Инлайн форматирование (**жирный**, *курсив*, `код`, ссылки)
 * НЕ форматирует заголовки, списки, таблицы и #текст, если это не канал сервера!
 */
const renderRegularMessage = (
  content: string,
  server?: Server,
  mentions: User[] = [],
  onUserClick?: (userId: string, event?: React.MouseEvent) => void,
  customConfirm?: (msg: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>,
  openLink: (url: string) => void = defaultOpenLink
) => {
  const parts = content.split(/(```[\s\S]*?```|:[a-zA-Z0-9_+-]+:|@+[\p{L}\p{N}_.-]+|#[\p{L}\p{N}_-]+)/gu);

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (typeof part !== 'string') return null;

        if (part.startsWith('```') && part.endsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          if (match) {
            const lang = match[1] || 'text';
            const code = match[2];
            return <CodeBlock key={`code-${i}`} lang={lang} code={code} />;
          }
        }

        if (part.startsWith('#')) {
          const channelName = part.substring(1);
          const targetChannel = server?.channels?.find(
            c => c.name.toLowerCase() === channelName.toLowerCase()
          );

          if (targetChannel && server) {
            return (
              <span
                key={`channel-mention-${i}`}
                className="mention-tag channel-mention"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(new CustomEvent('select-server', {
                    detail: { serverId: server._id, channelId: targetChannel._id }
                  }));
                }}
              >
                #{targetChannel.name}
              </span>
            );
          }
        }

        if (part.startsWith(':') && part.endsWith(':')) {
          const emojiName = part.slice(1, -1);
          const serverEmoji = server?.emojis?.find(e => e.name === emojiName);

          if (serverEmoji) {
            return (
              <img
                key={`emoji-${i}`}
                src={getFullUrl(serverEmoji.url) || serverEmoji.url}
                alt={part}
                title={`:${emojiName}:`}
                style={{
                  width: '1.3em',
                  height: '1.3em',
                  verticalAlign: 'middle',
                  objectFit: 'contain',
                  display: 'inline-block',
                  margin: '0 2px'
                }}
              />
            );
          }
        }

        if (part.startsWith('@')) {
          const rawName = part.replace(/^@+/, '');
          const isSpecialMention = rawName === 'everyone' || rawName === 'here';
          const role = !isSpecialMention
            ? server?.roles?.find(r => r.name === rawName || r.name.replace(/^@+/, '') === rawName)
            : undefined;
          const userMentionByName = (!isSpecialMention && !role)
            ? mentions.find(m => m.username === rawName || m.displayName === rawName)
            : undefined;

          let userMention = userMentionByName;
          if (!isSpecialMention && !role && !userMentionByName) {
            const prevUserMentions = parts.slice(0, i).filter(p => {
              if (!p.startsWith('@')) return false;
              const pName = p.replace(/^@+/, '');
              if (pName === 'everyone' || pName === 'here') return false;
              if (server?.roles?.some(r => r.name === pName || r.name.replace(/^@+/, '') === pName)) return false;
              return true;
            });
            const userMentionIndex = mentions.findIndex((_, idx) => prevUserMentions.length === idx);
            if (userMentionIndex !== -1) {
              userMention = mentions[userMentionIndex];
            }
          }
          const isUserMention = !!userMention;

          if (isUserMention || role || isSpecialMention) {
            const color = role ? role.color : (isSpecialMention ? 'var(--primary-neon)' : 'inherit');
            const displayText = `@${role ? role.name.replace(/^@+/, '') : (userMention ? userMention.username : rawName)}`;

            return (
              <span
                key={`mention-${i}`}
                className={`mention-tag ${role ? 'role-mention' : (isSpecialMention ? 'special-mention' : 'user-mention')}`}
                style={{
                  ...(color !== 'inherit' ? { color } : {}),
                  ...((isSpecialMention || role) ? { cursor: 'default' } : {})
                }}
                onClick={(e) => {
                  if (!isSpecialMention && !role && userMention && onUserClick) {
                    e.stopPropagation();
                    onUserClick(userMention._id, e);
                  }
                }}
              >
                {displayText}
              </span>
            );
          }
        }

        return (
          <span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>
            {renderBasicInline(part, customConfirm, openLink)}
          </span>
        );
      })}
    </>
  );
};

/**
 * Main MarkdownContent Component
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  mentions = [],
  server,
  onUserClick,
  customConfirm,
  openLink = defaultOpenLink,
  onImageClick,
  className = '',
  forceArticle = false,
}) => {
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt?: string } | null>(null);

  const handleImageOpen = useCallback((url: string, alt?: string) => {
    if (onImageClick) {
      onImageClick(url, alt);
    } else {
      setLightboxImage({ url, alt });
    }
  }, [onImageClick]);

  if (!content) return null;

  const isArticle = forceArticle || content.startsWith(ARTICLE_MARKER);
  const cleanContent = content.startsWith(ARTICLE_MARKER)
    ? content.slice(ARTICLE_MARKER.length)
    : content;

  // Обычное сообщение, не написанное через редактор статей
  if (!isArticle) {
    return (
      <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
        {renderRegularMessage(cleanContent, server, mentions, onUserClick, customConfirm, openLink)}
      </span>
    );
  }

  // Статья из редактора статей: полный Markdown
  const blocks = parseBlocks(cleanContent);

  return (
    <div className={`markdown-content ${className}`}>
      {blocks.map((block, bIdx) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={bIdx} lang={block.lang} code={block.code} />;

          case 'heading': {
            const children = renderArticleInline(block.text, customConfirm, openLink, server, mentions, onUserClick, handleImageOpen);
            switch (block.level) {
              case 1: return <h1 key={bIdx} className="md-h md-h1">{children}</h1>;
              case 2: return <h2 key={bIdx} className="md-h md-h2">{children}</h2>;
              case 3: return <h3 key={bIdx} className="md-h md-h3">{children}</h3>;
              case 4: return <h4 key={bIdx} className="md-h md-h4">{children}</h4>;
              case 5: return <h5 key={bIdx} className="md-h md-h5">{children}</h5>;
              case 6:
              default:
                return <h6 key={bIdx} className="md-h md-h6">{children}</h6>;
            }
          }

          case 'table':
            return (
              <div key={bIdx} className="md-table-wrapper">
                <table className="md-table">
                  <thead>
                    <tr>
                      {block.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          style={{ textAlign: block.alignments[hIdx] || 'left' }}
                        >
                          {renderArticleInline(h, customConfirm, openLink, server, mentions, onUserClick, handleImageOpen)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {block.headers.map((_, cIdx) => (
                          <td
                            key={cIdx}
                            style={{ textAlign: block.alignments[cIdx] || 'left' }}
                          >
                            {renderArticleInline(row[cIdx] || '', customConfirm, openLink, server, mentions, onUserClick, handleImageOpen)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'blockquote':
            return (
              <blockquote key={bIdx} className="md-blockquote">
                {block.lines.map((l, lIdx) => (
                  <p key={lIdx}>
                    {renderArticleInline(l, customConfirm, openLink, server, mentions, onUserClick, handleImageOpen)}
                  </p>
                ))}
              </blockquote>
            );

          case 'list': {
            const hasCheckboxes = block.items.some(it => it.checked !== undefined);
            if (hasCheckboxes) {
              return (
                <ul key={bIdx} className="md-task-list">
                  {block.items.map((item, itIdx) => (
                    <li
                      key={itIdx}
                      className="md-task-item"
                      style={{ paddingLeft: `${item.level * 18}px` }}
                    >
                      {item.checked !== undefined && (
                        <input
                          type="checkbox"
                          className="md-task-checkbox"
                          checked={item.checked}
                          readOnly
                        />
                      )}
                      <span>
                        {renderArticleInline(item.text, customConfirm, openLink, server, mentions, onUserClick, handleImageOpen)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            }

            const ListTag = block.ordered ? 'ol' : 'ul';
            const listClass = block.ordered ? 'md-ol' : 'md-ul';
            return (
              <ListTag key={bIdx} className={listClass}>
                {block.items.map((item, itIdx) => (
                  <li
                    key={itIdx}
                    className="md-li"
                    style={{ marginLeft: `${item.level * 16}px` }}
                  >
                    {renderArticleInline(item.text, customConfirm, openLink, server, mentions, onUserClick, handleImageOpen)}
                  </li>
                ))}
              </ListTag>
            );
          }

          case 'hr':
            return <hr key={bIdx} className="md-hr" />;

          case 'image':
            return (
              <MarkdownImage
                key={bIdx}
                src={block.src}
                alt={block.alt}
                title={block.title}
                onOpen={handleImageOpen}
              />
            );

          case 'paragraph':
          default:
            return (
              <p key={bIdx}>
                {renderArticleInline(block.text, customConfirm, openLink, server, mentions, onUserClick, handleImageOpen)}
              </p>
            );
        }
      })}

      {/* Built-in image preview lightbox if none supplied by parent */}
      {lightboxImage && (
        <div
          className="md-image-lightbox"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="md-image-lightbox__content"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="md-image-lightbox__close"
              onClick={() => setLightboxImage(null)}
              aria-label="Закрыть"
            >
              ×
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.alt || ''}
              className="md-image-lightbox__img"
            />
            <div className="md-image-lightbox__actions">
              <button
                type="button"
                className="md-image-lightbox__btn"
                onClick={() => downloadFile(lightboxImage.url, lightboxImage.alt || 'image')}
              >
                Скачать оригинал
              </button>
              <button
                type="button"
                className="md-image-lightbox__btn"
                onClick={() => openLink(lightboxImage.url)}
              >
                Открыть в браузере
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkdownContent;
