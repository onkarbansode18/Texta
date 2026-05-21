
const pdfService = require('../services/pdfService');
const { getPdfFileRecord, openPdfDownloadStream } = require('../config/mongodb');

function sanitizeUploadName(fileName) {
  const normalized = String(fileName || '').replace(/[\\/]+/g, '_');
  return normalized.replace(/[^a-zA-Z0-9._ -]+/g, '_');
}

function buildStoredFileName(fileName, index = 0) {
  return `${Date.now()}-${index}-${sanitizeUploadName(fileName)}`;
}

exports.uploadPDF = async (req, res) => {
  try {
    let relativePaths = [];
    try {
      const raw = req.body?.relativePaths;
      relativePaths = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch (_) {
      relativePaths = [];
    }

    const files = Array.isArray(req.files) && req.files.length > 0
      ? req.files
      : (req.file ? [req.file] : []);

    if (files.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];

    for (const file of files) {
      try {
        const enrichedFile = {
          ...file,
          filename: buildStoredFileName(file.originalname, results.length),
          relativePath: relativePaths[results.length] || file.originalname
        };
        const result = await pdfService.processPDF(enrichedFile);
        results.push({
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          success: false,
          fileName: file.originalname,
          error: error.message
        });
      }
    }

    const successCount = results.filter((item) => item.success).length;
    const failedCount = results.length - successCount;

    if (results.length === 1) {
      const only = results[0];
      if (!only.success) {
        return res.status(500).json({ error: only.error || 'Upload failed' });
      }
      return res.json(only);
    }

    return res.status(200).json({
      success: failedCount === 0,
      successCount,
      failedCount,
      message: `Processed ${results.length} file(s): ${successCount} success, ${failedCount} failed.`,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.streamUploadedPdf = async (req, res) => {
  try {
    const { fileName } = req.params;
    const decodedFileName = decodeURIComponent(fileName || '');

    if (!decodedFileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const fileRecord = await getPdfFileRecord(decodedFileName);
    if (!fileRecord) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const stream = await openPdfDownloadStream(decodedFileName);
    if (!stream) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    res.setHeader('Content-Type', fileRecord.contentType || 'application/pdf');
    res.setHeader('Content-Length', fileRecord.length || 0);
    res.setHeader('Content-Disposition', `inline; filename="${decodedFileName}"`);
    stream.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Failed to stream PDF' });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllDocuments = async (req, res) => {
  try {
    const documents = await pdfService.getAllDocuments();
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const { fileName } = req.params;
    const deleted = await pdfService.deleteDocument(fileName);
    
    if (deleted) {
      res.json({ success: true, message: 'Document deleted successfully' });
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    const rawPath = decodeURIComponent(req.params.folderPath || '');
    // '__root__' is a frontend marker for files with empty folderPath
    const folderPath = rawPath === '__root__' ? '' : rawPath;
    const deletedCount = await pdfService.deleteFolder(folderPath);

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'No documents found in that folder' });
    }

    res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} document(s) from folder.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
