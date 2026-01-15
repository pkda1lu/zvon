const express = require('express');
const router = express.Router();
const { AccessToken } = require('livekit-server-sdk');
const auth = require('../middleware/auth');

// @route   GET api/livekit/token
// @desc    Get LiveKit access token
// @access  Private
router.get('/token', auth, async (req, res) => {
    try {
        const { roomName, identity } = req.query;

        if (!roomName || !identity) {
            return res.status(400).json({ message: 'Room name and identity are required' });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const host = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !host) {
            return res.status(500).json({ message: 'LiveKit configuration is missing on server' });
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity: identity,
            name: identity, // Use identity as name as well
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        res.json({ token: at.toJwt(), serverUrl: host });
    } catch (err) {
        console.error('LiveKit token error:', err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
