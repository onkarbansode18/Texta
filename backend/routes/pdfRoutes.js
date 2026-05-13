const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pdfController = require('../controllers/pdfController');
const MAX_PDF_SIZE_MB = Number(process.env.MAX_PDF_SIZE_MB || 30);
const hasUploadSizeLimit = Number.isFinite(MAX_PDF_SIZE_MB) && MAX_PDF_SIZE_MB > 0;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: hasUploadSizeLimit
    ? { fileSize: MAX_PDF_SIZE_MB * 1024 * 1024 }
    : undefined,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Routes
router.post('/upload', upload.array('pdf', 20), pdfController.uploadPDF);
router.get('/documents', pdfController.getAllDocuments);
router.delete('/documents/:fileName', pdfController.deleteDocument);
router.delete('/folders/:folderPath', pdfController.deleteFolder);

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: hasUploadSizeLimit
        ? `PDF too large. Max allowed size is ${MAX_PDF_SIZE_MB}MB.`
        : 'PDF file size limit exceeded.'
    });
  }

  if (err) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }

  return next();
});

module.exports = router;
