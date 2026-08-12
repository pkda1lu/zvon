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
  initialUnreadCount?: number;
  interfaceScale?: number;
  className?: string;
  style?: React.CSSProperties;
  onAtBottomStateChange?: (atBottom: boolean) => void;
}

const INITIAL_FIRST_ITEM_INDEX = 100000;

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
    initialUnreadCount = 0,
    className = '',
    style = {},
    onAtBottomStateChange,
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
  }, [chatId, items, getItemKey]);

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

  const initialTopMostItemIndex = useMemo(() => {
    if (items.length === 0) return 0;
    const targetIdx =
      initialUnreadCount > 0
        ? Math.max(0, items.length - initialUnreadCount)
        : Math.max(0, items.length - 1);
    return {
      index: targetIdx,
      align: 'end' as const,
    };
  }, [initialUnreadCount, items.length]);

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
    },
    [onAtBottomStateChange]
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
      followOutput={followOutput}
      increaseViewportBy={{ top: 600, bottom: 600 }}
      skipAnimationFrameInResizeObserver={true}
    />
  );
}

export const ChatScrollEngine = forwardRef(ChatScrollEngineInner) as <T>(
  props: ChatScrollEngineProps<T> & { ref?: React.Ref<ChatScrollEngineHandle> }
) => React.ReactElement;
