import React, { useState } from 'react';
import { FolderPlus, Trash2 } from 'lucide-react';
import { Server } from '../types';
import { ServerFolder } from '../utils/serverFolders';
import Modal from './Modal';
import UserAvatar from './UserAvatar';
import './ServerFolders.css';

interface Props {
  folders: ServerFolder[];
  servers: Server[];
  initialServerId?: string;
  initialFolderId?: string;
  synced: boolean;
  onClose: () => void;
  onSave: (folders: ServerFolder[]) => Promise<void>;
}

const ServerFolderManager: React.FC<Props> = ({ folders, servers, initialServerId, initialFolderId, synced, onClose, onSave }) => {
  const [draft, setDraft] = useState<ServerFolder[]>(() => folders.map(f => ({ ...f, serverIds: [...f.serverIds] })));
  const [selectedId, setSelectedId] = useState<string | null>(() => initialFolderId || folders.find(f => f.serverIds.includes(initialServerId || ''))?.id || folders[0]?.id || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = draft.find(f => f.id === selectedId);
  const change = (patch: Partial<ServerFolder>) => setDraft(previous => previous.map(f => f.id === selectedId ? { ...f, ...patch } : f));
  const create = () => {
    const id = crypto.randomUUID();
    setDraft(previous => [...previous.map(f => initialServerId ? { ...f, serverIds: f.serverIds.filter(s => s !== initialServerId) } : f), {
      id, name: 'Новая папка', serverIds: initialServerId ? [initialServerId] : [], isolated: false,
    }]);
    setSelectedId(id);
  };
  const save = async () => {
    if (draft.some(f => !f.name.trim())) { setError('Укажите название каждой папки.'); return; }
    setBusy(true); setError('');
    try { await onSave(draft); onClose(); }
    catch { setError('Не удалось сохранить папки. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  return <Modal open onClose={() => { if (!busy) onClose(); }} title="Папки серверов" subtitle="Соберите серверы по темам и переключайтесь между ними." size="lg"
    footer={<><button className="zv-btn zv-btn--ghost" onClick={onClose} disabled={busy}>Отмена</button><button className="zv-btn zv-btn--primary" onClick={save} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button></>}>
    <div className="server-folder-manager">
      <p className="server-folder-manager__hint">{synced ? 'Папки сохраняются в вашем аккаунте.' : 'Папки сохраняются на этом устройстве для вашего аккаунта.'}</p>
      <div className="server-folder-manager__tabs" role="group" aria-label="Папки">
        {draft.map(f => <button key={f.id} className={f.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(f.id)} disabled={busy}>{f.name || 'Без названия'} <span>{f.serverIds.filter(id => servers.some(s => s._id === id)).length}</span></button>)}
        <button onClick={create} disabled={busy || draft.length >= 50}><FolderPlus size={16} /> Новая папка</button>
      </div>
      {selected ? <fieldset disabled={busy} className="server-folder-manager__editor">
        <label className="server-folder-manager__name">Название<input maxLength={40} value={selected.name} onChange={e => change({ name: e.target.value })} /></label>
        <label className="server-folder-manager__isolation"><input type="checkbox" checked={selected.isolated} onChange={e => change({ isolated: e.target.checked })} /><span>Показывать только эту папку<small>При раскрытии остальные серверы и папки скрываются. Кнопка «Все серверы» возвращает общий список.</small></span></label>
        <p className="server-folder-manager__hint">Серверы в папке · {selected.serverIds.filter(id => servers.some(s => s._id === id)).length}</p>
        <div className="server-folder-manager__servers">
          {servers.map(server => {
            const other = draft.find(f => f.id !== selectedId && f.serverIds.includes(server._id));
            return <label key={server._id}><input type="checkbox" checked={selected.serverIds.includes(server._id)} onChange={e => {
              const checked = e.target.checked;
              setDraft(previous => previous.map(f => ({ ...f, serverIds: f.id === selectedId && checked ? [...f.serverIds.filter(id => id !== server._id), server._id] : f.serverIds.filter(id => id !== server._id) })));
            }} /><UserAvatar user={{ username: server.name, avatar: server.icon }} size={32} /><span>{server.name}{other && <small>Сейчас в папке «{other.name}» — будет перенесён сюда</small>}</span></label>;
          })}
          {!servers.length && <p>Вы пока не состоите в серверах.</p>}
        </div>
        <button className="server-folder-manager__delete" onClick={() => { setDraft(previous => previous.filter(f => f.id !== selectedId)); setSelectedId(draft.find(f => f.id !== selectedId)?.id || null); }}><Trash2 size={16} /> Удалить папку</button>
        <small className="server-folder-manager__hint">Серверы из удалённой папки останутся в общем списке.</small>
      </fieldset> : <div className="server-folder-manager__empty"><FolderPlus size={32} /><p>Создайте папку и выберите серверы для неё.</p><button className="zv-btn zv-btn--primary" onClick={create} disabled={busy}>Создать папку</button></div>}
      {error && <p role="alert" className="server-folder-manager__error">{error}</p>}
    </div>
  </Modal>;
};

export default ServerFolderManager;
