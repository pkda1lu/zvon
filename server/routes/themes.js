const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const Theme = require('../models/Theme');

/**
 * Только свои темы.
 *
 * Раньше сюда же попадали все темы с isPublic — и чужие вперемешку со своими
 * оказывались в списке «мои темы», где их можно было удалить (точнее, нельзя:
 * удаление проверяет владельца, и кнопка просто не срабатывала). Общий список
 * теперь живёт отдельно, в GET /public.
 */
router.get('/', auth, async (req, res) => {
  try {
    const themes = await Theme.find({ creator: req.user._id }).sort({ createdAt: -1 });
    res.json(themes);
  } catch (err) {
    console.error('[themes] свои темы:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Общий список — только прошедшие модерацию и не заблокированные.
 *
 * Проверка стоит на выборке, а не на клиенте: иначе достаточно посмотреть
 * ответ, чтобы увидеть темы, которые ещё никто не проверял.
 */
router.get('/public', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = { isPublished: true, isBlocked: { $ne: true } };
    if (q) {
      // Экранируем спецсимволы посимвольно: строка приходит от пользователя,
      // а регулярное выражение из неё строится напрямую.
      const SPECIAL = '.*+?^${}()|[]\\';
      const safe = Array.from(q).map(c => SPECIAL.includes(c) ? '\\' + c : c).join('');
      filter.name = new RegExp(safe, 'i');
    }

    const themes = await Theme.find(filter)
      .populate('creator', 'username displayName avatar')
      .sort({ installs: -1, createdAt: -1 })
      .limit(60);

    res.json(themes);
  } catch (err) {
    console.error('[themes] общий список:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Фон для темы: загрузка файла с устройства.
 *
 * Раньше фон задавался только ссылкой — то есть картинка должна была где-то
 * лежать, и при её удалении тема ломалась у всех, кто её применил.
 *
 * Формат проверяет middleware/upload: разрешены jpg, png, gif, webp и svg.
 * Анимированные gif проходят как есть — отдельной обработки им не нужно.
 */
router.post('/background', auth, (req, res, next) => {
  upload.single('background')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Не удалось загрузить файл' });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Файл не получен' });
  res.json({ url: `/api/uploads/${req.file.filename}` });
});

// @route   POST /api/themes
// @desc    Create a new theme
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      theme,
      customColors,
      customBackground,
      backgroundDim,
      backgroundBlur,
      messageSpacing,
      groupSpacing,
      interfaceScale,
      isPublic
    } = req.body;

    const newTheme = new Theme({
      name,
      creator: req.user.id,
      theme,
      customColors,
      customBackground,
      backgroundDim,
      backgroundBlur,
      messageSpacing,
      groupSpacing,
      interfaceScale,
      isPublic
    });

    /*
     * Пожелание опубликовать переводит тему в очередь проверки, но не
     * публикует. Ставим здесь, а не доверяем клиенту: поле isPublished
     * приходило бы в теле запроса, и опубликовать что угодно можно было бы
     * одним запросом мимо интерфейса.
     */
    if (isPublic) {
      newTheme.moderationStatus = 'pending';
      newTheme.isPublished = false;
    }

    const themeObj = await newTheme.save();
    res.json(themeObj);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/themes/:id
// @desc    Update a theme
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    let theme = await Theme.findById(req.params.id);

    if (!theme) return res.status(404).json({ msg: 'Theme not found' });

    // Make sure user owns theme
    if (theme.creator.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    /*
     * Поля состояния проверки правкой не задаются. Раньше в $set уходило всё
     * тело запроса целиком, и достаточно было передать isPublished: true,
     * чтобы тема оказалась в общем списке без всякой модерации.
     */
    const ALLOWED = [
      'name', 'theme', 'customColors', 'customBackground', 'backgroundDim',
      'backgroundBlur', 'messageSpacing', 'groupSpacing', 'interfaceScale',
    ];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    // Изменённая опубликованная тема уходит на повторную проверку: иначе
    // одобряли бы одно оформление, а показывали другое.
    if (theme.isPublished && Object.keys(update).length > 0) {
      update.moderationStatus = 'pending';
      update.isPublished = false;
    }

    theme = await Theme.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    res.json(theme);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/themes/:id
// @desc    Delete a theme
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const theme = await Theme.findById(req.params.id);

    if (!theme) return res.status(404).json({ msg: 'Theme not found' });

    // Make sure user owns theme
    if (theme.creator.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await Theme.findByIdAndDelete(req.params.id);

    res.json({ msg: 'Theme removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * Отправить тему на проверку либо снять её с публикации.
 *
 * Отдельным обработчиком, а не полем при правке: публикация — действие, у
 * которого своё состояние и свои последствия, и смешивать его с изменением
 * цвета не стоит.
 */
router.post('/:id/publish', auth, async (req, res) => {
  try {
    const { publish } = req.body || {};
    const theme = await Theme.findById(req.params.id);
    if (!theme) return res.status(404).json({ message: 'Тема не найдена' });
    if (theme.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Это не ваша тема' });
    }

    if (publish) {
      if (theme.isBlocked) {
        return res.status(403).json({ message: 'Тема заблокирована модерацией' });
      }
      theme.isPublic = true;
      theme.moderationStatus = 'pending';
      theme.isPublished = false;
      theme.moderationReason = null;
    } else {
      theme.isPublic = false;
      theme.moderationStatus = 'draft';
      theme.isPublished = false;
    }

    await theme.save();
    res.json(theme);
  } catch (err) {
    console.error('[themes] публикация:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Счётчик применений — по нему сортируется общий список.
 *
 * Точечным инкрементом: тему применяют часто и одновременно, а чтение с
 * последующей записью теряло бы часть значений.
 */
router.post('/:id/install', auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Неверный идентификатор' });
    }
    await Theme.updateOne(
      { _id: req.params.id, isPublished: true },
      { $inc: { installs: 1 } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[themes] счётчик применений:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
