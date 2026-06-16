import React from 'react';
import { useVoice } from '../../contexts/VoiceContext';
import { ChoiceGroup, SettingsToggle, CustomSelect } from './SettingsUI';
import { SpeakerIcon, MicIcon } from '../../components/Icons';

const VoiceSettings: React.FC = () => {
    const { 
        devices,
        inputDevice, setInputDevice,
        outputDevice, setOutputDevice,
        inputVolume, setInputVolume,
        outputVolume, setOutputVolume,
        noiseSuppression, setNoiseSuppression,
        echoCancellation, setEchoCancellation,
        autoGainControl, setAutoGainControl,
        attenuation, setAttenuation
    } = useVoice();

    const inputOptions = devices.filter(d => d.kind === 'audioinput').map(d => ({
        id: d.deviceId,
        name: d.label || `Микрофон ${d.deviceId.slice(0, 5)}`,
        iconComponent: <MicIcon size={18} />
    }));

    const outputOptions = devices.filter(d => d.kind === 'audiooutput').map(d => ({
        id: d.deviceId,
        name: d.label || `Динамик ${d.deviceId.slice(0, 5)}`,
        iconComponent: <SpeakerIcon size={18} />
    }));

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Голос и видео</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Устройство ввода</h3>
                <CustomSelect options={inputOptions} value={inputDevice} onChange={setInputDevice} />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Громкость микрофона</h3>
                <input 
                    type="range" style={{width:'100%'}} 
                    value={inputVolume * 100} 
                    onChange={(e) => setInputVolume(parseInt(e.target.value) / 100)} 
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Устройство вывода</h3>
                <CustomSelect options={outputOptions} value={outputDevice} onChange={setOutputDevice} />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Громкость звука</h3>
                <input 
                    type="range" style={{width:'100%'}} 
                    value={outputVolume * 100} 
                    onChange={(e) => setOutputVolume(parseInt(e.target.value) / 100)} 
                />
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Шумоподавление</h3>
                        <p>Использовать ИИ для удаления фоновых шумов.</p>
                    </div>
                    <SettingsToggle checked={noiseSuppression} onChange={setNoiseSuppression} />
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
                        <h3>Приглушение других (Attenuation)</h3>
                        <p>Снижает громкость других участников, когда вы говорите.</p>
                    </div>
                    <input 
                        type="range" style={{width:'120px'}} 
                        value={attenuation} 
                        onChange={(e) => setAttenuation(parseInt(e.target.value))} 
                    />
                </div>
            </div>
        </div>
    );
};

export default VoiceSettings;
