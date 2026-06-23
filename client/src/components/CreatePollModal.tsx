import React, { useState } from 'react';
import Modal from './Modal';
import { ChatPoll } from './MessagePoll';
import './CreatePollModal.css';

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (poll: ChatPoll) => void;
}

const CreatePollModal: React.FC<CreatePollModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [allowCustom, setAllowCustom] = useState(false);

  const reset = () => {
    setQuestion(''); setOptions(['', '']); setMultiple(false); setAllowCustom(false);
  };

  const close = () => { reset(); onClose(); };

  const setOption = (i: number, v: string) => setOptions(prev => prev.map((o, idx) => idx === i ? v : o));
  const addOption = () => setOptions(prev => prev.length >= 20 ? prev : [...prev, '']);
  const removeOption = (i: number) => setOptions(prev => prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i));

  const valid = question.trim().length > 0 && options.filter(o => o.trim()).length >= 2;

  const submit = () => {
    if (!valid) return;
    onCreate({
      question: question.trim(),
      multiple,
      allowCustom,
      options: options.filter(o => o.trim()).map(o => ({ id: '', text: o.trim() })),
    });
    reset();
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={close}
      title="Создать опрос"
      size="md"
      className="create-poll-modal"
      footer={
        <>
          <button className="zv-btn zv-btn--ghost" onClick={close}>Отмена</button>
          <button className="zv-btn zv-btn--primary" onClick={submit} disabled={!valid}>Создать</button>
        </>
      }
    >
      <div className="create-poll">
        <label className="create-poll__label">Вопрос</label>
        <input
          className="create-poll__input"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Что спросить?"
          maxLength={300}
          autoFocus
        />

        <label className="create-poll__label">Варианты</label>
        <div className="create-poll__options">
          {options.map((opt, i) => (
            <div key={i} className="create-poll__option-row">
              <input
                className="create-poll__input"
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                placeholder={`Вариант ${i + 1}`}
                maxLength={120}
              />
              {options.length > 2 && (
                <button type="button" className="create-poll__remove" onClick={() => removeOption(i)} aria-label="Удалить">×</button>
              )}
            </div>
          ))}
        </div>
        {options.length < 20 && (
          <button type="button" className="create-poll__add" onClick={addOption}>+ Вариант</button>
        )}

        <label className="create-poll__check">
          <input type="checkbox" checked={multiple} onChange={e => setMultiple(e.target.checked)} /> Можно выбрать несколько
        </label>
        <label className="create-poll__check">
          <input type="checkbox" checked={allowCustom} onChange={e => setAllowCustom(e.target.checked)} /> Разрешить свой вариант ответа
        </label>
      </div>
    </Modal>
  );
};

export default CreatePollModal;
