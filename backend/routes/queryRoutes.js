const express = require('express');
const router = express.Router();
const queryController = require('../controllers/queryController');

// Routes
router.get('/health', queryController.health);
router.post('/text', queryController.queryDocuments);
router.post('/voice', queryController.voiceQuery);
router.post('/export-pdf', queryController.exportQueryResultPdf);

module.exports = router;
