import React, {
  useRef,
  useLayoutEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useEffect,
} from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

export interface ChatScrollEngineHandle {
  scrollToBottom: (smooth?: boolean) => void;
  scrollToMessage: (messageId: string) => void;
  scrollBy: (options: { top: number; behavior?: 'smooth' | 'auto' }) => void;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
  getScrollerElement: () => HTMLElement | null;
  setJustSent: () => void;
}

export interface ChatScrollEngineProps<T> {
  chatId: string;
  items: T[];
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number, prevItem?: T) => React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** Индекс первого непрочитанного: лента откроется на нём. -1 — нет. */
  unreadAnchorIndex?: number;
  interfaceScale?: number;
  className?: string;
  style?: React.CSSProperties;
  onAtBottomStateChange?: (atBottom: boolean) => void;
  /** Видимый диапазон ленты (индексы в items). */
  onRangeChanged?: (startIndex: number, endIndex: number) => void;
}

/*
 * Где человек был в каждом чате за эту сессию. Лента пересоздаётся при смене
 * чата и раньше всегда открывалась в самом низу — вернувшись в канал, где
 * читал историю, приходилось листать к тому месту заново.
 */
const savedPositions = new Map<string, { key: string | null; atBottom: boolean }>();

const INITIAL_FIRST_ITEM_INDEX = 100000;
// Сколько после открытия чата ещё можно перенести ленту к первому
// непрочитанному: позже человек уже читает, и прыжок бы ему мешал.
const ANCHOR_LATE_WINDOW = 3000;

interface VirtuosoContext {
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

const StableHeader: React.FC<{ context?: VirtuosoContext }> = React.memo(({ context }) => {
  if (!context?.header) return null;
  return <div className="chat-scroll-header">{context.header}</div>;
});

const StableFooter: React.FC<{ context?: VirtuosoContext }> = React.memo(({ context }) => {
  if (!context?.footer) return null;
  return <div className="chat-scroll-footer">{context.footer}</div>;
});

const VIRTUOSO_COMPONENTS = {
  Header: StableHeader,
  Footer: StableFooter,
};

function ChatScrollEngineInner<T>(
  props: ChatScrollEngineProps<T>,
  ref: React.Ref<ChatScrollEngineHandle>
) {
  const {
    chatId,
    items,
    getItemKey,
    renderItem,
    header,
    footer,
    hasMore = false,
    isLoadingMore = false,
    onLoadMore,
    unreadAnchorIndex = -1,
    className = '',
    style = {},
    onAtBottomStateChange,
    onRangeChanged,
  } = props;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);

  const isAtBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const isFetchingMoreRef = useRef(false);

  useEffect(() => {
    if (!isLoadingMore) {
      isFetchingMoreRef.current = false;
    }
  }, [isLoadingMore]);

