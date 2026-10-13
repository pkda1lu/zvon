import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { Message } from '../types';
import { getComposerExtras, getDraft, setComposerExtras, setDraft } from './drafts';

interface ComposerState {
  message: string;
  setMessage: (v: string) => void;
  replyTo: Message | null;
  setReplyTo: (v: Message | null) => void;
  attachments: any[];
  setAttachments: (v: any[]) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

/*
 * Подключает поле ввода к черновикам (utils/drafts): при уходе из чата
 * сохраняет текст, ответ и вложения, при входе — достаёт их обратно.
 */
export function useComposerDraft(chatId: string, state: ComposerState) {
  const latest = useRef(state);
  latest.current = state;

  useLayoutEffect(() => {
    const { setMessage, setReplyTo, setAttachments, inputRef } = latest.current;
    const extras = getComposerExtras(chatId);
    setMessage(getDraft(chatId));
    setReplyTo(extras.replyTo);
    setAttachments(extras.attachments);
    // Высоту поля подгоняем под восстановленный текст после его отрисовки.
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = 'auto';
      if (el.value) el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.3 - 24)}px`;
    });
    return () => {
      cancelAnimationFrame(raf);
      // В latest ещё состояние уходящего чата: setMessage выше для нового
      // чата применится только следующим рендером.
      const s = latest.current;
      setDraft(chatId, s.message);
      setComposerExtras(chatId, { replyTo: s.replyTo, attachments: s.attachments });
    };
  }, [chatId]);

  // В рендере, где сменился чат, message ещё от прошлого чата — его не пишем,
  // иначе чужой текст лёг бы черновиком в новый чат. То же при первом
  // рендере: там message ещё пустой, а черновик только достаётся.
  const writtenForRef = useRef<string | null>(null);
  useEffect(() => {
    if (writtenForRef.current !== chatId) {
      writtenForRef.current = chatId;
      return;
    }
    setDraft(chatId, state.message);
  }, [chatId, state.message]);
}
