import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Server } from '../types';
import { getFullUrl } from '../utils/avatar';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import { getRecentReactions, isCustomEmoji } from '../utils/recentReactions';
import './EmojiPicker.css';

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    server?: Server;
    /** Откуда «вырастает» окно (зависит от того, где оно встало). */
    transformOrigin?: string;
    /** Показывать недавние реакции. По умолчанию — да. */
    showRecent?: boolean;
}

/*
 * Эмодзи со словами для поиска (рус. и англ.). Раньше поиск делал
 * emoji.includes(текст) — символ эмодзи не содержит слов, и поиск не находил
 * ничего, кроме вставленного самого эмодзи.
 */
const EMOJI_LIST: Array<[string, string]> = [
    ['😀', 'улыбка смех радость grin smile happy'], ['😃', 'улыбка радость smiley happy'], ['😄', 'улыбка смех smile laugh'],
    ['😁', 'улыбка зубы grin beam'], ['😅', 'пот неловко sweat smile'], ['😂', 'смех слёзы ржу joy laugh tears lol'],
    ['🤣', 'ржу катаюсь смех rofl laugh'], ['😊', 'улыбка мило blush smile'], ['😇', 'ангел нимб angel innocent'],
    ['🙂', 'улыбка slight smile'], ['🙃', 'наоборот перевёрнутый upside down'], ['😉', 'подмигивание wink'],
    ['😌', 'облегчение спокойно relieved'], ['😍', 'влюблён сердце глаза love heart eyes'], ['🥰', 'любовь сердечки love hearts'],
    ['😘', 'поцелуй kiss'], ['😗', 'поцелуй kiss'], ['😙', 'поцелуй kiss'], ['😚', 'поцелуй kiss'],
    ['😋', 'вкусно язык yum tasty'], ['😛', 'язык tongue'], ['😝', 'язык дразнит tongue'], ['😜', 'язык подмигивание tongue wink'],
    ['🤪', 'безумный crazy zany'], ['🤨', 'бровь сомнение raised eyebrow'], ['🧐', 'монокль изучаю monocle'],
    ['🤓', 'ботаник очки nerd'], ['😎', 'круто очки cool sunglasses'], ['🤩', 'звёзды восторг star struck'],
    ['🥳', 'праздник вечеринка party'], ['😏', 'ухмылка smirk'], ['😒', 'недоволен unamused'],
    ['😞', 'разочарован disappointed'], ['😔', 'грусть pensive'], ['😟', 'беспокойство worried'],
    ['😕', 'растерян confused'], ['🙁', 'грусть frown'], ['☹️', 'грусть frown'], ['😣', 'упорство persevere'],
    ['😖', 'смятение confounded'], ['😫', 'устал tired'], ['😩', 'изнемог weary'], ['🥺', 'умоляю пожалуйста pleading'],
    ['😢', 'плачу слеза cry sad'], ['😭', 'рыдаю плачу sob cry'], ['😤', 'пар злость triumph huff'],
    ['😠', 'злой angry'], ['😡', 'ярость злой rage angry'], ['🤬', 'ругань мат cursing'], ['🤯', 'взрыв мозга mind blown'],
    ['😳', 'смущение flushed'], ['🥵', 'жарко hot'], ['🥶', 'холодно cold freezing'], ['😱', 'ужас крик scream'],
    ['😨', 'страх fearful'], ['😰', 'тревога anxious'], ['😥', 'разочарован sad relieved'], ['😓', 'пот downcast sweat'],
    ['🤗', 'обнимаю hug'], ['🤔', 'думаю хм thinking'], ['🤭', 'ой прикрыл рот oops'], ['🤫', 'тихо тсс shush'],
    ['🤥', 'враньё лжец lying'], ['😶', 'без слов no mouth'], ['😐', 'нейтрально neutral'], ['😑', 'без эмоций expressionless'],
    ['😬', 'неловко grimace'], ['🙄', 'закатил глаза eye roll'], ['😯', 'удивлён hushed'], ['😦', 'хмурый frowning'],
    ['😧', 'страдание anguished'], ['😮', 'удивление open mouth wow'], ['😲', 'изумление astonished'], ['🥱', 'зеваю скучно yawn'],
    ['😴', 'сплю сон sleep'], ['🤤', 'слюни drool'], ['😪', 'сонный sleepy'], ['😵', 'головокружение dizzy'],
    ['🤐', 'молчу zip'], ['🥴', 'пьяный woozy'], ['🤢', 'тошнит nausea'], ['🤮', 'рвота vomit'],
    ['🤧', 'чихаю sneeze'], ['😷', 'маска болею mask sick'], ['🤒', 'температура болею sick'], ['🤕', 'травма бинт hurt'],
    ['🤑', 'деньги money'], ['🤠', 'ковбой cowboy'], ['😈', 'дьявол чёрт devil'], ['👿', 'демон imp'],
    ['👹', 'огр ogre'], ['👺', 'гоблин goblin'], ['🤡', 'клоун clown'], ['💩', 'какашка poop'],
    ['👻', 'призрак ghost'], ['💀', 'череп умер skull dead'], ['☠️', 'череп кости skull'], ['👽', 'пришелец alien'],
    ['👾', 'монстр игра game alien'], ['🤖', 'робот robot bot'], ['🎃', 'тыква хеллоуин pumpkin'],
    ['😺', 'кот улыбка cat'], ['😸', 'кот cat'], ['😹', 'кот смех cat joy'], ['😻', 'кот любовь cat love'],
    ['😼', 'кот ухмылка cat'], ['😽', 'кот поцелуй cat kiss'], ['🙀', 'кот ужас cat'], ['😿', 'кот плачет cat cry'], ['😾', 'кот злой cat'],
    ['❤️', 'сердце любовь heart love red'], ['🧡', 'сердце оранжевое heart'], ['💛', 'сердце жёлтое heart'],
    ['💚', 'сердце зелёное heart'], ['💙', 'сердце синее heart'], ['💜', 'сердце фиолетовое heart'], ['🖤', 'сердце чёрное heart'],
    ['🤍', 'сердце белое heart'], ['💔', 'разбитое сердце broken heart'], ['💯', 'сто сотка hundred'],
    ['🔥', 'огонь круто fire lit'], ['✨', 'блёстки искры sparkles'], ['⭐', 'звезда star'], ['🎉', 'праздник поздравляю party tada'],
    ['👍', 'лайк класс да палец вверх like thumbs up yes'], ['👎', 'дизлайк нет палец вниз dislike thumbs down no'],
    ['👌', 'окей ок ok'], ['✌️', 'мир победа peace victory'], ['🤞', 'удачи пальцы fingers crossed'],
    ['🤝', 'рукопожатие договорились handshake deal'], ['👏', 'аплодисменты хлоп clap'], ['🙌', 'ура руки вверх raise hands'],
    ['🙏', 'спасибо пожалуйста молюсь pray thanks please'], ['💪', 'сила мышцы strong muscle'], ['👀', 'глаза смотрю eyes look'],
    ['👋', 'привет пока машу wave hi bye'], ['🫡', 'салют есть salute'], ['🤷', 'не знаю пожимаю плечами shrug'],
    ['🤦', 'фейспалм facepalm'], ['✅', 'готово галочка check done'], ['❌', 'нет крест cross no'], ['❓', 'вопрос question'],
    ['❗', 'восклицание внимание exclamation'], ['🎮', 'игра геймпад game'], ['🎵', 'музыка нота music'], ['☕', 'кофе coffee'],
    ['🍕', 'пицца pizza'], ['🍺', 'пиво beer'], ['🚀', 'ракета rocket'], ['🏆', 'кубок победа trophy'], ['💤', 'сон zzz sleep'],
];

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, server, transformOrigin = 'bottom right', showRecent = true }) => {
    const [search, setSearch] = useState('');
    const q = search.trim().toLowerCase();

    const serverEmojis = server?.emojis || [];
    const recent = useMemo(() => showRecent ? getRecentReactions(server?._id) : [], [showRecent, server?._id]);

    const filteredEmojis = useMemo(() => q
        ? EMOJI_LIST.filter(([e, words]) => e.includes(search.trim()) || words.split(' ').some(w => w.startsWith(q)))
        : EMOJI_LIST, [q, search]);
    const filteredServer = useMemo(() => q
        ? serverEmojis.filter(e => e.name.toLowerCase().includes(q))
        : serverEmojis, [q, serverEmojis]);

    const renderCustom = (url: string, name: string, key: string) => (
        <button key={key} className="emoji-item custom" onClick={() => onSelect(url)} title={`:${name}:`}>
            <img src={getFullUrl(url) || ''} alt={name} />
        </button>
    );

    const nothing = q && filteredEmojis.length === 0 && filteredServer.length === 0;

    return (
        <motion.div
            className="emoji-picker glass-panel-base"
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            transition={popoverTransition}
            style={{ transformOrigin }}
        >
            <div className="emoji-picker-search">
                <input
                    type="text"
                    placeholder="Поиск: смех, огонь, heart…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                />
            </div>
            <div className="emoji-picker-scroll">
                {!q && recent.length > 0 && (
                    <div className="emoji-category">
                        <div className="category-title">НЕДАВНИЕ</div>
                        <div className="emoji-grid">
                            {recent.map(e => isCustomEmoji(e)
                                ? renderCustom(e, 'эмодзи', `r-${e}`)
                                : <button key={`r-${e}`} className="emoji-item" onClick={() => onSelect(e)}>{e}</button>)}
                        </div>
                    </div>
                )}

                {filteredServer.length > 0 && (
                    <div className="emoji-category">
                        <div className="category-title">ЭМОДЗИ СЕРВЕРА</div>
                        <div className="emoji-grid">
                            {filteredServer.map(emoji => renderCustom(emoji.url, emoji.name, emoji.id))}
                        </div>
                    </div>
                )}

                {filteredEmojis.length > 0 && (
                    <div className="emoji-category">
                        <div className="category-title">{q ? 'НАЙДЕНО' : 'ВСЕ ЭМОДЗИ'}</div>
                        <div className="emoji-grid">
                            {filteredEmojis.map(([emoji, words]) => (
                                <button
                                    key={emoji}
                                    className="emoji-item"
                                    onClick={() => onSelect(emoji)}
                                    title={words.split(' ')[0]}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {nothing && <div className="emoji-picker-empty">Ничего не нашлось</div>}
            </div>
        </motion.div>
    );
};

export default EmojiPicker;
