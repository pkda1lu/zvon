import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVoice, useVoiceInputLevel } from '../../contexts/VoiceContext';
import { CustomSelect, SettingsToggle, RangeSlider, ChoiceGroup } from './SettingsUI';
import { SpeakerIcon, MicIcon, CameraIcon, VideoIcon } from '../../components/Icons';
import { getBrand } from '../../utils/branding';
import { setSpatialEnabled } from '../../utils/spatialAudio';

// Separate component for the sensitivity visualizer to isolate high-frequency re-renders
// Настройка хранится локально: это свойство воспроизведения на конкретном
// устройстве, а не часть профиля — на телефоне и в наушниках уместны разные
// предпочтения.
const SPATIAL_KEY = 'spatialAudioEnabled';

const SensitivityVisualizer: React.FC<{ 
    inputSensitivity: number, 
    isAutomaticSensitivity: boolean 
}> = ({ inputSensitivity, isAutomaticSensitivity }) => {
    // Отдельный контекст уровня: обновляется 25 раз в секунду и теперь
    // перерисовывает только этот индикатор, а не всё, что слушает голос.
    const currentInputLevel = useVoiceInputLevel();

    const barColor = (currentInputLevel > (isAutomaticSensitivity ? -60 : inputSensitivity)) 
        ? '#00ffa3' 
        : '#ff3b30';

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
                    backgroundColor: barColor,
                    boxShadow: `0 0 10px ${barColor}`
                }}
            />
        </div>
    );
};

const CameraPreview: React.FC<{ deviceId: string }> = ({ deviceId }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
  
    useEffect(() => {
      let stream: MediaStream | null = null;
  
      const startPreview = async () => {
        try {
          setError(null);
          stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId === 'default' ? true : { deviceId: { exact: deviceId } }
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err: any) {
          console.error("Camera preview error:", err);
          setError("Не удалось получить доступ к камере или устройство занято");
        }
      };
  
      startPreview();
  
      return () => {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      };
    }, [deviceId]);
  
    return (
      <div className="camera-preview-container" style={{
          marginTop: '16px',
          width: '100%',
          aspectRatio: '16/9',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--glass-border)'
      }}>
        {error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--text-dim)' }}>
            <CameraIcon size={48} />
            <span style={{ fontSize: '14px', textAlign: 'center', padding: '0 20px' }}>{error}</span>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
    );
  };

