import React, { useState, useEffect } from 'react';
import './ScreenSourceSelector.css';

export interface ScreenSource {
    id: string;
    name: string;
    thumbnail?: string;
    display_id?: string;
}

interface ScreenSourceSelectorProps {
    onSelect: (source: ScreenSource | null) => void;
    onCancel: () => void;
}

const ScreenSourceSelector: React.FC<ScreenSourceSelectorProps> = ({ onSelect, onCancel }) => {
    const [sources, setSources] = useState<ScreenSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSource, setSelectedSource] = useState<ScreenSource | null>(null);

    useEffect(() => {
        loadSources();
    }, []);

    const loadSources = async () => {
        try {
            setLoading(true);
            const { getElectronAPI, isElectron } = await import('../utils/electron');
            
            if (!isElectron()) {
                // For non-Electron, use standard getDisplayMedia (it will show native picker)
                onSelect(null); // null means use native picker
                return;
            }

            const electronAPI = getElectronAPI();
            if (!electronAPI) {
                console.error('Electron API not available');
                onSelect(null);
                return;
            }

            let sourcesList: ScreenSource[] = [];
            
            // Try to get sources via desktopCapturer
            if (electronAPI.desktopCapturer && typeof electronAPI.desktopCapturer.getSources === 'function') {
                try {
                    sourcesList = await electronAPI.desktopCapturer.getSources({
                        types: ['window', 'screen'],
                        thumbnailSize: { width: 200, height: 150 }
                    });
                } catch (error) {
                    console.error('Error getting sources via desktopCapturer:', error);
                }
            }
            
            // Fallback to IPC
            if (sourcesList.length === 0 && electronAPI.ipc && typeof electronAPI.ipc.invoke === 'function') {
                try {
                    sourcesList = await electronAPI.ipc.invoke('get-desktop-sources', {
                        types: ['window', 'screen'],
                        thumbnailSize: { width: 200, height: 150 }
                    });
                } catch (error) {
                    console.error('Error getting sources via IPC:', error);
                }
            }

            if (sourcesList.length === 0) {
                console.warn('No sources available, using native picker');
                onSelect(null);
                return;
            }

            // Sort sources: screens first, then windows
            const sortedSources = sourcesList.sort((a, b) => {
                const aIsScreen = a.id.startsWith('screen:');
                const bIsScreen = b.id.startsWith('screen:');
                if (aIsScreen && !bIsScreen) return -1;
                if (!aIsScreen && bIsScreen) return 1;
                return a.name.localeCompare(b.name);
            });

            setSources(sortedSources);
        } catch (error) {
            console.error('Error loading sources:', error);
            onSelect(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = () => {
        if (selectedSource) {
            onSelect(selectedSource);
        } else {
            // Use native picker
            onSelect(null);
        }
    };

    if (loading) {
        return (
            <div className="screen-source-selector-overlay">
                <div className="screen-source-selector-modal">
                    <div className="screen-source-selector-header">
                        <h2>Выберите источник для демонстрации</h2>
                    </div>
                    <div className="screen-source-selector-loading">
                        <div className="loading-spinner"></div>
                        <p>Загрузка доступных источников...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (sources.length === 0) {
        // No sources available, use native picker
        handleSelect();
        return null;
    }

    return (
        <div className="screen-source-selector-overlay" onClick={onCancel}>
            <div className="screen-source-selector-modal" onClick={(e) => e.stopPropagation()}>
                <div className="screen-source-selector-header">
                    <h2>Выберите источник для демонстрации</h2>
                    <button className="close-button" onClick={onCancel}>×</button>
                </div>
                <div className="screen-source-selector-content">
                    <div className="sources-grid">
                        {sources.map((source) => {
                            const isScreen = source.id.startsWith('screen:');
                            return (
                                <div
                                    key={source.id}
                                    className={`source-item ${selectedSource?.id === source.id ? 'selected' : ''} ${isScreen ? 'screen-source' : 'window-source'}`}
                                    onClick={() => setSelectedSource(source)}
                                >
                                    {source.thumbnail && (
                                        <img 
                                            src={
                                                typeof source.thumbnail === 'string' 
                                                    ? source.thumbnail 
                                                    : (source.thumbnail as any).toDataURL 
                                                        ? (source.thumbnail as any).toDataURL() 
                                                        : ''
                                            } 
                                            alt={source.name}
                                            className="source-thumbnail"
                                            onError={(e) => {
                                                // Hide thumbnail if it fails to load
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    )}
                                    <div className="source-info">
                                        <div className="source-icon">
                                            {isScreen ? '🖥️' : '🪟'}
                                        </div>
                                        <div className="source-name" title={source.name}>
                                            {source.name}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="screen-source-selector-footer">
                    <button className="cancel-button" onClick={onCancel}>
                        Отмена
                    </button>
                    <button 
                        className="select-button" 
                        onClick={handleSelect}
                        disabled={!selectedSource && sources.length > 0}
                    >
                        {selectedSource ? 'Продолжить' : 'Использовать системный выбор'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreenSourceSelector;

