import React, { useEffect, useMemo } from 'react';
import { useVoice, useVoiceLevels } from '../../contexts/VoiceContext';
import { CustomSelect, SettingsToggle } from './SettingsUI';
import { SpeakerIcon, MicIcon } from '../../components/Icons';

// Separate component for the sensitivity visualizer to isolate high-frequency re-renders
const SensitivityVisualizer: React.FC<{ 
    inputSensitivity: number, 
    isAutomaticSensitivity: boolean 
}> = ({ inputSensitivity, isAutomaticSensitivity }) => {
    const { currentInputLevel = -100 } = useVoiceLevels() || {};

    const barColor = (currentInputLevel > (isAutomaticSensitivity ? -60 : inputSensitivity)) 
        ? 'var(--success)' 
        : 'var(--danger)';

    return (
        <div className="sensitivity-visualizer">
            {!isAutomaticSensitivity && (
                <div
                    className="sensitivity-marker"
                    style={{ left: `${Math.max(0, Math.min(100, inputSensitivity + 100))}%` }}
                />
            )}
            <div
                className="sensitivity-bar-fill"
                style={{
                    width: `${Math.max(0, Math.min(100, currentInputLevel + 100))}%`,
                    backgroundColor: barColor
                }}
            />
        </div>
    );
};

const VoiceSettings: React.FC = () => {
    const { 
        inputDevices,
        outputDevices,
        selectedInputDeviceId, setSelectedInputDeviceId,
        selectedOutputDeviceId, setSelectedOutputDeviceId,
        inputVolume, setInputVolume,
        outputVolume, setOutputVolume,
        noiseSuppressionMode, setNoiseSuppressionMode,
        echoCancellation, setEchoCancellation,
        autoGainControl, setAutoGainControl,
        attenuation, setAttenuation,
        inputSensitivity, setInputSensitivity,
        isAutomaticSensitivity, setIsAutomaticSensitivity,
        startTestStream, stopTestStream,
        isConnected
    } = useVoice();

    // Only start test stream if NOT already in a call
    useEffect(() => {
        if (!isConnected) {
            startTestStream();
            return () => stopTestStream();
        }
    }, [isConnected, startTestStream, stopTestStream]);

    // Memoize options to prevent expensive recalculations during re-renders
    const inputOptions = useMemo(() => {
        const opts = inputDevices.map(d => ({
            id: d.deviceId,
            name: d.label || `Микрофон ${d.deviceId.slice(0, 5)}`,
            iconComponent: <MicIcon size={18} />
        }));
        if (opts.length === 0) opts.push({ id: 'default', name: 'По умолчанию', iconComponent: <MicIcon size={18} /> });
        return opts;
    }, [inputDevices]);

    const outputOptions = useMemo(() => {
        const opts = outputDevices.map(d => ({
            id: d.deviceId,
            name: d.label || `Динамик ${d.deviceId.slice(0, 5)}`,
            iconComponent: <SpeakerIcon size={18} />
        }));
        if (opts.length === 0) opts.push({ id: 'default', name: 'По умолчанию', iconComponent: <SpeakerIcon size={18} /> });
        return opts;
    }, [outputDevices]);

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Голос и видео</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Устройство ввода</h3>
                <CustomSelect options={inputOptions} value={selectedInputDeviceId} onChange={setSelectedInputDeviceId} />
                <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Громкость микрофона</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>{Math.round(inputVolume * 100)}%</span>
                    </div>
                    <input 
                        type="range" style={{width:'100%'}} 
                        min="0" max="2" step="0.01"
                        value={inputVolume} 
                        onChange={(e) => setInputVolume(parseFloat(e.target.value))} 
                    />
                </div>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Устройство вывода</h3>
                <CustomSelect options={outputOptions} value={selectedOutputDeviceId} onChange={setSelectedOutputDeviceId} />
                <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Громкость звука</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>{Math.round(outputVolume * 100)}%</span>
                    </div>
                    <input 
                        type="range" style={{width:'100%'}} 
                        min="0" max="2" step="0.01"
                        value={outputVolume} 
                        onChange={(e) => setOutputVolume(parseFloat(e.target.value))} 
                    />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автоматически определять чувствительность</h3>
                        <p>Позволить ZVON автоматически настраивать чувствительность нажатия.</p>
                    </div>
                    <SettingsToggle checked={isAutomaticSensitivity} onChange={setIsAutomaticSensitivity} />
                </div>

                <div className={`sensitivity-container ${isAutomaticSensitivity ? 'disabled' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Порог срабатывания</span>
                        <span style={{ fontSize: '13px', color: 'var(--primary-neon)', fontWeight: 'bold' }}>{Math.round(inputSensitivity)} dB</span>
                    </div>

                    <SensitivityVisualizer 
                        inputSensitivity={inputSensitivity} 
                        isAutomaticSensitivity={isAutomaticSensitivity} 
                    />

                    <input
                        type="range"
                        min="-100"
                        max="0"
                        step="1"
                        value={inputSensitivity}
                        onChange={(e) => setInputSensitivity(parseFloat(e.target.value))}
                        disabled={isAutomaticSensitivity}
                        className="sensitivity-input-range"
                    />
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
                        <span>-100dB</span>
                        <span>-50dB</span>
                        <span>0dB</span>
                    </div>
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Шумоподавление (ИИ)</h3>
                        <p>Удаление фоновых шумов.</p>
                    </div>
                    <SettingsToggle checked={noiseSuppressionMode !== 'none'} onChange={(val) => setNoiseSuppressionMode(val ? 'rnnoise' : 'none')} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Эхоподавление</h3>
                        <p>Предотвращает возвращение звука из динамиков в микрофон.</p>
                    </div>
                    <SettingsToggle checked={echoCancellation} onChange={setEchoCancellation} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Приглушение других</h3>
                        <p>Снижает громкость других участников на указанный процент, когда вы говорите.</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{attenuation}%</span>
                        <input 
                            type="range" style={{width:'120px'}} 
                            min="0" max="100" step="1"
                            value={attenuation} 
                            onChange={(e) => setAttenuation(parseInt(e.target.value))} 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoiceSettings;