const VoiceSettings: React.FC = () => {
    const brand = getBrand();
    const {
        inputDevices,
        outputDevices,
        videoDevices,
        selectedInputDeviceId, setSelectedInputDeviceId,
        selectedOutputDeviceId, setSelectedOutputDeviceId,
        selectedVideoDeviceId, setSelectedVideoDeviceId,
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

    // Пространственный звук. Значение применяется к уже работающим узлам сразу,
    // без переподключения к комнате.
    const [spatialAudio, setSpatialAudio] = useState(() => localStorage.getItem(SPATIAL_KEY) !== 'false');
    useEffect(() => { setSpatialEnabled(spatialAudio); }, [spatialAudio]);
    const handleSpatialChange = (on: boolean) => {
        localStorage.setItem(SPATIAL_KEY, String(on));
        setSpatialAudio(on);
    };

    // Only start test stream if NOT already in a call
    useEffect(() => {
        if (!isConnected) {
            startTestStream();
            return () => stopTestStream();
        }
    }, [isConnected, startTestStream, stopTestStream]);

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

    const videoOptions = useMemo(() => {
        const opts = videoDevices.map(d => ({
            id: d.deviceId,
            name: d.label || `Камера ${d.deviceId.slice(0, 5)}`,
            iconComponent: <VideoIcon size={18} />
        }));
        if (opts.length === 0) opts.push({ id: 'default', name: 'По умолчанию', iconComponent: <VideoIcon size={18} /> });
        return opts;
    }, [videoDevices]);

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Голос и видео</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Настройки аудио</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                    <div>
                        <label className="settings-label" style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-dim)' }}>Устройство ввода</label>
                        <CustomSelect options={inputOptions} value={selectedInputDeviceId} onChange={setSelectedInputDeviceId} />
                    </div>
                    <div>
                        <label className="settings-label" style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-dim)' }}>Устройство вывода</label>
                        <CustomSelect options={outputOptions} value={selectedOutputDeviceId} onChange={setSelectedOutputDeviceId} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Громкость микрофона</span>
                        </div>
                        <RangeSlider 
                            min={0} max={2} step={0.01} 
                            value={inputVolume} 
                            onChange={setInputVolume} 
                            unit="x"
                        />
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Громкость звука</span>
                        </div>
                        <RangeSlider 
                            min={0} max={2} step={0.01} 
                            value={outputVolume} 
                            onChange={setOutputVolume} 
                            unit="x"
                        />
                    </div>
                </div>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Чувствительность и тест</h3>
                
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автоматически определять чувствительность</h3>
                        <p>Позволить {brand.name.toUpperCase()} автоматически настраивать чувствительность нажатия.</p>
                    </div>
                    <SettingsToggle checked={isAutomaticSensitivity} onChange={setIsAutomaticSensitivity} />
                </div>

                <div className={`sensitivity-container ${isAutomaticSensitivity ? 'disabled' : ''}`} style={{ marginTop: '20px' }}>
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
                <h3 className="settings-section-title" style={{marginTop: 0}}>Настройки видео</h3>
                <div style={{ marginBottom: '16px' }}>
                    <label className="settings-label" style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-dim)' }}>Видеокамера</label>
                    <CustomSelect options={videoOptions} value={selectedVideoDeviceId} onChange={setSelectedVideoDeviceId} />
                </div>
                
                {videoDevices.length > 0 && (
                    <CameraPreview deviceId={selectedVideoDeviceId} />
                )}
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Обработка голоса</h3>
                
                <div className="settings-row-text" style={{ marginBottom: '12px' }}>
                    <h3>Шумоподавление</h3>
                    <p>Алгоритм удаления фоновых шумов с микрофона. RNNoise и DeepFilter используют ИИ.</p>
                </div>
                <ChoiceGroup
                    className="full-width"
                    options={[
                        { value: 'none', label: 'Отключено' },
                        { value: 'standard', label: 'Стандартное' },
                        { value: 'rnnoise', label: 'RNNoise' },
                        { value: 'deepfilter', label: 'DeepFilter' },
                    ]}
                    value={noiseSuppressionMode}
                    onChange={(v) => setNoiseSuppressionMode(v as 'none' | 'standard' | 'rnnoise' | 'deepfilter')}
                />

                <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Эхоподавление</h3>
                        <p>Предотвращает возвращение звука из динамиков в микрофон.</p>
                    </div>
                    <SettingsToggle checked={echoCancellation} onChange={setEchoCancellation} />
                </div>

                <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Авто-регулировка усиления</h3>
                        <p>Автоматически выравнивает громкость микрофона.</p>
                    </div>
                    <SettingsToggle checked={autoGainControl} onChange={setAutoGainControl} />
                </div>

                <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Пространственный звук в 3D-комнатах</h3>
                        <p>
                            Голос собеседника звучит с той стороны, где он стоит, и тише на
                            расстоянии. Выключите, если предпочитаете слышать всех одинаково.
                        </p>
                    </div>
                    <SettingsToggle checked={spatialAudio} onChange={handleSpatialChange} />
                </div>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Приглушение других</h3>
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Приглушение участников</h3>
                        <p>Снижает громкость других участников, когда вы говорите.</p>
                    </div>
                    <div style={{ width: '200px' }}>
                        <RangeSlider 
                            min={0} max={100} step={1}
                            value={attenuation} 
                            onChange={setAttenuation} 
                            unit="%"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoiceSettings;

