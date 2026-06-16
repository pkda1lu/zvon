const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Theme = require('../models/Theme');

// @route   GET /api/themes
// @desc    Get all public themes and user's private themes
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const themes = await Theme.find({
      $or: [
        { isPublic: true },
        { creator: req.user.id }
      ]
    }).sort({ createdAt: -1 });
    res.json(themes);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
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

    theme = await Theme.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
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

module.exports = router;
