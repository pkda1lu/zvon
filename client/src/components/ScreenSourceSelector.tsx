import React, { useState, useEffect } from 'react';
import './ScreenSourceSelector.css';

export interface ScreenSource {
    id: string;
    name: string;
    thumbnail?: string;
    display_id?: string;
    quality?: {
        resolution: '480p' | '720p' | '1080p' | '1440p' | '4k' | 'original';
        frameRate: 15 | 30 | 60;
    };
}

interface ScreenSourceSelectorProps {
    onSelect: (source: ScreenSource | null) => void;
    onCancel: () => void;
}

const ScreenSourceSelector: React.FC<ScreenSourceSelectorProps> = ({ onSelect, onCancel }) => {
    const [sources, setSources] = useState<ScreenSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSource, setSelectedSource] = useState<ScreenSource | null>(null);
    const [activeTab, setActiveTab] = useState<'screens' | 'applications'>('applications');
    const [resolution, setResolution] = useState<'480p' | '720p' | '1080p' | '1440p' | '4k' | 'original'>('720p');
    const [frameRate, setFrameRate] = useState<15 | 30 | 60>(30);

    useEffect(() => {
        loadSources();
    }, []);

    const loadSources = async () => {
        try {
            setLoading(true);
            const { getElectronAPI, isElectron } = await import('../utils/electron');

            if (!isElectron()) {
                onSelect(null);
                return;
            }

            const electronAPI = getElectronAPI();
            if (!electronAPI) {
                onSelect(null);
                return;
            }

            let sourcesList: ScreenSource[] = [];

            if (electronAPI.desktopCapturer && typeof electronAPI.desktopCapturer.getSources === 'function') {
                try {
                    sourcesList = await electronAPI.desktopCapturer.getSources({
                        types: ['window', 'screen'],
                        thumbnailSize: { width: 300, height: 200 }
                    });
                } catch (error) {
                    console.error('Error getting sources via desktopCapturer:', error);
                }
            }

            if (sourcesList.length === 0 && electronAPI.ipc && typeof electronAPI.ipc.invoke === 'function') {
                try {
                    sourcesList = await electronAPI.ipc.invoke('get-desktop-sources', {
                        types: ['window', 'screen'],
                        thumbnailSize: { width: 300, height: 200 }
                    });
                } catch (error) {
                    console.error('Error getting sources via IPC:', error);
                }
            }

            if (sourcesList.length === 0) {
                onSelect(null);
                return;
            }

            // Filter out system/invisible windows
            const filteredSources = sourcesList.filter(source => {
                const name = source.name.toLowerCase();
                // Filter out Nvidia Geforce Overlay and other technical windows
                if (name.includes('nvidia geforce overlay')) return false;
                if (name.includes('geforce experience')) return false;
                if (name === 'task manager') return false;
                if (name === '') return false;
                return true;
            });

            setSources(filteredSources);

            // Set initial active tab based on what's available
            const hasWindows = filteredSources.some(s => s.id.startsWith('window:'));
            if (!hasWindows) setActiveTab('screens');

        } catch (error) {
            console.error('Error loading sources:', error);
            onSelect(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = () => {
        if (selectedSource) {
            onSelect({
                ...selectedSource,
                quality: {
                    resolution,
                    frameRate
                }
            });
        } else {
            onSelect(null);
        }
    };

    if (loading) {
        return (
            <div className="screen-source-selector-overlay">
                <div className="screen-source-selector-modal">
                    <div className="screen-source-selector-header">
                        <h2>Демонстрация экрана</h2>
                    </div>
                    <div className="screen-source-selector-loading">
                        <div className="loading-spinner"></div>
                        <p>Поиск окон и экранов...</p>
                    </div>
                </div>
            </div>
        );
    }

    const applicationSources = sources.filter(s => s.id.startsWith('window:'));
    const screenSources = sources.filter(s => s.id.startsWith('screen:'));
    const displaySources = activeTab === 'applications' ? applicationSources : screenSources;

    return (
        <div className="screen-source-selector-overlay" onClick={onCancel}>
            <div className="screen-source-selector-modal" onClick={(e) => e.stopPropagation()}>
                <div className="screen-source-selector-header">
                    <h2>Демонстрация экрана</h2>
                    <button className="close-button" onClick={onCancel}>×</button>
                </div>

                <div className="screen-source-tabs">
                    <button
                        className={`tab-button ${activeTab === 'applications' ? 'active' : ''}`}
                        onClick={() => setActiveTab('applications')}
                    >
                        Приложения
                    </button>
                    <button
                        className={`tab-button ${activeTab === 'screens' ? 'active' : ''}`}
                        onClick={() => setActiveTab('screens')}
                    >
                        Экраны
                    </button>
                </div>

                <div className="screen-quality-settings">
                    <div className="quality-section">
                        <span className="quality-label">Разрешение</span>
                        <div className="quality-options">
                            {(['480p', '720p', '1080p', '1440p', '4k', 'original'] as const).map((res) => (
                                <button
                                    key={res}
                                    className={`quality-option ${resolution === res ? 'active' : ''}`}
                                    onClick={() => setResolution(res)}
                                >
                                    {res === 'original' ? 'Оригинал' : res.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="quality-section">
                        <span className="quality-label">Частота кадров</span>
                        <div className="quality-options">
                            {([15, 30, 60] as const).map((fps) => (
                                <button
                                    key={fps}
                                    className={`quality-option ${frameRate === fps ? 'active' : ''}`}
                                    onClick={() => setFrameRate(fps)}
                                >
                                    {fps}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="screen-source-selector-content">
                    {displaySources.length > 0 ? (
                        <div className="sources-grid">
                            {displaySources.map((source) => (
                                <div
                                    key={source.id}
                                    className={`source-item ${selectedSource?.id === source.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedSource(source)}
                                    onDoubleClick={handleSelect}
                                >
                                    <div className="source-thumbnail-container">
                                        {source.thumbnail ? (
                                            <img
                                                src={typeof source.thumbnail === 'string' ? source.thumbnail : (source.thumbnail as any).toDataURL?.()}
                                                alt={source.name}
                                                className="source-thumbnail"
                                            />
                                        ) : (
                                            <div className="source-thumbnail-placeholder">
                                                {activeTab === 'screens' ? '🖥️' : '🪟'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="source-info">
                                        <div className="source-name" title={source.name}>
                                            {source.name}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-sources">
                            Источники не найдены
                        </div>
                    )}
                </div>
                <div className="screen-source-selector-footer">
                    <button className="cancel-button" onClick={onCancel}>
                        Отмена
                    </button>
                    <button
                        className="select-button"
                        onClick={handleSelect}
                        disabled={!selectedSource}
                    >
                        Поделиться
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreenSourceSelector;

