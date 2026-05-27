const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MiniApp = require('../models/MiniApp');
const auth = require('../middleware/auth');

// Get all published bots and mini-apps
router.get('/', auth, async (req, res) => {
    try {
        const bots = await User.find({
                isBot: true,
                isPublished: true,
                botIsBlocked: { $ne: true },
                $or: [{ botModerationStatus: 'approved' }, { botModerationStatus: { $exists: false } }],
            })
            .select('username bio avatar banner createdAt');

        const miniApps = await MiniApp.find({
                isPublished: true,
                isBlocked: { $ne: true },
                $or: [
                    { moderationStatus: 'approved' },
                    { isSystem: true },                 // system apps bypass review
                    { moderationStatus: { $exists: false } },
                ],
            })
            .select('name url description avatar banner createdAt isSystem');

        res.json({ bots, miniApps });
    } catch (error) {
        console.error('Showcase fetch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
