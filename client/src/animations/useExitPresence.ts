import { useEffect } from 'react';
import { usePresence } from 'framer-motion';

/*
 * Модалка внутри AnimatePresence родителя (оверлеи Main, смена разделов).
 * Когда родитель её снимает, открытая модалка проигрывает своё закрытие, а
 * закрытая отпускает родителя сразу.
 *
 * <AnimatePresence propagate> тут не годится: закрытая модалка (пустой
 * вложенный AnimatePresence) регистрировалась у родителя и так и не сообщала
 * о завершении выхода. Смена раздела в Main (mode="wait") ждала её вечно —
 * личные сообщения и витрина оставались пустыми.
 */
export function useExitPresence(isOpen: boolean) {
  const [isPresent, safeToRemove] = usePresence();
  useEffect(() => {
    if (!isPresent && !isOpen) safeToRemove?.();
  }, [isPresent, isOpen, safeToRemove]);
  return {
    open: isOpen && isPresent,
    onExitComplete: () => { if (!isPresent) safeToRemove?.(); },
  };
}
