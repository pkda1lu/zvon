import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import PersonalDataSection from '../../components/PersonalDataSection';
import BlockedUsersSection from '../../components/BlockedUsersSection';

const PrivacySettings: React.FC = () => {
    const { user, refreshUser } = useAuth();
    
    // Default settings if they don't exist
    const settings = user?.settings || {
        whoCanDM: ['everyone'],
        whoCanFindInSearch: 'everyone',
        whoCanSeeFullProfile: ['everyone'],
        smallServerLimit: 50
    };

    const updateSetting = async (key: string, value: any) => {
        try {
            await axios.put('/api/users/settings', {
                settings: { ...settings, [key]: value }
            });
            await refreshUser();
        } catch (e) {
            console.error("Failed to update privacy setting", e);
        }
    };

    const toggleMultiSelect = (key: 'whoCanDM' | 'whoCanSeeFullProfile', val: string) => {
        const current: string[] = Array.isArray(settings[key]) ? (settings[key] as string[]) : [settings[key] as string];
        let newList: string[];

        if (val === 'everyone') {
            newList = ['everyone'];
        } else if (val === 'nobody') {
            newList = ['nobody'];
        } else {
            // Remove 'everyone' and 'nobody' if we select a specific category
            newList = current.filter(i => i !== 'everyone' && i !== 'nobody');
            if (newList.includes(val)) {
                newList = newList.filter(i => i !== val);
            } else {
                newList.push(val);
            }
            if (newList.length === 0) newList = ['nobody'];
        }
        updateSetting(key, newList);
    };

    const isSelected = (key: 'whoCanDM' | 'whoCanSeeFullProfile', val: string) => {
        const current = Array.isArray(settings[key]) ? (settings[key] as string[]) : [settings[key] as string];
        return current.includes(val);
    };

    const CheckboxItem = ({ label, selected, onClick, children }: any) => (
        <div className="settings-checkbox-row" onClick={onClick} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            padding: '10px 14px', 
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.03)',
            marginBottom: '8px',
            cursor: 'pointer',
            border: '1px solid var(--glass-border)',
            transition: 'all 0.2s ease'
        }}>
            <div className={`custom-checkbox ${selected ? 'checked' : ''}`} style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                border: '2px solid var(--glass-border)',
                background: selected ? 'var(--primary-neon)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                flexShrink: 0
            }}>
                {selected && <div style={{ width: '10px', height: '6px', borderLeft: '2px solid white', borderBottom: '2px solid white', transform: 'rotate(-45deg) translateY(-1px)' }} />}
            </div>
            <div style={{ flex: 1, color: selected ? 'var(--text-main)' : 'var(--text-dim)', fontWeight: 600, fontSize: '14px' }}>
                {label}
            </div>
            {children}
        </div>
    );

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Приватность</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{ marginTop: 0 }}>Кто может писать вам (ЛС)</h3>
                <p className="settings-description">Выберите категории пользователей, которым разрешено начинать с вами диалог.</p>
                <div style={{ marginTop: '16px' }}>
                    <CheckboxItem label="Все" selected={isSelected('whoCanDM', 'everyone')} onClick={() => toggleMultiSelect('whoCanDM', 'everyone')} />
                    <CheckboxItem label="Участники общих серверов" selected={isSelected('whoCanDM', 'server_members')} onClick={() => toggleMultiSelect('whoCanDM', 'server_members')} />
                    <CheckboxItem label="Друзья" selected={isSelected('whoCanDM', 'friends')} onClick={() => toggleMultiSelect('whoCanDM', 'friends')} />
                    <CheckboxItem label="Никто" selected={isSelected('whoCanDM', 'nobody')} onClick={() => toggleMultiSelect('whoCanDM', 'nobody')} />
                </div>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{ marginTop: 0 }}>Поиск профиля</h3>
                <p className="settings-description">Кто может найти ваш профиль в поиске друзей.</p>
                <div style={{ marginTop: '16px' }}>
                    {/* Search findability remains single choice as it makes more sense logically */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { value: 'everyone', label: 'Все' },
                            { value: 'friends_of_friends', label: 'Друзья друзей' },
                            { value: 'nobody', label: 'Никто' }
                        ].map(opt => (
                            <button 
                                key={opt.value}
                                className={`settings-btn ${settings.whoCanFindInSearch === opt.value ? '' : 'settings-btn-danger'}`}
                                style={{ 
                                    background: settings.whoCanFindInSearch === opt.value ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)',
                                    color: settings.whoCanFindInSearch === opt.value ? '#fff' : 'var(--text-main)',
                                    border: 'none'
                                }}
                                onClick={() => updateSetting('whoCanFindInSearch', opt.value)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{ marginTop: 0 }}>Кому отображается полный профиль</h3>
                <p className="settings-description">Выберите, кто может видеть вашу активность, приложения и основной сервер.</p>
                <div style={{ marginTop: '16px' }}>
                    <CheckboxItem label="Все" selected={isSelected('whoCanSeeFullProfile', 'everyone')} onClick={() => toggleMultiSelect('whoCanSeeFullProfile', 'everyone')} />
                    <CheckboxItem label="Друзья" selected={isSelected('whoCanSeeFullProfile', 'friends')} onClick={() => toggleMultiSelect('whoCanSeeFullProfile', 'friends')} />
                    <CheckboxItem 
                        label="Малые серверы" 
                        selected={isSelected('whoCanSeeFullProfile', 'small_servers')} 
                        onClick={() => toggleMultiSelect('whoCanSeeFullProfile', 'small_servers')}
                    >
                        {isSelected('whoCanSeeFullProfile', 'small_servers') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>до</span>
                                <input 
                                    type="number" 
                                    className="settings-input" 
                                    style={{ width: '70px', padding: '4px 8px', height: '30px', fontSize: '13px' }}
                                    value={settings.smallServerLimit || 50}
                                    onChange={e => updateSetting('smallServerLimit', parseInt(e.target.value) || 0)}
                                />
                                <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>чел.</span>
                            </div>
                        )}
                    </CheckboxItem>
                    <CheckboxItem label="Никто" selected={isSelected('whoCanSeeFullProfile', 'nobody')} onClick={() => toggleMultiSelect('whoCanSeeFullProfile', 'nobody')} />
                </div>
                
                <div style={{ 
                    marginTop: '20px', 
                    padding: '16px', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '12px',
                    fontSize: '13px',
                    color: 'var(--text-dim)',
                    lineHeight: '1.5'
                }}>
                    <strong>Неполный профиль:</strong> отображается только имя, никнейм, баннер, аватарка, статус, значок и "О себе". Скрывается активность, приложения, основной сервер и время последнего входа.
                </div>
            </div>

            {/* Чёрный список: блокировка ставится из меню переписки, снимается здесь. */}
            <BlockedUsersSection />

            {/* Права субъекта персональных данных: выгрузка, согласия, удаление. */}
            <PersonalDataSection />
        </div>
    );
};

export default PrivacySettings;
