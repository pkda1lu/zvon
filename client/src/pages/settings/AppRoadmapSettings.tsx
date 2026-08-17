import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { 
    PlusIcon, 
    EditIcon, 
    TrashIcon, 
    ArrowUpIcon, 
    ArrowDownIcon, 
    CloseIcon,
    RoadmapIcon,
    LockIcon
} from '../../components/Icons';

export interface RoadmapItem {
    _id: string;
    idea: string;
    description?: string;
    targetDate?: string;
    priority?: 'regular' | 'major' | 'massive' | 'low' | 'medium' | 'high' | '';
    adminOnly?: boolean;
    order: number;
    createdAt?: string;
    updatedAt?: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
    massive: { label: 'Крупное обновление', className: 'p-massive' },
    high: { label: 'Крупное обновление', className: 'p-massive' },
    major: { label: 'Большое обновление', className: 'p-major' },
    medium: { label: 'Большое обновление', className: 'p-major' },
    regular: { label: 'Обычное обновление', className: 'p-regular' },
    low: { label: 'Обычное обновление', className: 'p-regular' }
};

const AppRoadmapSettings: React.FC = () => {
    const { user } = useAuth();
    const { confirm, alert } = useDialog();
    const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

    const [items, setItems] = useState<RoadmapItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

    // Modal state for Add/Edit
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
    const [modalIdea, setModalIdea] = useState<string>('');
    const [modalDescription, setModalDescription] = useState<string>('');
    const [modalTargetDate, setModalTargetDate] = useState<string>('');
    const [modalPriority, setModalPriority] = useState<string>('');
    const [modalAdminOnly, setModalAdminOnly] = useState<boolean>(false);
    const [modalSaving, setModalSaving] = useState<boolean>(false);
    const [modalError, setModalError] = useState<string>('');

    const fetchRoadmap = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/roadmap');
            if (res.data?.items && Array.isArray(res.data.items)) {
                setItems(res.data.items);
            } else {
                setItems([]);
            }
        } catch (error) {
            console.error('Failed to load roadmap:', error);
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoadmap();
    }, [isAdmin]);

    const openAddModal = () => {
        setEditingItem(null);
        setModalIdea('');
        setModalDescription('');
        setModalTargetDate('');
        setModalPriority('');
        setModalAdminOnly(false);
        setModalError('');
        setIsModalOpen(true);
    };

    const openEditModal = (item: RoadmapItem) => {
        setEditingItem(item);
        setModalIdea(item.idea);
        setModalDescription(item.description || '');
        setModalTargetDate(item.targetDate || '');
        setModalPriority(item.priority || '');
        setModalAdminOnly(Boolean(item.adminOnly));
        setModalError('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        if (modalSaving) return;
        setIsModalOpen(false);
        setEditingItem(null);
        setModalError('');
    };

    const handleSaveItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalIdea.trim()) {
            setModalError('Пожалуйста, введите идею');
            return;
        }

        setModalSaving(true);
        setModalError('');

        try {
            const payload = {
                idea: modalIdea.trim(),
                description: modalDescription.trim(),
                targetDate: modalTargetDate.trim(),
                priority: modalPriority,
                adminOnly: modalAdminOnly
            };

            if (editingItem) {
                const res = await axios.put(`/api/roadmap/${editingItem._id}`, payload);
                if (res.data?.success) {
                    setItems(prev => prev.map(item => item._id === editingItem._id ? res.data.item : item));
                    closeModal();
                }
            } else {
                const res = await axios.post('/api/roadmap', payload);
                if (res.data?.success) {
                    setItems(prev => [...prev, res.data.item]);
                    closeModal();
                }
            }
        } catch (err: any) {
            console.error('Error saving roadmap item:', err);
            setModalError(err.response?.data?.message || 'Ошибка при сохранении идеи');
        } finally {
            setModalSaving(false);
        }
    };

    const handleDeleteItem = async (item: RoadmapItem) => {
        const ok = await confirm(`Удалить этап "${item.idea}"?`);
        if (!ok) return;

        try {
            const res = await axios.delete(`/api/roadmap/${item._id}`);
            if (res.data?.success) {
                setItems(prev => prev.filter(i => i._id !== item._id));
            }
        } catch (err: any) {
            console.error('Error deleting roadmap item:', err);
            await alert(err.response?.data?.message || 'Не удалось удалить этап');
        }
    };

    const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= items.length) return;

        const newItems = [...items];
        const temp = newItems[index];
        newItems[index] = newItems[targetIndex];
        newItems[targetIndex] = temp;

        const orderedItems = newItems.map((item, idx) => ({ ...item, order: idx }));
        setItems(orderedItems);

        try {
            await axios.put('/api/roadmap/reorder', {
                orderedIds: orderedItems.map(i => i._id)
            });
        } catch (err) {
            console.error('Failed to sync reorder with server:', err);
            fetchRoadmap();
        }
    };

    // Filter items if standard user view
    const visibleItems = isAdmin ? items : items.filter(i => !i.adminOnly);

    return (
        <div className="settings-content-inner roadmap-wrapper">
            <div className="roadmap-page-header">
                <div>
                    <h2 className="settings-page-title">План разработки</h2>
                    <p className="settings-description">
                        Дорожная карта развития проекта и запланированные идеи.
                    </p>
                </div>
                {isAdmin && (
                    <button 
                        className="settings-btn primary roadmap-top-add-btn" 
                        onClick={openAddModal}
                    >
                        <PlusIcon size={16} color="#fff" />
                        <span>Добавить идею</span>
                    </button>
                )}
            </div>

            {loading ? (
                <div className="roadmap-v-loading">
                    <div className="loading-spinner-rings"><div></div><div></div><div></div><div></div></div>
                </div>
            ) : visibleItems.length === 0 ? (
                <div className="roadmap-v-empty">
                    <RoadmapIcon size={44} color="var(--text-faint)" />
                    <h4>План разработки пока пуст</h4>
                    {isAdmin && (
                        <button className="settings-btn primary" onClick={openAddModal} style={{ marginTop: '12px' }}>
                            <PlusIcon size={16} color="#fff" />
                            <span>Добавить первую идею</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="roadmap-line-container">
                    <div className="roadmap-vertical-track" />
                    
                    <div className="roadmap-nodes-list">
                        {visibleItems.map((item, index) => {
                            const priorityInfo = item.priority ? PRIORITY_CONFIG[item.priority] : null;
                            const priorityClass = priorityInfo ? priorityInfo.className : '';
                            const adminOnlyClass = item.adminOnly ? 'is-admin-only' : '';
                            const isCardActive = activeCardId === item._id;

                            return (
                                <div 
                                    key={item._id} 
                                    className={`roadmap-node-row ${priorityClass} ${adminOnlyClass} ${isCardActive ? 'is-active-card' : ''}`}
                                    onClick={() => setActiveCardId(prev => prev === item._id ? null : item._id)}
                                >
                                    {/* Central vertical line connector point */}
                                    <div className="roadmap-node-point-wrap">
                                        <div className="roadmap-node-dot" />
                                    </div>

                                    {/* Idea card attached to dot */}
                                    <div className="roadmap-node-card">
                                        <div className="roadmap-node-card-header">
                                            <div className="roadmap-node-meta">
                                                {item.adminOnly && (
                                                    <span className="roadmap-tag-admin-only" title="Эта идея видна только администраторам">
                                                        <LockIcon size={12} />
                                                        <span>Только для админов</span>
                                                    </span>
                                                )}
                                                {priorityInfo && (
                                                    <span className={`roadmap-tag-priority ${priorityInfo.className}`}>
                                                        {priorityInfo.label}
                                                    </span>
                                                )}
                                                {item.targetDate && (
                                                    <span className="roadmap-tag-date">
                                                        {item.targetDate}
                                                    </span>
                                                )}
                                            </div>

                                            {isAdmin && (
                                                <div 
                                                    className="roadmap-node-admin-tools"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <button
                                                        type="button"
                                                        className="roadmap-btn-tool"
                                                        title="Переместить вверх"
                                                        disabled={index === 0}
                                                        onClick={() => handleMoveItem(index, 'up')}
                                                    >
                                                        <ArrowUpIcon size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="roadmap-btn-tool"
                                                        title="Переместить вниз"
                                                        disabled={index === visibleItems.length - 1}
                                                        onClick={() => handleMoveItem(index, 'down')}
                                                    >
                                                        <ArrowDownIcon size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="roadmap-btn-tool"
                                                        title="Редактировать"
                                                        onClick={() => openEditModal(item)}
                                                    >
                                                        <EditIcon size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="roadmap-btn-tool danger"
                                                        title="Удалить"
                                                        onClick={() => handleDeleteItem(item)}
                                                    >
                                                        <TrashIcon size={15} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <h3 className="roadmap-node-idea">{item.idea}</h3>

                                        {item.description && (
                                            <p className="roadmap-node-desc">{item.description}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Smooth fading tail at the bottom */}
                    <div className="roadmap-timeline-bottom-fade">
                        <div className="roadmap-node-point-wrap">
                            <div className="roadmap-fade-dot" />
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Add / Edit */}
            {isModalOpen && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal-glass roadmap-v-modal">
                        <div className="roadmap-modal-header">
                            <h3 className="roadmap-modal-title">
                                {editingItem ? 'Редактировать идею' : 'Новая идея'}
                            </h3>
                            <button className="settings-close-btn" onClick={closeModal} title="Закрыть">
                                <CloseIcon size={18} />
                            </button>
                        </div>

                        {modalError && (
                            <div className="roadmap-modal-error">
                                <span>{modalError}</span>
                            </div>
                        )}

                        <form onSubmit={handleSaveItem} className="roadmap-modal-form">
                            {/* Idea (Required) */}
                            <div className="roadmap-form-group">
                                <label className="roadmap-form-label">
                                    Идея <span className="required-star">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="settings-input roadmap-form-input"
                                    value={modalIdea}
                                    onChange={(e) => setModalIdea(e.target.value)}
                                    autoFocus
                                    required
                                />
                            </div>

                            {/* Description (Optional) */}
                            <div className="roadmap-form-group">
                                <label className="roadmap-form-label">
                                    Описание <span className="optional-tag">(необязательно)</span>
                                </label>
                                <textarea
                                    className="settings-input roadmap-form-textarea"
                                    rows={3}
                                    value={modalDescription}
                                    onChange={(e) => setModalDescription(e.target.value)}
                                />
                            </div>

                            {/* Target Date & Priority in row (Both optional) */}
                            <div className="roadmap-form-row">
                                <div className="roadmap-form-group">
                                    <label className="roadmap-form-label">
                                        Срок реализации <span className="optional-tag">(необязательно)</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="settings-input roadmap-form-input"
                                        value={modalTargetDate}
                                        onChange={(e) => setModalTargetDate(e.target.value)}
                                    />
                                </div>

                                <div className="roadmap-form-group">
                                    <label className="roadmap-form-label">
                                        Приоритет <span className="optional-tag">(необязательно)</span>
                                    </label>
                                    <select
                                        className="settings-input roadmap-form-select"
                                        value={modalPriority}
                                        onChange={(e) => setModalPriority(e.target.value)}
                                    >
                                        <option value="">Не указан</option>
                                        <option value="regular">Обычное обновление</option>
                                        <option value="major">Большое обновление</option>
                                        <option value="massive">Крупное обновление</option>
                                    </select>
                                </div>
                            </div>

                            {/* Admin only toggle */}
                            <div className="roadmap-form-checkbox-row" onClick={() => setModalAdminOnly(!modalAdminOnly)}>
                                <input
                                    type="checkbox"
                                    id="roadmap-admin-only-cb"
                                    className="roadmap-checkbox"
                                    checked={modalAdminOnly}
                                    onChange={(e) => setModalAdminOnly(e.target.checked)}
                                />
                                <label htmlFor="roadmap-admin-only-cb" className="roadmap-checkbox-label">
                                    Показывать идею только администраторам
                                </label>
                            </div>

                            <div className="modal-actions" style={{ marginTop: '16px' }}>
                                <button
                                    type="button"
                                    className="settings-btn secondary"
                                    onClick={closeModal}
                                    disabled={modalSaving}
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="settings-btn primary"
                                    disabled={modalSaving || !modalIdea.trim()}
                                >
                                    {modalSaving ? 'Сохранение...' : editingItem ? 'Сохранить' : 'Добавить'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppRoadmapSettings;
