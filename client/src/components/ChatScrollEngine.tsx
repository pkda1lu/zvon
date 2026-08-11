import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { ArrowDownIcon } from './Icons';

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

const AT_BOTTOM_THRESHOLD = 120;

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
    interfaceScale = 1,
    className = '',
    style = {},
    onAtBottomStateChange,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isAtBottomRef = useRef(true);
  const justSentRef = useRef(false);

  // Pagination / Prepend tracking state
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const prevItemsLengthRef = useRef<number>(items.length);
  const prevFirstKeyRef = useRef<string | null>(items[0] ? getItemKey(items[0], 0) : null);
  const prevLastKeyRef = useRef<string | null>(
    items[items.length - 1] ? getItemKey(items[items.length - 1], items.length - 1) : null
  );

  const isInitialScrollDoneRef = useRef(false);
  const isPrependingRef = useRef(false);

  // Helper to scroll strictly to the bottom of the container
  const scrollToBottom = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    setShowScrollBottom(false);
    isAtBottomRef.current = true;
    onAtBottomStateChange?.(true);

    const targetTop = el.scrollHeight - el.clientHeight;
    el.scrollTo({
      top: Math.max(0, targetTop),
      behavior: smooth ? 'smooth' : 'auto',
    });

    // Double check after scroll/layout settle
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight - containerRef.current.clientHeight;
      }
    });
  }, [onAtBottomStateChange]);

  // Imperative handle for parent components
  useImperativeHandle(ref, () => ({
    scrollToBottom,
    scrollToMessage: (messageId: string) => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el && containerRef.current) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('highlight-flash');
        setTimeout(() => el.classList.remove('highlight-flash'), 2000);
      }
    },
    scrollBy: ({ top, behavior = 'smooth' }) => {
      if (containerRef.current) {
        containerRef.current.scrollBy({ top, behavior });
      }
    },
    getScrollerElement: () => containerRef.current,
    setJustSent: () => {
      justSentRef.current = true;
    },
  }), [scrollToBottom]);

  // Reset scroll state on channel switch
  useEffect(() => {
    isInitialScrollDoneRef.current = false;
    isAtBottomRef.current = true;
    justSentRef.current = false;
    setShowScrollBottom(false);
    prevFirstKeyRef.current = items[0] ? getItemKey(items[0], 0) : null;
    prevLastKeyRef.current = items[items.length - 1] ? getItemKey(items[items.length - 1], items.length - 1) : null;
    prevItemsLengthRef.current = items.length;

    // Scroll to bottom or to unread marker on channel load
    const timer = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight - containerRef.current.clientHeight;
        isInitialScrollDoneRef.current = true;
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [chatId]);

  // Scroll listener to update isAtBottom state & trigger onLoadMore
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isBottom = distanceToBottom <= AT_BOTTOM_THRESHOLD;

    if (isAtBottomRef.current !== isBottom) {
      isAtBottomRef.current = isBottom;
      onAtBottomStateChange?.(isBottom);
    }

    if (isBottom && showScrollBottom) {
      setShowScrollBottom(false);
    } else if (!isBottom && !showScrollBottom && distanceToBottom > 250) {
      setShowScrollBottom(true);
    }

    // Check if scrolled near top to load more history
    if (el.scrollTop <= 150 && hasMore && !isLoadingMore && onLoadMore && isInitialScrollDoneRef.current) {
      prevScrollHeightRef.current = el.scrollHeight;
      prevScrollTopRef.current = el.scrollTop;
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore, onAtBottomStateChange, showScrollBottom]);

  // LayoutEffect to handle prepending history (scroll restoration) & appending new messages
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || items.length === 0) return;

    const currentFirstKey = getItemKey(items[0], 0);
    const currentLastKey = getItemKey(items[items.length - 1], items.length - 1);

    const isPrepend =
      prevFirstKeyRef.current !== null &&
      currentFirstKey !== prevFirstKeyRef.current &&
      items.length > prevItemsLengthRef.current;

    const isAppend =
      prevLastKeyRef.current !== null &&
      currentLastKey !== prevLastKeyRef.current &&
      items.length > prevItemsLengthRef.current;

    if (isPrepend) {
      isPrependingRef.current = true;
      const targetMessageId = (containerRef.current as any)?.dataset?.flashId;
      const isTargetInDom = targetMessageId && document.getElementById(`msg-${targetMessageId}`);
      
      if (!isTargetInDom) {
        const heightDiff = el.scrollHeight - prevScrollHeightRef.current;
        el.scrollTop = prevScrollTopRef.current + heightDiff;
      }
      requestAnimationFrame(() => {
        isPrependingRef.current = false;
      });
    } else if (isAppend) {
      const wasJustSent = justSentRef.current;
      justSentRef.current = false;

      if (wasJustSent || isAtBottomRef.current) {
        scrollToBottom(true);
      } else {
        setShowScrollBottom(true);
      }
    } else if (!isInitialScrollDoneRef.current) {
      el.scrollTop = el.scrollHeight - el.clientHeight;
      isInitialScrollDoneRef.current = true;
    }

    prevFirstKeyRef.current = currentFirstKey;
    prevLastKeyRef.current = currentLastKey;
    prevItemsLengthRef.current = items.length;
  }, [items, getItemKey, scrollToBottom]);

  // ResizeObserver to automatically adjust scroll position when images/media load
  useEffect(() => {
    const el = containerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    let lastHeight = content.scrollHeight;

    const observer = new ResizeObserver(() => {
      if (isPrependingRef.current) return;

      const newHeight = content.scrollHeight;
      if (newHeight !== lastHeight) {
        lastHeight = newHeight;
        // If user was at bottom, auto scroll down as images/embeds load
        if (isAtBottomRef.current) {
          el.scrollTop = el.scrollHeight - el.clientHeight;
        }
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`chat-scroll-engine custom-scrollbar ${className}`}
      style={{
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
        height: '100%',
        width: '100%',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      <div ref={contentRef} className="chat-scroll-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {header}
        {items.map((item, idx) => renderItem(item, idx, idx > 0 ? items[idx - 1] : undefined))}
        {footer}
      </div>
    </div>
  );
}

export const ChatScrollEngine = forwardRef(ChatScrollEngineInner) as <T>(
  props: ChatScrollEngineProps<T> & { ref?: React.Ref<ChatScrollEngineHandle> }
) => React.ReactElement;

