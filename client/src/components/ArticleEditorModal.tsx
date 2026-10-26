import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import MarkdownContent from './MarkdownContent';
import { User, Server } from '../types';
import { uploadFiles } from '../utils/transfers';
import './ArticleEditorModal.css';

interface ArticleEditorModalProps {
  isOpen: boolean;
  onClose: (draft?: string) => void;
  onSend: (content: string, attachments?: any[]) => void;
  initialContent?: string;
  initialAttachments?: any[];
  server?: Server;
  mentions?: User[];
  isEditing?: boolean;
}

const ArticleEditorModal: React.FC<ArticleEditorModalProps> = ({
  isOpen,
  onClose,
  onSend,
  initialContent = '',
  initialAttachments = [],
  server,
  mentions = [],
  isEditing = false,
}) => {
  const [content, setContent] = useState(initialContent);
  const [attachments, setAttachments] = useState<any[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial content on open
  useEffect(() => {
    if (isOpen) {
      setContent(initialContent || '');
      setAttachments(initialAttachments ? [...initialAttachments] : []);
      setActiveTab('edit');
      // Focus textarea shortly after opening
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            textareaRef.current.value.length,
            textareaRef.current.value.length
          );
        }
      }, 50);
    }
  }, [isOpen, initialContent]);

  const handleClose = () => {
    onClose(content);
  };

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSend(trimmed, attachments);
    setContent('');
    setAttachments([]);
  };

  const insertAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent(prev => prev + textToInsert);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.slice(0, start) + textToInsert + content.slice(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      const nextPos = start + textToInsert.length;
      textarea.setSelectionRange(nextPos, nextPos);
    }, 0);
  };

  const hasDelimBefore = (text: string, pos: number, delim: string): boolean => {
    if (pos < delim.length) return false;
    const chunk = text.slice(pos - delim.length, pos);
    if (chunk !== delim) return false;
    if (delim === '*') {
      let starCount = 0;
      for (let i = pos - 1; i >= 0 && text[i] === '*'; i--) starCount++;
      return starCount % 2 === 1;
    }
    if (delim === '**') {
      let starCount = 0;
      for (let i = pos - 1; i >= 0 && text[i] === '*'; i--) starCount++;
      return starCount >= 2;
    }
    return true;
  };

  const hasDelimAfter = (text: string, pos: number, delim: string): boolean => {
    if (pos + delim.length > text.length) return false;
    const chunk = text.slice(pos, pos + delim.length);
    if (chunk !== delim) return false;
    if (delim === '*') {
      let starCount = 0;
      for (let i = pos; i < text.length && text[i] === '*'; i++) starCount++;
      return starCount % 2 === 1;
    }
    if (delim === '**') {
      let starCount = 0;
      for (let i = pos; i < text.length && text[i] === '*'; i++) starCount++;
      return starCount >= 2;
    }
    return true;
  };

  const applyFormat = (
    prefix: string,
    suffix: string = '',
    defaultText: string = 'текст',
    isBlock: boolean = false
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);

    if (isBlock) {
      const before = content.slice(0, start);
      const needPrefixNewline = before.length > 0 && !before.endsWith('\n');
      const needSuffixNewline = !suffix.endsWith('\n');

      const pre = needPrefixNewline ? `\n${prefix}` : prefix;
      const suf = needSuffixNewline ? `${suffix}\n` : suffix;

      let insertion = '';
      let cursorOffset = pre.length;
      let selectionLen = 0;

      if (selected) {
        insertion = `${pre}${selected}${suf}`;
        selectionLen = selected.length;
      } else {
        insertion = `${pre}${defaultText}${suf}`;
        selectionLen = defaultText.length;
      }

      const newContent = content.slice(0, start) + insertion + content.slice(end);
      setContent(newContent);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + cursorOffset, start + cursorOffset + selectionLen);
      }, 0);
      return;
    }

    // Inline formatting: supports smart toggle, nesting, and consecutive formatting applications
    if (!selected) {
      if (hasDelimBefore(content, start, prefix) && hasDelimAfter(content, end, suffix)) {
        const newContent = content.slice(0, start - prefix.length) + content.slice(end + suffix.length);
        const newPos = start - prefix.length;
        setContent(newContent);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newPos, newPos);
        }, 0);
        return;
      }

      const insertion = `${prefix}${defaultText}${suffix}`;
      const newContent = content.slice(0, start) + insertion + content.slice(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + defaultText.length);
      }, 0);
      return;
    }

    // If selected text itself is wrapped in prefix & suffix -> toggle off (unwrap)
    const isSelfWrapped =
      selected.length >= prefix.length + suffix.length &&
      selected.startsWith(prefix) &&
      selected.endsWith(suffix) &&
      (prefix !== '*' || (selected.startsWith('***') || !selected.startsWith('**')));

    if (isSelfWrapped) {
      const unwrapped = selected.slice(prefix.length, selected.length - suffix.length);
      const newContent = content.slice(0, start) + unwrapped + content.slice(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + unwrapped.length);
      }, 0);
      return;
    }

    // If selection is immediately surrounded by prefix and suffix -> toggle off (remove outer)
    if (hasDelimBefore(content, start, prefix) && hasDelimAfter(content, end, suffix)) {
      const newContent = content.slice(0, start - prefix.length) + selected + content.slice(end + suffix.length);
      const newStart = start - prefix.length;
      const newEnd = newStart + selected.length;
      setContent(newContent);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newStart, newEnd);
      }, 0);
      return;
    }

    // Otherwise wrap selection and retain selection on the text
    const insertion = `${prefix}${selected}${suffix}`;
    const newContent = content.slice(0, start) + insertion + content.slice(end);
    const newStart = start + prefix.length;
    const newEnd = newStart + selected.length;
    setContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
    }, 0);
  };

  const uploadAndInsertImages = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploading(true);
    try {
      const res = await uploadFiles(imageFiles);
      if (res.data && res.data.length > 0) {
        setAttachments(prev => [...prev, ...res.data]);

        let markdownImages = '';
        res.data.forEach((att: any, idx: number) => {
          const name = imageFiles[idx]?.name || att.filename || 'Изображение';
          markdownImages += `\n![${name}](${att.url})\n`;
        });

        insertAtCursor(markdownImages);
      }
    } catch (err: any) {
      if (!err?.canceled) {
        console.error('Ошибка загрузки изображения', err);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadAndInsertImages(Array.from(e.target.files));
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    const imageItems = items.filter(it => it.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      const files: File[] = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length > 0) {
        await uploadAndInsertImages(files);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadAndInsertImages(Array.from(e.dataTransfer.files));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter or Cmd+Enter to send
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Ctrl+B / Cmd+B -> Bold
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И')) {
      e.preventDefault();
      applyFormat('**', '**', 'жирный текст');
      return;
    }

    // Ctrl+I / Cmd+I -> Italic
    if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш')) {
      e.preventDefault();
      applyFormat('*', '*', 'курсив');
      return;
    }

    // Ctrl+U / Cmd+U -> Underline
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U' || e.key === 'г' || e.key === 'Г')) {
      e.preventDefault();
      applyFormat('__', '__', 'подчёркнутый');
      return;
    }

    // Ctrl+Shift+S / Ctrl+Shift+X -> Strikethrough
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы' || e.key === 'x' || e.key === 'X' || e.key === 'ч' || e.key === 'Ч')) {
      e.preventDefault();
      applyFormat('~~', '~~', 'зачёркнутый');
      return;
    }

    // Ctrl+K -> Link
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) {
      e.preventDefault();
      applyFormat('[', '](https://example.com)', 'текст ссылки');
      return;
    }

    // Tab key: insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.slice(0, start) + '  ' + content.slice(end);
      setContent(newContent);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const tableTemplate =
    `| Заголовок 1 | Заголовок 2 | Заголовок 3 |\n` +
    `| :--- | :---: | ---: |\n` +
    `| Данные 1 | Данные 2 | Данные 3 |\n` +
    `| Данные 4 | Данные 5 | Данные 6 |`;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      size="md"
      className="article-editor-modal"
      title={isEditing ? 'Редактировать статью' : 'Написать статью'}
      footer={
        <>
          <div className="article-editor__footer-info">
            <span className="article-editor__hint">
              <span className="article-editor__badge">Ctrl + Enter</span> для отправки
            </span>
            <span>{content.length} симв.</span>
          </div>
          <div className="article-editor__footer-actions">
            <button
              type="button"
              className="zv-btn zv-btn--ghost"
              onClick={handleClose}
            >
              Отмена
            </button>
            <button
              type="button"
              className="zv-btn zv-btn--primary"
              onClick={handleSubmit}
              disabled={!content.trim() || uploading}
            >
              {isEditing ? 'Сохранить' : 'Отправить'}
            </button>
          </div>
        </>
      }
      footerAlign="between"
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        multiple
      />

      <div className="article-editor__tabs">
        <button
          type="button"
          className={`article-editor__tab ${activeTab === 'edit' ? 'active' : ''}`}
          onClick={() => setActiveTab('edit')}
        >
          Редактор
        </button>
        <button
          type="button"
          className={`article-editor__tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Предпросмотр
        </button>
      </div>

      {activeTab === 'edit' && (
        <>
          <div className="article-editor__toolbar">
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('# ', '', 'Заголовок 1', true)}
              title="Заголовок H1"
            >
              H1
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('## ', '', 'Заголовок 2', true)}
              title="Заголовок H2"
            >
              H2
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('### ', '', 'Заголовок 3', true)}
              title="Заголовок H3"
            >
              H3
            </button>

            <span className="article-editor__divider" />

            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('**', '**', 'жирный текст')}
              title="Жирный (**текст**) [Ctrl+B]"
              style={{ fontWeight: 700 }}
            >
              B
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('*', '*', 'курсив')}
              title="Курсив (*текст*) [Ctrl+I]"
              style={{ fontStyle: 'italic' }}
            >
              I
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('__', '__', 'подчёркнутый')}
              title="Подчёркнутый (__текст__) [Ctrl+U]"
              style={{ textDecoration: 'underline' }}
            >
              U
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('~~', '~~', 'зачёркнутый')}
              title="Зачёркнутый (~~текст~~) [Ctrl+Shift+S]"
              style={{ textDecoration: 'line-through' }}
            >
              S
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('||', '||', 'секретный спойлер')}
              title="Спойлер (||текст||)"
            >
              ||
            </button>

            <span className="article-editor__divider" />

            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('> ', '', 'Цитата', true)}
              title="Цитата (> текст)"
            >
              ”
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('`', '`', 'код')}
              title="Встроенный код (`код`)"
            >
              &lt;&gt;
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('```ts\n', '\n```', 'console.log("hello");', true)}
              title="Блок кода (```)"
            >
              {'{ }'}
            </button>

            <span className="article-editor__divider" />

            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('[', '](https://example.com)', 'Текст ссылки')}
              title="Ссылка [текст](url) [Ctrl+K]"
            >
              🔗
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              title="Загрузить картинку (или вставьте через Ctrl+V)"
            >
              🖼️
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat(tableTemplate, '', '', true)}
              title="Таблица"
            >
              📊
            </button>

            <span className="article-editor__divider" />

            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('- ', '', 'Пункт списка', true)}
              title="Маркированный список (- )"
            >
              •
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('1. ', '', 'Первый пункт', true)}
              title="Нумерованный список (1. )"
            >
              1.
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('- [ ] ', '', 'Новая задача', true)}
              title="Чеклист (- [ ] )"
            >
              ☑
            </button>
            <button
              type="button"
              className="article-editor__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat('---\n', '', '', true)}
              title="Разделитель (---)"
            >
              —
            </button>

            {uploading && (
              <span className="article-editor__uploading-badge">
                Загрузка картинки...
              </span>
            )}
          </div>

          <div className="article-editor__textarea-wrap">
            <textarea
              ref={textareaRef}
              className={`article-editor__textarea ${isDragging ? 'is-dragging' : ''}`}
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              placeholder=""
            />
          </div>
        </>
      )}

      {activeTab === 'preview' && (
        <div className="article-editor__preview">
          {content.trim() ? (
            <MarkdownContent
              content={content}
              server={server}
              mentions={mentions}
              forceArticle={true}
            />
          ) : (
            <div className="article-editor__preview-empty">
              <span>Текст статьи пока пуст</span>
              <span>Перейдите на вкладку «Редактор» и начните писать!</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ArticleEditorModal;
