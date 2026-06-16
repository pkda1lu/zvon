import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';

const ModerationSettings: React.FC = () => {
    const { user } = useAuth();
    const { confirm, prompt, alert } = useDialog();
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'resolved' | 'dismissed'>('pending');
    const [mainTab, setMainTab] = useState<'reports' | 'marketplace'>('reports');

    const fetchReports = async (status: string) => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/moderation/reports?status=${status}`);
            setReports(res.data);
        } catch (err) { }
        setLoading(false);
    };

    useEffect(() => {
        fetchReports(filter);
    }, [filter]);

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Модерация</h2>
            <p className="settings-description">Управление жалобами на сообщения, профили пользователей, сервера и витрину.</p>

            <div style={{ marginBottom: '24px', display: 'flex', gap: '10px', borderBottom: '1px solid var(--glass-border)' }}>
                <button
                    onClick={() => setMainTab('reports')}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: mainTab === 'reports' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${mainTab === 'reports' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Жалобы
                </button>
                <button
                    onClick={() => setMainTab('marketplace')}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: mainTab === 'marketplace' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${mainTab === 'marketplace' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Витрина
                </button>
            </div>

            {mainTab === 'marketplace' ? (
                <div className="settings-card">
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 0' }}>Модерация витрины находится в разработке.</div>
                </div>
            ) : (
                <>
                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                        <div 
                            onClick={() => setFilter('pending')} 
                            style={{ cursor: 'pointer', padding: '10px 20px', background: filter === 'pending' ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: filter === 'pending' ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                        >
                            Ожидают ({filter === 'pending' ? reports.length : '...'})
                        </div>
                        <div 
                            onClick={() => setFilter('resolved')} 
                            style={{ cursor: 'pointer', padding: '10px 20px', background: filter === 'resolved' ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: filter === 'resolved' ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                        >
                            Решено
                        </div>
                        <div 
                            onClick={() => setFilter('dismissed')} 
                            style={{ cursor: 'pointer', padding: '10px 20px', background: filter === 'dismissed' ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: filter === 'dismissed' ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                        >
                            Отклонено
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {loading ? (
                            <div style={{ color: 'var(--text-dim)', padding: '20px' }}>Загрузка...</div>
                        ) : reports.length === 0 ? (
                            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>{filter === 'pending' ? 'Жалоб нет. Всё спокойно! 🛡️' : 'Список пока пуст.'}</div>
                        ) : (
                            reports.map(report => (
                                <div key={report._id} className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', marginBottom: '6px' }}>
                                                <strong style={{ color: 'var(--text-dim)' }}>От:</strong> {report.reporter?.username}
                                            </div>
                                            <div style={{ fontSize: '14px' }}>
                                                <strong style={{ color: 'var(--text-dim)' }}>На:</strong> {report.reportedUser?.username || report.reportedMiniApp?.name || report.reportedServer?.name || 'Unknown'}
                                                {report.reportedServer && <span style={{ fontSize: '11px', marginLeft: '6px', color: 'var(--accent-pink)' }}>(Сервер)</span>}
                                                {report.reportedMiniApp && <span style={{ fontSize: '11px', marginLeft: '6px', color: 'var(--secondary-neon)' }}>(Приложение)</span>}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'right' }}>
                                            <div>{new Date(report.createdAt).toLocaleString('ru-RU')}</div>
                                            {report.status !== 'pending' && <div style={{ color: 'var(--primary-neon)', fontWeight: 600, marginTop: '6px' }}>{report.status === 'resolved' ? 'РЕШЕНО' : 'ОТКЛОНЕНО'}</div>}
                                        </div>
                                    </div>
                                    
                                    <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--primary-neon)', marginBottom: '8px', fontSize: '14px' }}>
                                            {report.reason === 'harassment' ? 'Домогательства' :
                                            report.reason === 'spam' ? 'Спам' :
                                            report.reason === 'inappropriate_content' ? 'Контент' :
                                            report.reason === 'scam' ? 'Мошенничество' : 'Другое'}
                                        </div>
                                        {report.description && <div style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: report.messageContext ? '12px' : 0 }}>{report.description}</div>}
                                        
                                        {report.messageContext && (
                                            <div style={{ fontSize: '13px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', borderLeft: '3px solid var(--primary-neon)' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>Цитата из сообщения:</div>
                                                {report.messageContext.content}
                                            </div>
                                        )}
                                    </div>

                                    {report.status !== 'pending' && (
                                        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
                                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                                                <strong>Решение модератора ({report.resolvedBy?.username}):</strong> {report.resolutionNote || 'Без комментария'}
                                            </div>
                                            <button className="settings-btn" style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={async () => {
                                                if (await confirm('Вы уверены, что хотите отменить вердикт и вернуть жалобу в список ожидания?')) {
                                                    try {
                                                        await axios.post(`/api/moderation/reports/${report._id}/unresolve`);
                                                        if (report.status === 'resolved' && await confirm('Хотите также РАЗБАНИТЬ этого пользователя?')) {
                                                            await axios.post('/api/moderation/unban', { userId: report.reportedUser._id });
                                                            await alert('Пользователь разбанен.');
                                                        }
                                                        fetchReports(filter);
                                                    } catch (e) { }
                                                }
                                            }}>Отменить решение</button>
                                        </div>
                                    )}

                                    {report.status === 'pending' && (
                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                                            <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={async () => {
                                                try {
                                                    await axios.post(`/api/moderation/reports/${report._id}/resolve`, { status: 'dismissed', note: 'Отклонено модератором' });
                                                    fetchReports(filter);
                                                } catch (e) { }
                                            }}>Отклонить</button>
                                            
                                            <button className="settings-btn" style={{ background: 'rgba(240, 178, 50, 0.2)', color: '#f0b232', boxShadow: 'none' }} onClick={async () => {
                                                const reason = await prompt('Укажите причину временного бана:', 'Нарушение правил сообщества');
                                                if (reason) {
                                                    try {
                                                        await axios.post('/api/moderation/ban', { userId: report.reportedUser._id, type: 'temporary', durationHours: 24, reason });
                                                        await axios.post(`/api/moderation/reports/${report._id}/resolve`, { status: 'resolved', note: 'Временный бан на 24ч' });
                                                        fetchReports(filter);
                                                        await alert('Пользователь забанен на 24 часа');
                                                    } catch (e) { }
                                                }
                                            }}>Бан 24ч</button>
                                            
                                            <button className="settings-btn settings-btn-danger" onClick={async () => {
                                                if (await confirm(`Вы уверены, что хотите забанить ${report.reportedUser.username} НАВСЕГДА?`)) {
                                                    const reason = await prompt('Укажите причину перманентного бана:', 'Грубое нарушение правил');
                                                    if (reason) {
                                                        try {
                                                            await axios.post('/api/moderation/ban', { userId: report.reportedUser._id, type: 'permanent', reason });
                                                            await axios.post(`/api/moderation/reports/${report._id}/resolve`, { status: 'resolved', note: 'Перманентный бан' });
                                                            fetchReports(filter);
                                                            await alert('Пользователь забанен навсегда');
                                                        } catch (e) { }
                                                    }
                                                }
                                            }}>Пермабан</button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ModerationSettings;