  // Maintain a stable firstItemIndex base that ONLY changes when older items are prepended
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_FIRST_ITEM_INDEX);
  const firstItemIndexRef = useRef(firstItemIndex);
  firstItemIndexRef.current = firstItemIndex;

  const prevChatIdRef = useRef(chatId);
  const prevFirstKeyRef = useRef<string | null>(items[0] ? getItemKey(items[0], 0) : null);
  const prevItemsLengthRef = useRef<number>(items.length);

  // Synchronize firstItemIndex only on channel switch or history prepend
  useLayoutEffect(() => {
    // Channel switch: reset base index
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      prevItemsLengthRef.current = items.length;
      prevFirstKeyRef.current = items[0] ? getItemKey(items[0], 0) : null;
      setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
      isAtBottomRef.current = true;
      onAtBottomStateChange?.(true);
      return;
    }

    // Prepend check: older history prepended at top of list
    if (items.length > prevItemsLengthRef.current) {
      const currentFirstKey = items[0] ? getItemKey(items[0], 0) : null;
      const isPrepend =
        prevFirstKeyRef.current !== null && currentFirstKey !== prevFirstKeyRef.current;

      if (isPrepend) {
        const diff = items.length - prevItemsLengthRef.current;
        setFirstItemIndex((prev) => prev - diff);
      }
    }

    prevItemsLengthRef.current = items.length;
    prevFirstKeyRef.current = items[0] ? getItemKey(items[0], 0) : null;

    // Check if content height is less than container height
    requestAnimationFrame(() => {
      if (scrollerRef.current) {
        const { scrollHeight, clientHeight } = scrollerRef.current;
        if (scrollHeight <= clientHeight + 10) {
          isAtBottomRef.current = true;
          onAtBottomStateChange?.(true);
        }
      }
    });
  }, [chatId, items, getItemKey, onAtBottomStateChange]);

  // Imperative handle for parent components
  const scrollToBottom = useCallback(
    (smooth = true) => {
      isAtBottomRef.current = true;
      onAtBottomStateChange?.(true);

      if (items.length > 0 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index: items.length - 1,
          align: 'end',
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    },
    [items.length, onAtBottomStateChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
      scrollToMessage: (messageId: string) => {
        const arrayIndex = items.findIndex((item, i) => getItemKey(item, i) === messageId);
        if (arrayIndex !== -1 && virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({
            index: arrayIndex,
            align: 'center',
            behavior: 'smooth',
          });

          // Wait for virtuoso to render target item in DOM, then apply highlight flash
          setTimeout(() => {
            const el = document.getElementById(`msg-${messageId}`);
            if (el) {
              el.classList.add('highlight-flash');
              setTimeout(() => el.classList.remove('highlight-flash'), 2000);
            }
          }, 200);
        }
      },
      scrollToIndex: (index: number, align: 'start' | 'center' | 'end' = 'start') => {
        if (index < 0 || index >= items.length || !virtuosoRef.current) return;
        virtuosoRef.current.scrollToIndex({ index, align, behavior: 'smooth' });
      },
      scrollBy: ({ top, behavior = 'smooth' }) => {
        if (scrollerRef.current) {
          scrollerRef.current.scrollBy({ top, behavior });
        }
      },
      getScrollerElement: () => scrollerRef.current as HTMLElement | null,
      setJustSent: () => {
        justSentRef.current = true;
      },
    }),
    [items, getItemKey, scrollToBottom]
  );

  // Откуда открыть ленту: с первого непрочитанного, иначе там, где человек
  // остановился в прошлый раз, иначе снизу. Считаем один раз на чат —
  // Virtuoso всё равно читает это только при создании.
  const initialPlacementRef = useRef<{ chatId: string; value: any } | null>(null);
  const anchorAppliedRef = useRef<{ chatId: string; at: number; done: boolean } | null>(null);
  if (items.length > 0 && initialPlacementRef.current?.chatId !== chatId) {
    let value: any = { index: items.length - 1, align: 'end' as const };
    if (unreadAnchorIndex >= 0 && unreadAnchorIndex < items.length) {
      value = { index: unreadAnchorIndex, align: 'start' as const, offset: -48 };
    } else {
      const saved = savedPositions.get(chatId);
      if (saved && !saved.atBottom && saved.key) {
        const idx = items.findIndex((item, i) => getItemKey(item, i) === saved.key);
        if (idx !== -1) value = { index: idx, align: 'start' as const };
      }
    }
    initialPlacementRef.current = { chatId, value };
    anchorAppliedRef.current = {
      chatId,
      at: Date.now(),
      done: unreadAnchorIndex >= 0 && unreadAnchorIndex < items.length,
    };
  }
  const initialTopMostItemIndex = initialPlacementRef.current?.value ?? 0;

  // Лента часто открывается из кэша, где новых сообщений ещё нет, и первое
  // непрочитанное находится, только когда приедет ответ сервера. Если это
  // случилось сразу после открытия — переносим ленту к нему и теперь.
  useEffect(() => {
    const state = anchorAppliedRef.current;
    if (!state || state.chatId !== chatId || state.done) return;
    if (unreadAnchorIndex < 0 || unreadAnchorIndex >= items.length) return;
    state.done = true;
    if (Date.now() - state.at > ANCHOR_LATE_WINDOW) return;
    virtuosoRef.current?.scrollToIndex({ index: unreadAnchorIndex, align: 'start', offset: -48 });
  }, [chatId, unreadAnchorIndex, items.length]);

  const virtuosoContext = useMemo<VirtuosoContext>(
    () => ({ header, footer }),
    [header, footer]
  );

  const handleStartReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !isFetchingMoreRef.current && onLoadMore) {
      isFetchingMoreRef.current = true;
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const handleAtBottomStateChange = useCallback(
    (atBottom: boolean) => {
      isAtBottomRef.current = atBottom;
      onAtBottomStateChange?.(atBottom);
      const saved = savedPositions.get(chatId);
      savedPositions.set(chatId, { key: saved?.key ?? null, atBottom });
    },
    [onAtBottomStateChange, chatId]
  );

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      const start = range.startIndex - firstItemIndexRef.current;
      const end = range.endIndex - firstItemIndexRef.current;
      const list = itemsRef.current;
      const first = list[Math.max(0, start)];
      if (first) {
        savedPositions.set(chatId, {
          key: getItemKey(first, Math.max(0, start)),
          atBottom: isAtBottomRef.current,
        });
      }
      onRangeChanged?.(start, end);
    },
    [chatId, getItemKey, onRangeChanged]
  );

  const followOutput = useCallback(
    (isAtBottom: boolean) => {
      if (justSentRef.current) {
        justSentRef.current = false;
        return 'smooth';
      }
      return isAtBottom ? 'smooth' : false;
    },
    []
  );

  if (items.length === 0) {
    return (
      <div
        className={`chat-scroll-engine custom-scrollbar ${className}`}
        style={{
          position: 'relative',
          height: '100%',
          width: '100%',
          overflowY: 'auto',
          ...style,
        }}
      >
        {header}
        {footer}
      </div>
    );
  }

  return (
    <Virtuoso
      key={chatId}
      ref={virtuosoRef}
      scrollerRef={(el) => {
        scrollerRef.current = el as HTMLElement;
      }}
      className={`chat-scroll-engine custom-scrollbar ${className}`}
      style={{
        height: '100%',
        width: '100%',
        ...style,
      }}
      data={items}
      context={virtuosoContext}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={initialTopMostItemIndex}
      defaultItemHeight={85}
      computeItemKey={(index, item) => {
        const arrayIndex = index - firstItemIndex;
        return getItemKey(item, arrayIndex >= 0 ? arrayIndex : 0);
      }}
      itemContent={(index, item) => {
        const arrayIndex = index - firstItemIndex;
        const prevItem = arrayIndex > 0 ? items[arrayIndex - 1] : undefined;
        return renderItem(item, arrayIndex, prevItem);
      }}
      components={VIRTUOSO_COMPONENTS}
      startReached={handleStartReached}
      atBottomStateChange={handleAtBottomStateChange}
      rangeChanged={handleRangeChanged}
      atBottomThreshold={60}
      onScroll={(e) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        // If content fits within viewport without scroll, or user is at bottom
        const canScroll = target.scrollHeight > target.clientHeight + 10;
        const isBottom = !canScroll || (target.scrollHeight - target.scrollTop - target.clientHeight <= 80);
        if (isAtBottomRef.current !== isBottom) {
          isAtBottomRef.current = isBottom;
          onAtBottomStateChange?.(isBottom);
        }
      }}
      followOutput={followOutput}
      increaseViewportBy={{ top: 600, bottom: 600 }}
      skipAnimationFrameInResizeObserver={true}
    />
  );
}

export const ChatScrollEngine = forwardRef(ChatScrollEngineInner) as <T>(
  props: ChatScrollEngineProps<T> & { ref?: React.Ref<ChatScrollEngineHandle> }
) => React.ReactElement;
