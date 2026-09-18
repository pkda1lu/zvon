import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { SettingsToggle } from './SettingsUI';
import { 
    updateBrandInRegistry, 
    removeBrandFromRegistry, 
    fetchAndApplyBranding,
    BrandConfig,
    AppIconOption,
    BRANDS
} from '../../utils/branding';
import { useAppearance } from '../../contexts/AppearanceContext';
import { CloseIcon, PlusIcon, GlobeIcon } from '../../components/Icons';
import './AdminBrandingSettings.css';

const DEFAULT_BANNER = {
    enabled: false,
    text: '',
    closable: true
};



const AdminBrandingSettings: React.FC = () => {
    const [brands, setBrands] = useState<BrandConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const { customColors } = useAppearance();

    // Modal state for editing or creating
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [editingBrand, setEditingBrand] = useState<BrandConfig | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // File upload refs
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingIconIndex, setUploadingIconIndex] = useState<number | null>(null);

    // Nginx Modal State
    const [isNginxModalOpen, setIsNginxModalOpen] = useState(false);
    const [nginxConfigText, setNginxConfigText] = useState('');
    const [nginxDomains, setNginxDomains] = useState<string[]>([]);
    const [backendPort, setBackendPort] = useState(5000);
    const [nginxSslMode, setNginxSslMode] = useState(false);
    const [nginxSaving, setNginxSaving] = useState(false);
    const [nginxStatusMsg, setNginxStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
    const [hasServerNginx, setHasServerNginx] = useState(false);
    const [copiedConfig, setCopiedConfig] = useState(false);
    const [copiedCertbot, setCopiedCertbot] = useState(false);

    // Генерация текста конфигурации Nginx на основе доменов брендов
    const generateNginxText = (domainList: string[], port: number, ssl: boolean) => {
        const primary = domainList[0] || 'zvonserver.ru';
        const serverNames = domainList.join(' ');

        if (ssl) {
            return `# Конфигурация Nginx для Zvon и подключенных брендов (SSL HTTPS)
# Сгенерировано: ${new Date().toLocaleString('ru-RU')}

# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name ${serverNames};
    return 301 https://$host$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    server_name ${serverNames};

    ssl_certificate /etc/letsencrypt/live/${primary}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${primary}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50M;

    # Gzip сжатие
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    location /api/uploads {
        alias /var/www/zvon/server/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
`;
        }

        return `# Конфигурация Nginx для Zvon и подключенных брендов (HTTP)
# Сгенерировано: ${new Date().toLocaleString('ru-RU')}

server {
    listen 80;
    server_name ${serverNames};

    client_max_body_size 50M;

    # Gzip сжатие
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    location /api/uploads {
        alias /var/www/zvon/server/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
`;
    };

    const getActiveBrandDomains = () => {
        const domains = Array.from(new Set(
            brands
                .filter(b => (b.domainBehavior || (b.enabled === false ? 'disabled' : 'open')) !== 'disabled')
                .map(b => (b.domain || '').trim().toLowerCase())
                .filter(d => d && !d.includes('localhost') && !d.includes('127.0.0.1'))
        ));
        if (!domains.includes('zvonserver.ru')) {
            domains.unshift('zvonserver.ru');
        }
        return domains;
    };

    const openNginxModal = async () => {
        setNginxStatusMsg(null);
        setIsNginxModalOpen(true);
        const currentDomains = getActiveBrandDomains();
        setNginxDomains(currentDomains);

        try {
            const res = await axios.get('/api/admin/branding/nginx/config');
            if (res.data) {
                setHasServerNginx(!!res.data.hasServerNginx);
                if (res.data.domains && Array.isArray(res.data.domains)) {
                    setNginxDomains(res.data.domains);
                }
                if (res.data.serverConfig) {
                    setNginxConfigText(res.data.serverConfig);
                    if (res.data.serverConfig.includes('listen 443 ssl')) {
                        setNginxSslMode(true);
                    }
                } else {
                    setNginxConfigText(res.data.generatedConfig || generateNginxText(currentDomains, backendPort, nginxSslMode));
                }
            }
        } catch {
            // Если оффлайн / бэкенд недоступен
            setNginxConfigText(generateNginxText(currentDomains, backendPort, nginxSslMode));
        }
    };

    const handleApplyNginxConfig = async () => {
        try {
            setNginxSaving(true);
            setNginxStatusMsg(null);
            const res = await axios.post('/api/admin/branding/nginx/config', { configText: nginxConfigText });
            if (res.data.success) {
                setNginxStatusMsg({ text: res.data.message || 'Конфиг успешно применён и Nginx перезагружен!' });
                setHasServerNginx(true);
            } else if (res.data.isLocalEnv) {
                setNginxStatusMsg({
                    text: res.data.message || 'Локальная разработка: файл Nginx на этом компьютере не установлен. Скопируйте конфиг для боевого сервера.',
                    isError: false
                });
            } else {
                setNginxStatusMsg({ text: res.data.message || 'Ошибка применения конфига', isError: true });
            }
        } catch (err: any) {
            setNginxStatusMsg({
                text: err.response?.data?.message || 'Не удалось применить конфиг на сервере',
                isError: true
            });
        } finally {
            setNginxSaving(false);
        }
    };

    const handleCopyNginxConfig = () => {
        navigator.clipboard.writeText(nginxConfigText);
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
    };

    const handleDownloadNginxConfig = () => {
        const element = document.createElement('a');
        const file = new Blob([nginxConfigText], { type: 'text/plain;charset=utf-8' });
        element.href = URL.createObjectURL(file);
        element.download = 'zvon.conf';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const getCertbotCommand = () => {
        const dArgs = nginxDomains.map(d => `-d ${d}`).join(' ');
        return `certbot --nginx ${dArgs}`;
    };

    const handleCopyCertbot = () => {
        navigator.clipboard.writeText(getCertbotCommand());
        setCopiedCertbot(true);
        setTimeout(() => setCopiedCertbot(false), 2000);
    };

    const fetchBrands = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/admin/branding');
            if (Array.isArray(res.data) && res.data.length > 0) {
                setBrands(res.data);
            } else {
                setBrands(Object.values(BRANDS));
            }
        } catch {
            // При недоступности бэкенда отображаем текущие бренды из реестра
            setBrands(Object.values(BRANDS));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBrands();
    }, []);

    const handleDeleteBrand = async (brand: BrandConfig) => {
        if (brand.id === 'zvon') {
            alert('Основной бренд Zvon нельзя удалить!');
            return;
        }
        if (brand.isBuiltin) {
            alert('Встроенный бренд нельзя удалить, но вы можете отключить его.');
            return;
        }
        if (!window.confirm(`Удалить бренд "${brand.name}"?`)) {
            return;
        }

        try {
            await axios.delete(`/api/admin/branding/${brand.id}`);
        } catch {
            // Локальное удаление при отсутствии серверсайда
        }

        setBrands(prev => prev.filter(b => b.id !== brand.id));
        removeBrandFromRegistry(brand.id);
        fetchAndApplyBranding();
    };

    const openCreateModal = () => {
        setIsCreating(true);
        setFormError(null);
        const zvonBrand = brands.find(b => b.id === 'zvon') || BRANDS.zvon;
        setEditingBrand({
            id: '',
            name: '',
            domain: '',
            domainBehavior: 'open',
            supportEmail: '',
            logo: '',
            favicon: zvonBrand.favicon || 'icon.png',
            enabled: true,
            isBuiltin: false,
            banner: { ...DEFAULT_BANNER },
            appIcons: [
                { id: 'icon_default', label: 'Стандарт', img: zvonBrand.favicon || 'icon.png', isPrimary: true }
            ]
        });
        setIsModalOpen(true);
    };

    const openEditModal = (brand: BrandConfig) => {
        setIsCreating(false);
        setFormError(null);

        // Гарантируем, что у бренда есть хотя бы одна иконка и одна основная
        const icons: AppIconOption[] = Array.isArray(brand.appIcons) && brand.appIcons.length > 0
            ? brand.appIcons.map(ic => ({ ...ic }))
            : [{ id: `${brand.id}_default`, label: 'Стандарт', img: brand.favicon || 'icon.png', isPrimary: true }];

        if (!icons.some(i => i.isPrimary)) {
            icons[0].isPrimary = true;
        }

        setEditingBrand({
            ...brand,
            domainBehavior: brand.domainBehavior || 'open',
            banner: brand.banner ? { ...brand.banner } : { ...DEFAULT_BANNER },
            appIcons: icons
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingBrand(null);
        setFormError(null);
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editingBrand) return;

        setUploadingLogo(true);
        try {
            const formData = new FormData();
            formData.append('files', file);
            const res = await axios.post('/api/upload-files', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const uploadedUrl = res.data?.[0]?.url;
            if (uploadedUrl) {
                setEditingBrand(prev => prev ? ({ ...prev, logo: uploadedUrl }) : null);
            }
        } catch {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result && typeof reader.result === 'string') {
                    setEditingBrand(prev => prev ? ({ ...prev, logo: reader.result as string }) : null);
                }
            };
            reader.readAsDataURL(file);
        } finally {
            setUploadingLogo(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>, iconIndex: number) => {
        const file = e.target.files?.[0];
        if (!file || !editingBrand) return;

        setUploadingIconIndex(iconIndex);
        try {
            const formData = new FormData();
            formData.append('files', file);
            const res = await axios.post('/api/upload-files', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const uploadedUrl = res.data?.[0]?.url;
            if (uploadedUrl) {
                updateIconField(iconIndex, 'img', uploadedUrl);
            }
        } catch {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result && typeof reader.result === 'string') {
                    updateIconField(iconIndex, 'img', reader.result as string);
                }
            };
            reader.readAsDataURL(file);
        } finally {
            setUploadingIconIndex(null);
            if (e.target) e.target.value = '';
        }
    };

    const setPrimaryIcon = (index: number) => {
        if (!editingBrand) return;
        const updatedIcons = editingBrand.appIcons.map((ic, i) => ({
            ...ic,
            isPrimary: i === index
        }));
        const primary = updatedIcons[index];
        setEditingBrand({
            ...editingBrand,
            appIcons: updatedIcons,
            favicon: primary?.img || editingBrand.favicon
        });
    };

    const updateIconField = (index: number, field: 'label' | 'img', value: string) => {
        if (!editingBrand) return;
        const updatedIcons = [...editingBrand.appIcons];
        updatedIcons[index] = {
            ...updatedIcons[index],
            [field]: value
        };
        const primary = updatedIcons.find(i => i.isPrimary) || updatedIcons[0];
        setEditingBrand({
            ...editingBrand,
            appIcons: updatedIcons,
            favicon: primary?.img || editingBrand.favicon
        });
    };

    const addIcon = () => {
        if (!editingBrand) return;
        const newId = `icon_${Date.now()}`;
        const newIcon: AppIconOption = {
            id: newId,
            label: 'Вариант',
            img: 'icon.png',
            isPrimary: editingBrand.appIcons.length === 0
        };
        setEditingBrand({
            ...editingBrand,
            appIcons: [...editingBrand.appIcons, newIcon]
        });
    };

    const removeIcon = (index: number) => {
        if (!editingBrand || editingBrand.appIcons.length <= 1) {
            alert('У бренда должна быть хотя бы одна иконка');
            return;
        }
        const updated = editingBrand.appIcons.filter((_, i) => i !== index);
        if (!updated.some(i => i.isPrimary) && updated.length > 0) {
            updated[0].isPrimary = true;
        }
        const primary = updated.find(i => i.isPrimary) || updated[0];
        setEditingBrand({
            ...editingBrand,
            appIcons: updated,
            favicon: primary?.img || editingBrand.favicon
        });
    };

    const handleSaveBrand = async () => {
        if (!editingBrand) return;
        setFormError(null);

        if (isCreating) {
            const cleanId = editingBrand.id.trim().toLowerCase();
            if (!cleanId) {
                setFormError('Укажите идентификатор бренда (ID)');
                return;
            }
            if (!/^[a-z0-9_-]+$/.test(cleanId)) {
                setFormError('ID может содержать только латинские буквы, цифры, дефис и подчеркивание');
                return;
            }
            if (cleanId === 'zvon') {
                setFormError('Бренд с ID "zvon" уже существует');
                return;
            }
        }

        if (!editingBrand.name.trim()) {
            setFormError('Укажите название бренда');
            return;
        }

        const zvonBrand = brands.find(b => b.id === 'zvon') || BRANDS.zvon;
        const defaultLogo = zvonBrand.logo || 'zvonlogonew.png';
        const defaultFavicon = zvonBrand.favicon || 'icon.png';
        const defaultSupportEmail = zvonBrand.supportEmail || 'support@zvonserver.ru';

        // Убедимся, что есть одна основная иконка
        let icons = [...editingBrand.appIcons];
        if (icons.length > 0 && !icons.some(i => i.isPrimary)) {
            icons[0].isPrimary = true;
        }
        const primary = icons.find(i => i.isPrimary) || icons[0];
        const behavior = editingBrand.domainBehavior || 'open';

        const payload: BrandConfig = {
            ...editingBrand,
            logo: editingBrand.logo.trim() ? editingBrand.logo.trim() : defaultLogo,
            favicon: primary?.img ? primary.img.trim() : defaultFavicon,
            supportEmail: editingBrand.supportEmail?.trim() ? editingBrand.supportEmail.trim() : defaultSupportEmail,
            domainBehavior: behavior,
            enabled: behavior !== 'disabled',
            appIcons: icons
        };

        setSaving(true);
        try {
            if (isCreating) {
                try {
                    const res = await axios.post('/api/admin/branding', payload);
                    const created = res.data;
                    setBrands(prev => [...prev, created]);
                    updateBrandInRegistry(created);
                } catch {
                    // Локальное создание при отсутствии сервера
                    const created = { ...payload };
                    setBrands(prev => [...prev, created]);
                    updateBrandInRegistry(created);
                }
            } else {
                try {
                    const res = await axios.put(`/api/admin/branding/${payload.id}`, payload);
                    const updated = res.data;
                    setBrands(prev => prev.map(b => b.id === updated.id ? updated : b));
                    updateBrandInRegistry(updated);
                } catch {
                    // Локальное обновление при отсутствии сервера
                    const updated = { ...payload };
                    setBrands(prev => prev.map(b => b.id === updated.id ? updated : b));
                    updateBrandInRegistry(updated);
                }
            }

            fetchAndApplyBranding();
            closeModal();
        } catch (err: any) {
            setFormError(err.response?.data?.message || 'Ошибка сохранения бренда');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-content-inner branding-settings-container">
            <div className="branding-header-row">
                <div>
                    <h2 className="settings-page-title">Управление брендингами</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                        type="button" 
                        className="settings-btn secondary" 
                        onClick={openNginxModal}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title="Настройка и генерация конфигурации Nginx для доменов брендов"
                    >
                        <GlobeIcon size={16} />
                        <span>Конфиг Nginx</span>
                    </button>
                    <button 
                        type="button" 
                        className="settings-btn primary" 
                        onClick={openCreateModal}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <PlusIcon size={16} />
                        <span>Добавить бренд</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    Загрузка брендов...
                </div>
            ) : (
                <div className="branding-list-view">
                    {brands.map(brand => {
                        const isZvon = brand.id === 'zvon';
                        const behavior = isZvon ? 'open' : (brand.domainBehavior || (brand.enabled === false ? 'disabled' : 'open'));

                        return (
                            <div 
                                key={brand.id} 
                                className={`brand-list-row ${behavior === 'disabled' ? 'disabled-brand' : ''}`}
                            >
                                <div className="brand-row-left">
                                    <div className="brand-row-logo">
                                        <img 
                                            src={brand.logo.startsWith('http') || brand.logo.startsWith('data:') || brand.logo.startsWith('/') ? brand.logo : `/${brand.logo}`} 
                                            alt={brand.name} 
                                            onError={(e: any) => { e.target.src = '/zvonlogonew.png'; }}
                                        />
                                    </div>
                                    <div className="brand-row-details">
                                        <div className="brand-row-name">
                                            {brand.name}
                                        </div>
                                        <div className="brand-row-domain">
                                            {brand.domain || '—'}
                                        </div>
                                    </div>
                                </div>

                                <div className="brand-row-right">
                                    <div className="brand-row-status">
                                        <span className={`brand-status-badge status-${behavior}`}>
                                            {behavior === 'open' ? 'Открытие бренда' :
                                             behavior === 'redirect' ? 'Редирект на основной' : 'Не работает'}
                                        </span>
                                    </div>

                                    <div className="brand-row-actions">
                                        <button 
                                            type="button" 
                                            className="settings-btn secondary"
                                            onClick={() => openEditModal(brand)}
                                            style={{ padding: '6px 14px', fontSize: '13px' }}
                                        >
                                            Настроить
                                        </button>
                                        {!isZvon && !brand.isBuiltin && (
                                            <button 
                                                type="button" 
                                                className="settings-btn danger"
                                                onClick={() => handleDeleteBrand(brand)}
                                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                                title="Удалить бренд"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal for Creating or Editing Brand */}
            {isModalOpen && editingBrand && (
                <div className="branding-modal-overlay" onClick={closeModal}>
                    <div className="branding-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="branding-modal-header">
                            <h3 className="branding-modal-title">
                                {isCreating ? 'Новый бренд' : `Настройка: ${editingBrand.name}`}
                            </h3>
                            <button 
                                type="button" 
                                onClick={closeModal} 
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                            >
                                <CloseIcon size={20} />
                            </button>
                        </div>

                        <div className="branding-modal-body">
                            {formError && (
                                <div style={{ 
                                    background: 'rgba(255, 71, 87, 0.15)', 
                                    border: '1px solid var(--danger)', 
                                    color: '#ff4757', 
                                    padding: '10px 14px', 
                                    borderRadius: '10px', 
                                    fontSize: '13px' 
                                }}>
                                    {formError}
                                </div>
                            )}

                            {/* Основные параметры */}
                            <div className="form-row-2">
                                <div className="form-field-group">
                                    <label className="form-field-label">
                                        <span>Название бренда</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        className="form-field-input" 
                                        placeholder="MAXCORD" 
                                        value={editingBrand.name}
                                        onChange={e => setEditingBrand({ ...editingBrand, name: e.target.value })}
                                    />
                                </div>

                                <div className="form-field-group">
                                    <label className="form-field-label">
                                        <span>Идентификатор (ID)</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        className="form-field-input" 
                                        placeholder="maxcord" 
                                        disabled={!isCreating}
                                        value={editingBrand.id}
                                        onChange={e => setEditingBrand({ ...editingBrand, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                                    />
                                </div>
                            </div>

                            <div className="form-row-2">
                                <div className="form-field-group">
                                    <label className="form-field-label">
                                        <span>Домен</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        className="form-field-input" 
                                        placeholder="maxcord.fun" 
                                        value={editingBrand.domain || ''}
                                        onChange={e => setEditingBrand({ ...editingBrand, domain: e.target.value.toLowerCase().trim() })}
                                    />
                                </div>

                                <div className="form-field-group">
                                    <label className="form-field-label">
                                        <span>Email поддержки</span>
                                    </label>
                                    <input 
                                        type="email" 
                                        className="form-field-input" 
                                        placeholder="support@domain.ru" 
                                        value={editingBrand.supportEmail || ''}
                                        onChange={e => setEditingBrand({ ...editingBrand, supportEmail: e.target.value.trim() })}
                                    />
                                </div>
                            </div>

                            {/* Поведение домена */}
                            <div className="form-field-group">
                                <label className="form-field-label">
                                    <span>Поведение домена</span>
                                </label>
                                <div className="domain-behavior-group">
                                    <button
                                        type="button"
                                        className={`domain-behavior-option ${(editingBrand.domainBehavior || 'open') === 'open' ? 'active' : ''}`}
                                        onClick={() => setEditingBrand({ ...editingBrand, domainBehavior: 'open' })}
                                        disabled={editingBrand.id === 'zvon'}
                                    >
                                        <div className="domain-behavior-title">Открытие бренда</div>
                                    </button>

                                    <button
                                        type="button"
                                        className={`domain-behavior-option ${editingBrand.domainBehavior === 'redirect' ? 'active' : ''}`}
                                        onClick={() => setEditingBrand({ ...editingBrand, domainBehavior: 'redirect' })}
                                        disabled={editingBrand.id === 'zvon'}
                                    >
                                        <div className="domain-behavior-title">Редирект на основной</div>
                                    </button>

                                    <button
                                        type="button"
                                        className={`domain-behavior-option ${editingBrand.domainBehavior === 'disabled' ? 'active' : ''}`}
                                        onClick={() => setEditingBrand({ ...editingBrand, domainBehavior: 'disabled' })}
                                        disabled={editingBrand.id === 'zvon'}
                                    >
                                        <div className="domain-behavior-title">Не работает</div>
                                    </button>
                                </div>
                            </div>

                            {/* Логотип */}
                            <div className="form-field-group">
                                <label className="form-field-label">
                                    <span>Логотип</span>
                                </label>
                                <div className="upload-input-row">
                                    <input 
                                        type="text" 
                                        className="form-field-input" 
                                        placeholder="logo.png" 
                                        value={editingBrand.logo}
                                        onChange={e => setEditingBrand({ ...editingBrand, logo: e.target.value })}
                                    />
                                    <label className="btn-upload-label">
                                        {uploadingLogo ? '...' : 'Файл'}
                                        <input 
                                            type="file" 
                                            ref={logoInputRef}
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={handleLogoUpload}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Иконки приложения бренда */}
                            <div className="icons-section-box">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <strong style={{ fontSize: '14px', color: '#fff' }}>
                                        Иконки приложения
                                    </strong>
                                    <button 
                                        type="button" 
                                        className="settings-btn secondary"
                                        onClick={addIcon}
                                        style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <PlusIcon size={12} />
                                        <span>Добавить иконку</span>
                                    </button>
                                </div>

                                <div className="icons-list-container">
                                    {editingBrand.appIcons.map((icon, idx) => {
                                        const isPrimary = !!icon.isPrimary;
                                        const imgSrc = icon.img.startsWith('http') || icon.img.startsWith('data:') || icon.img.startsWith('/')
                                            ? icon.img
                                            : `/${icon.img}`;

                                        return (
                                            <div key={icon.id || idx} className={`icon-config-row ${isPrimary ? 'is-primary' : ''}`}>
                                                <div className="icon-preview-thumb">
                                                    <img 
                                                        src={imgSrc} 
                                                        alt={icon.label} 
                                                        onError={(e: any) => { e.target.src = '/icon.png'; }}
                                                    />
                                                </div>

                                                <button
                                                    type="button"
                                                    className={`icon-primary-btn ${isPrimary ? 'active' : 'inactive'}`}
                                                    onClick={() => setPrimaryIcon(idx)}
                                                    title={isPrimary ? "Основная иконка" : "Сделать основной иконкой бренда"}
                                                >
                                                    {isPrimary ? "★ Основная" : "Сделать основной"}
                                                </button>

                                                <input 
                                                    type="text" 
                                                    className="form-field-input" 
                                                    style={{ width: '130px', padding: '6px 10px', fontSize: '13px' }}
                                                    placeholder="Название"
                                                    value={icon.label}
                                                    onChange={e => updateIconField(idx, 'label', e.target.value)}
                                                />

                                                <input 
                                                    type="text" 
                                                    className="form-field-input" 
                                                    style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
                                                    placeholder="Путь к файлу"
                                                    value={icon.img}
                                                    onChange={e => updateIconField(idx, 'img', e.target.value)}
                                                />

                                                <label className="btn-upload-label" style={{ padding: '6px 10px', fontSize: '12px' }}>
                                                    {uploadingIconIndex === idx ? '...' : 'Файл'}
                                                    <input 
                                                        type="file" 
                                                        accept="image/*"
                                                        style={{ display: 'none' }}
                                                        onChange={e => handleIconUpload(e, idx)}
                                                    />
                                                </label>

                                                {editingBrand.appIcons.length > 1 && (
                                                    <button 
                                                        type="button" 
                                                        className="settings-btn danger"
                                                        style={{ padding: '6px 8px', fontSize: '12px' }}
                                                        onClick={() => removeIcon(idx)}
                                                        title="Удалить вариант иконки"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Информационная полоса (баннер) */}
                            <div className="banner-section-box">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <strong style={{ fontSize: '14px', color: '#fff' }}>
                                        Информационная полоса сверху страницы
                                    </strong>
                                    <SettingsToggle 
                                        checked={!!editingBrand.banner?.enabled} 
                                        onChange={val => setEditingBrand({
                                            ...editingBrand,
                                            banner: {
                                                ...(editingBrand.banner || DEFAULT_BANNER),
                                                enabled: val
                                            }
                                        })} 
                                    />
                                </div>

                                {editingBrand.banner?.enabled && (
                                    <>
                                        <div className="form-field-group" style={{ marginTop: '12px' }}>
                                            <label className="form-field-label">
                                                <span>Текст информации</span>
                                            </label>
                                            <textarea 
                                                className="form-field-input" 
                                                rows={2}
                                                placeholder="Введите текст объявления для пользователей бренда"
                                                value={editingBrand.banner?.text || ''}
                                                onChange={e => setEditingBrand({
                                                     ...editingBrand,
                                                     banner: {
                                                         ...(editingBrand.banner || DEFAULT_BANNER),
                                                         text: e.target.value
                                                     }
                                                })}
                                                style={{ resize: 'vertical' }}
                                            />
                                            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                                                Поддерживаются ссылки: <code>https://example.com</code> или <code>[текст ссылки](https://example.com)</code>
                                            </div>
                                        </div>

                                        <div className="form-field-group">
                                            <label className="form-field-label">
                                                <span>Возможность закрытия</span>
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                                                <SettingsToggle 
                                                    checked={editingBrand.banner?.closable !== false} 
                                                    onChange={val => setEditingBrand({
                                                        ...editingBrand,
                                                        banner: {
                                                            ...(editingBrand.banner || DEFAULT_BANNER),
                                                            closable: val
                                                        }
                                                    })} 
                                                />
                                                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                                                    {editingBrand.banner?.closable !== false ? 'Пользователь может закрыть полосу' : 'Полоса закреплена'}
                                                </span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="branding-modal-footer">
                            <button 
                                type="button" 
                                className="settings-btn secondary" 
                                onClick={closeModal}
                                disabled={saving}
                            >
                                Отмена
                            </button>
                            <button 
                                type="button" 
                                className="settings-btn primary" 
                                onClick={handleSaveBrand}
                                disabled={saving}
                            >
                                {saving ? 'Сохранение...' : isCreating ? 'Создать бренд' : 'Сохранить изменения'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Nginx Configuration */}
            {isNginxModalOpen && (
                <div className="branding-modal-overlay" onClick={() => setIsNginxModalOpen(false)}>
                    <div className="branding-modal-card" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                        <div className="branding-modal-header">
                            <div>
                                <h3 className="branding-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <GlobeIcon size={20} color="var(--primary-neon, #5865f2)" />
                                    <span>Конфигурация Nginx для брендов</span>
                                </h3>
                                <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                    {hasServerNginx 
                                        ? 'Файл /etc/nginx/sites-available/zvon подключен к боевому серверу.'
                                        : 'Генератор настроек для реверс-прокси Nginx и привязки доменов.'}
                                </div>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setIsNginxModalOpen(false)} 
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                            >
                                <CloseIcon size={20} />
                            </button>
                        </div>

                        <div className="branding-modal-body">
                            {nginxStatusMsg && (
                                <div style={{
                                    background: nginxStatusMsg.isError ? 'rgba(255, 71, 87, 0.15)' : 'rgba(46, 213, 115, 0.15)',
                                    border: `1px solid ${nginxStatusMsg.isError ? 'var(--danger)' : '#2ed573'}`,
                                    color: nginxStatusMsg.isError ? '#ff4757' : '#2ed573',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    fontSize: '13px'
                                }}>
                                    {nginxStatusMsg.text}
                                </div>
                            )}

                            {/* Active Domains */}
                            <div className="form-field-group">
                                <label className="form-field-label">
                                    <span>Активные домены брендов (server_name)</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{nginxDomains.length} доменов</span>
                                </label>
                                <div className="nginx-domains-pills">
                                    {nginxDomains.map(d => (
                                        <span key={d} className="nginx-domain-pill">
                                            {d}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Options: SSL mode and backend port */}
                            <div className="form-row-2">
                                <div className="form-field-group">
                                    <label className="form-field-label">
                                        <span>Порт Node.js бэкенда</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="number" 
                                            className="form-field-input" 
                                            value={backendPort}
                                            onChange={e => {
                                                const p = parseInt(e.target.value, 10) || 5000;
                                                setBackendPort(p);
                                                setNginxConfigText(generateNginxText(nginxDomains, p, nginxSslMode));
                                            }}
                                            style={{ width: '120px' }}
                                        />
                                        <button 
                                            type="button" 
                                            className="settings-btn secondary"
                                            style={{ fontSize: '12px', padding: '6px 12px' }}
                                            onClick={() => {
                                                setNginxConfigText(generateNginxText(nginxDomains, backendPort, nginxSslMode));
                                            }}
                                        >
                                            Перегенерировать
                                        </button>
                                    </div>
                                </div>

                                <div className="form-field-group">
                                    <label className="form-field-label">
                                        <span>SSL / HTTPS шаблон</span>
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                                        <SettingsToggle 
                                            checked={nginxSslMode} 
                                            onChange={val => {
                                                setNginxSslMode(val);
                                                setNginxConfigText(generateNginxText(nginxDomains, backendPort, val));
                                            }} 
                                        />
                                        <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                                            {nginxSslMode ? 'Включен (Let\'s Encrypt 443)' : 'Базовый HTTP (порт 80)'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Certbot Command */}
                            <div className="form-field-group">
                                <label className="form-field-label">
                                    <span>Команда для получения SSL через Certbot</span>
                                </label>
                                <div className="certbot-code-box">
                                    <code>{getCertbotCommand()}</code>
                                    <button 
                                        type="button" 
                                        className="settings-btn secondary"
                                        style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                        onClick={handleCopyCertbot}
                                    >
                                        {copiedCertbot ? 'Скопировано!' : 'Копировать'}
                                    </button>
                                </div>
                            </div>

                            {/* Config Editor */}
                            <div className="form-field-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label className="form-field-label" style={{ margin: 0 }}>
                                        <span>Содержимое /etc/nginx/sites-available/zvon</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button 
                                            type="button" 
                                            className="settings-btn secondary" 
                                            style={{ padding: '4px 10px', fontSize: '11px' }}
                                            onClick={handleCopyNginxConfig}
                                        >
                                            {copiedConfig ? 'Скопировано!' : 'Копировать конфиг'}
                                        </button>
                                        <button 
                                            type="button" 
                                            className="settings-btn secondary" 
                                            style={{ padding: '4px 10px', fontSize: '11px' }}
                                            onClick={handleDownloadNginxConfig}
                                        >
                                            Скачать .conf
                                        </button>
                                    </div>
                                </div>
                                <textarea 
                                    className="nginx-config-editor" 
                                    rows={14} 
                                    value={nginxConfigText}
                                    onChange={e => setNginxConfigText(e.target.value)}
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="branding-modal-footer">
                            <button 
                                type="button" 
                                className="settings-btn secondary" 
                                onClick={() => setIsNginxModalOpen(false)}
                            >
                                Закрыть
                            </button>
                            <button 
                                type="button" 
                                className="settings-btn primary" 
                                onClick={handleApplyNginxConfig}
                                disabled={nginxSaving}
                                title={hasServerNginx ? "Записать в /etc/nginx/sites-available/zvon и перезагрузить Nginx" : "Проверить окружение и применить"}
                            >
                                {nginxSaving ? 'Применение...' : hasServerNginx ? 'Применить на сервере' : 'Сохранить / Применить'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminBrandingSettings;
