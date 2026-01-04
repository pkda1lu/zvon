const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/fileUpload');

// Upload miscellaneous files
router.post('/', auth, (req, res, next) => {
    upload.array('files', 10)(req, res, (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ message: err.message || 'File upload failed' });
        }
        next();
    });
}, (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const files = req.files.map(file => ({
            url: `/api/uploads/${file.filename}`,
            filename: file.originalname,
            size: file.size,
            type: file.mimetype
        }));

        res.json(files);
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

module.exports = router;
