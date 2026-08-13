const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { logGlobalAction } = require('../utils/globalAuditLogger');

// Create a new bot
router.post('/create', auth, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: 'Bot name is required' });

        const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const trimmedName = name.trim();
        const existingUser = await User.findOne({ username: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') });
        if (existingUser) return res.status(400).json({ message: 'Пользователь или бот с таким именем уже существует' });

        // Generate a unique token
        const botToken = 'bot_' + crypto.randomBytes(32).toString('hex');

        // Create a new User object for the bot
        const botUser = new User({
            username: trimmedName,
            email: `${name.toLowerCase()}_${crypto.randomBytes(4).toString('hex')}@bot.zvon`,
            password: crypto.randomBytes(16).toString('hex'), // Random password, bots login by token
            isBot: true,
            botToken: botToken,
            owner: req.user._id,
            isVerified: true
        });

        await botUser.save();

        await logGlobalAction({
            executorId: req.user._id,
            action: 'BOT_CREATE',
            targetId: botUser._id,
            targetModel: 'User',
            details: { username: botUser.username }
        });

        res.status(201).json({
            message: 'Бот успешно создан',
            bot: {
                id: botUser._id,
                username: botUser.username,
                token: botToken
            }
        });
    } catch (error) {
        console.error('Bot creation error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's bots
router.get('/my', auth, async (req, res) => {
    try {
        const bots = await User.find({ owner: req.user._id, isBot: true }).select('username botToken createdAt bio avatar banner isPublished botModerationStatus botModerationReason botIsBlocked botBlockReason primaryServer');
        res.json(bots);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit bot for marketplace review / un-publish.
// Publishing now goes through moderator approval. Users can:
//  - submit a draft for review  → status becomes 'pending'
//  - withdraw a pending request   → status becomes 'draft'
//  - unpublish an approved bot    → status becomes 'draft', isPublished=false
router.patch('/:id/publish', auth, async (req, res) => {
    try {
        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        if (bot.botIsBlocked) {
            return res.status(403).json({ message: 'Бот заблокирован модерацией: ' + (bot.botBlockReason || 'без указания причины') });
        }

        let message;
        if (bot.isPublished) {
            bot.isPublished = false;
            bot.botModerationStatus = 'draft';
            message = 'Бот снят с витрины';
        } else if (bot.botModerationStatus === 'pending') {
            bot.botModerationStatus = 'draft';
            message = 'Заявка на публикацию отозвана';
        } else {
            bot.botModerationStatus = 'pending';
            bot.botModerationReason = null;
            bot.botModeratedAt = null;
            bot.botModeratedBy = null;
            message = 'Бот отправлен на модерацию';
        }
        await bot.save();
        res.json({ message, isPublished: bot.isPublished, moderationStatus: bot.botModerationStatus });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Regenerate bot token
router.post('/:id/regenerate-token', auth, async (req, res) => {
    try {
        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        const newToken = 'bot_' + crypto.randomBytes(32).toString('hex');
        bot.botToken = newToken;
        await bot.save();

        res.json({ token: newToken });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete bot
router.delete('/:id', auth, async (req, res) => {
    try {
        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });
        const botName = bot.username;
        await User.deleteOne({ _id: bot._id });

        await logGlobalAction({
            executorId: req.user._id,
            action: 'BOT_DELETE',
            targetId: req.params.id,
            targetModel: 'User',
            details: { username: botName }
        });

        res.json({ message: 'Бот успешно удален' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Add bot to server
router.post('/:id/add-to-server', auth, async (req, res) => {
    try {
        const { serverId } = req.body;
        const botId = req.params.id;

        // Find the bot by ID
        const bot = await User.findOne({ _id: botId, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        const Server = require('../models/Server');
        const server = await Server.findById(serverId);
        if (!server) return res.status(404).json({ message: 'Server not found' });

        // Check if user has permission to add bots (must be owner or have manage server)
        const { computePermissions, hasPermission } = require('../utils/permissionCalculator');
        const { Permissions } = require('../utils/permissions');
        const perms = computePermissions(req.user._id, server);

        if (server.owner.toString() !== req.user._id.toString() && !hasPermission(perms, Permissions.MANAGE_SERVER)) {
            return res.status(403).json({ message: 'Insufficient permissions to add bots to this server' });
        }

        // Check if bot already in server
        const isMember = server.members.some(m => m.user.toString() === botId);
        if (isMember) return res.status(400).json({ message: 'Bot is already a member of this server' });

        server.members.push({ user: botId });
        await server.save();

        // Also update bot's servers array
        if (!bot.servers) bot.servers = [];
        if (!bot.servers.includes(serverId)) {
            bot.servers.push(serverId);
            await bot.save();
        }

        res.json({ message: 'Бот успешно добавлен на сервер' });
    } catch (error) {
        console.error('Add bot to server error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update bot profile (name, bio, primaryServer)
router.patch('/:id', auth, async (req, res) => {
    try {
        const { username, bio, primaryServer } = req.body;
        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        if (username) {
            const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const trimmedUsername = username.trim();
            const existingUser = await User.findOne({ username: new RegExp(`^${escapeRegex(trimmedUsername)}$`, 'i') });
            if (existingUser && existingUser._id.toString() !== bot._id.toString()) {
                return res.status(400).json({ message: 'Имя уже занято' });
            }
            bot.username = trimmedUsername;
        }
        if (bio !== undefined) bot.bio = bio;
        if (primaryServer !== undefined) bot.primaryServer = primaryServer || null;

        await bot.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('user-updated', { _id: bot._id, username: bot.username, bio: bot.bio, primaryServer: bot.primaryServer });
        }

        res.json({ message: 'Бот обновлен', bot });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update bot avatar
router.post('/:id/avatar', auth, (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        const avatarUrl = `/api/uploads/${req.file.filename}`;
        bot.avatar = avatarUrl;
        await bot.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('user-updated', { _id: bot._id, avatar: avatarUrl });
        }

        res.json({ message: 'Аватар обновлен', avatar: avatarUrl });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update bot banner
router.post('/:id/banner', auth, (req, res, next) => {
    upload.single('banner')(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        const bannerUrl = `/api/uploads/${req.file.filename}`;
        bot.banner = bannerUrl;
        await bot.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('user-updated', { _id: bot._id, banner: bannerUrl });
        }

        res.json({ message: 'Баннер обновлен', banner: bannerUrl });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Reset bot avatar
router.delete('/:id/avatar', auth, async (req, res) => {
    try {
        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        bot.avatar = null;
        await bot.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('user-updated', { _id: bot._id, avatar: null });
        }

        res.json({ message: 'Аватар сброшен', avatar: null });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Reset bot banner
router.delete('/:id/banner', auth, async (req, res) => {
    try {
        const bot = await User.findOne({ _id: req.params.id, owner: req.user._id, isBot: true });
        if (!bot) return res.status(404).json({ message: 'Bot not found' });

        bot.banner = null;
        await bot.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('user-updated', { _id: bot._id, banner: null });
        }

        res.json({ message: 'Баннер сброшен' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
