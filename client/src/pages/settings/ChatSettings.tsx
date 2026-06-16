import React from 'react';
import { useChatSettings } from '../../contexts/ChatSettingsContext';
import { ChoiceGroup, SettingsToggle } from './SettingsUI';

const ChatSettings: React.FC = () => {
    const { 
        displayMode, setDisplayMode,
        showPreview, setShowPreview,
        autoPlayGif, setAutoPlayPlayGif,
        highlightMentions, setHighlightMentions,
        emojiAutocomplete, setEmojiAutocomplete,
        showHoverBar, setShowHoverBar,
        textToSpeech, setTextToSpeech
    } = useChatSettings();

    const displayOptions = [
        { value: 'cozy', label: 'Уютный' },
        { value: 'compact', label: 'Компактный' },
        { value: 'light', label: 'Легкий' }
    ];

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Чаты</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Отображение сообщений</h3>
                <ChoiceGroup 
                    options={displayOptions}
                    value={displayMode}
                    onChange={(val) => setDisplayMode(val as any)}
                />
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Предпросмотр контента</h3>
                        <p>Показывать предпросмотр ссылок и медиафайлов в чате.</p>
                    </div>
                    <SettingsToggle checked={showPreview} onChange={setShowPreview} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автовоспроизведение GIF</h3>
                        <p>Автоматически проигрывать анимации при появлении в чате.</p>
                    </div>
                    <SettingsToggle checked={autoPlayGif} onChange={setAutoPlayPlayGif} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Подсветка упоминаний</h3>
                        <p>Выделять сообщения, в которых упоминается ваш никнейм.</p>
                    </div>
                    <SettingsToggle checked={highlightMentions} onChange={setHighlightMentions} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автозаполнение эмодзи</h3>
                        <p>Предлагать варианты при вводе : в поле сообщения.</p>
                    </div>
                    <SettingsToggle checked={emojiAutocomplete} onChange={setEmojiAutocomplete} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Панель действий при наведении</h3>
                        <p>Показывать быстрые реакции и меню при наведении на сообщение.</p>
                    </div>
                    <SettingsToggle checked={showHoverBar} onChange={setShowHoverBar} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Текст в речь (TTS)</h3>
                        <p>Разрешить воспроизведение текстовых сообщений голосом.</p>
                    </div>
                    <SettingsToggle checked={textToSpeech} onChange={setTextToSpeech} />
                </div>
            </div>
        </div>
    );
};

export default ChatSettings;
