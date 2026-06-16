import React from 'react';
import { useChatSettings } from '../../contexts/ChatSettingsContext';
import { useAppearance } from '../../contexts/AppearanceContext';
import { ChoiceGroup, RangeSlider, SettingsToggle } from './SettingsUI';

const ChatSettings: React.FC = () => {
    const { 
        displayMode, setDisplayMode,
        showPreview, setShowPreview,
        autoPlayGif, setAutoPlayGif,
        highlightMentions, setHighlightMentions,
        emojiAutocomplete, setEmojiAutocomplete,
        showHoverBar, setShowHoverBar,
        textToSpeech, setTextToSpeech
    } = useChatSettings();

    const { 
        messageSpacing, setMessageSpacing,
        groupSpacing, setGroupSpacing
    } = useAppearance();

    const displayOptions = [
        { value: 'cozy', label: 'Уютный' },
        { value: 'compact', label: 'Компактный' },
        { value: 'light', label: 'Легкий' }
    ];

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Чаты</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Отображение чата</h3>
                <p className="settings-description">Выберите, как будут выглядеть сообщения в каналах.</p>
                <ChoiceGroup 
                    options={displayOptions}
                    value={displayMode}
                    onChange={(val) => setDisplayMode(val as any)}
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Размеры и отступы</h3>
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Отступ сообщений</h3>
                        <p>Настройте вертикальное расстояние между сообщениями.</p>
                    </div>
                    <RangeSlider value={messageSpacing} min={0} max={24} unit="px" onChange={setMessageSpacing} />
                </div>
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Разрыв групп</h3>
                        <p>Расстояние между сообщениями от разных пользователей.</p>
                    </div>
                    <RangeSlider value={groupSpacing} min={0} max={48} unit="px" onChange={setGroupSpacing} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Предпросмотр контента</h3>
                        <p>Показывать предпросмотр ссылок, изображений и видео прямо в чате.</p>
                    </div>
                    <SettingsToggle checked={showPreview} onChange={setShowPreview} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автовоспроизведение GIF</h3>
                        <p>Автоматически проигрывать анимации при появлении в поле зрения.</p>
                    </div>
                    <SettingsToggle checked={autoPlayGif} onChange={setAutoPlayGif} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Подсветка упоминаний</h3>
                        <p>Выделять сообщения цветом, если в них упомянули вас или вашу роль.</p>
                    </div>
                    <SettingsToggle checked={highlightMentions} onChange={setHighlightMentions} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автозаполнение эмодзи</h3>
                        <p>Показывать меню подсказок при вводе ":" в поле ввода сообщения.</p>
                    </div>
                    <SettingsToggle checked={emojiAutocomplete} onChange={setEmojiAutocomplete} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Панель действий при наведении</h3>
                        <p>Отображать быстрые реакции и меню управления при наведении на сообщение.</p>
                    </div>
                    <SettingsToggle checked={showHoverBar} onChange={setShowHoverBar} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Текст в речь (TTS)</h3>
                        <p>Разрешить воспроизведение текстовых сообщений синтезатором голоса.</p>
                    </div>
                    <SettingsToggle checked={textToSpeech} onChange={setTextToSpeech} />
                </div>
            </div>
        </div>
    );
};

export default ChatSettings;
