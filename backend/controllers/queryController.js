const aiService = require('../services/aiService');
const pdfService = require('../services/pdfService');
const PDFDocument = require('pdfkit');

const PDF_THEME = {
  title: '#0f172a',
  text: '#1f2937',
  muted: '#64748b',
  primary: '#2563eb',
  border: '#cbd5e1',
  panelBg: '#f8fafc',
  metaBg: '#eef2ff'
};
const MAX_EXPORT_SOURCES = 3;
const MAX_ANSWER_CHARS = 1200;
const MAX_SOURCE_EXCERPT_CHARS = 180;
const MAX_BATCH_QUERIES = 20;

function compactText(value, maxChars) {
  const normalized = String(value || '-').replace(/\s+/g, ' ').trim();
  if (!maxChars || normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}...`;
}

function sanitizeFilename(value) {
  return String(value || 'query-result')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function writeSectionTitle(doc, title) {
  doc.moveDown(0.8);
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y;

  doc.save();
  doc.rect(left, y, 4, 17).fill(PDF_THEME.primary);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(13).fillColor(PDF_THEME.title).text(title, left + 10, y);
  doc.moveDown(0.5);
}

function ensurePageSpace(doc, minSpace = 80) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - minSpace) {
    doc.addPage();
  }
}

function normalizeQueries(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  const single = String(input || '').trim();
  return single ? [single] : [];
}

function normalizeSelectedFiles(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return Array.from(new Set(
    input
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));
}

function drawInfoCard(doc, rows) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const top = doc.y;
  const cardHeight = 56;

  ensurePageSpace(doc, cardHeight + 10);

  doc.save();
  doc.roundedRect(left, top, width, cardHeight, 8).fillAndStroke(PDF_THEME.metaBg, PDF_THEME.border);
  doc.restore();

  let y = top + 10;
  rows.forEach((row) => {
    doc.font('Helvetica').fontSize(10).fillColor(PDF_THEME.muted).text(row, left + 14, y, { width: width - 28 });
    y += 16;
  });

  doc.y = top + cardHeight + 6;
}

function drawTextPanel(doc, title, text) {
  writeSectionTitle(doc, title);

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const textValue = String(text || '-');
  const textHeight = doc.heightOfString(textValue, {
    width: width - 24,
    align: 'left',
    lineGap: 2
  });
  const panelHeight = Math.max(52, textHeight + 22);
  const availableHeight = doc.page.height - doc.page.margins.bottom - doc.y;

  if (panelHeight <= availableHeight - 4) {
    const top = doc.y;
    doc.save();
    doc.roundedRect(left, top, width, panelHeight, 8).fillAndStroke(PDF_THEME.panelBg, PDF_THEME.border);
    doc.restore();

    doc.font('Helvetica').fontSize(11.5).fillColor(PDF_THEME.text).text(textValue, left + 12, top + 10, {
      width: width - 24,
      align: 'left',
      lineGap: 2
    });
    doc.y = top + panelHeight + 2;
    return;
  }

  doc.font('Helvetica').fontSize(11.5).fillColor(PDF_THEME.text).text(textValue, {
    width,
    align: 'left',
    lineGap: 2
  });
}

function drawFooter(doc) {
  const footerY = doc.page.height - doc.page.margins.bottom - 12;
  doc.font('Helvetica').fontSize(9).fillColor(PDF_THEME.muted).text(
    'AI-PDF Retrieval Export',
    doc.page.margins.left,
    footerY,
    {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'left',
      lineBreak: false
    }
  );
}

exports.queryDocuments = async (req, res) => {
  try {
    const { query, queries, selectedFiles } = req.body || {};
    const normalizedQueries = normalizeQueries(queries && queries.length ? queries : query);
    const selectedFileNames = normalizeSelectedFiles(selectedFiles);

    if (normalizedQueries.length === 0) {
      return res.status(400).json({ error: 'At least one query is required' });
    }

    if (normalizedQueries.length > MAX_BATCH_QUERIES) {
      return res.status(400).json({ error: `Maximum ${MAX_BATCH_QUERIES} queries are allowed per request` });
    }

    const documents = await pdfService.getAllDocumentData();
    if (documents.length === 0) {
      return res.status(400).json({ error: 'No documents uploaded yet' });
    }

    const filteredDocuments = selectedFileNames.length > 0
      ? documents.filter((doc) => selectedFileNames.includes(doc.fileName))
      : documents;

    if (filteredDocuments.length === 0) {
      return res.status(400).json({ error: 'No selected documents are available for search' });
    }

    const results = await Promise.all(
      normalizedQueries.map(async (item) => {
        const result = await aiService.searchDocuments(item, filteredDocuments);
        return {
          query: item,
          ...result
        };
      })
    );

    if (results.length === 1) {
      return res.json(results[0]);
    }

    return res.json({
      isBatch: true,
      totalQueries: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.voiceQuery = async (req, res) => {
  try {
    // Voice query will be converted to text on frontend
    // Then sent as regular text query
    const { query, selectedFiles } = req.body || {};
    const selectedFileNames = normalizeSelectedFiles(selectedFiles);
    
    if (!query) {
      return res.status(400).json({ error: 'Voice query text is required' });
    }

    const documents = await pdfService.getAllDocumentData();
    if (documents.length === 0) {
      return res.status(400).json({ error: 'No documents uploaded yet' });
    }

    const filteredDocuments = selectedFileNames.length > 0
      ? documents.filter((doc) => selectedFileNames.includes(doc.fileName))
      : documents;

    if (filteredDocuments.length === 0) {
      return res.status(400).json({ error: 'No selected documents are available for search' });
    }

    const result = await aiService.searchDocuments(query, filteredDocuments);
    
    res.json({
      query,
      ...result,
      inputMethod: 'voice'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.health = async (req, res) => {
  try {
    const aiHealth = await aiService.healthCheck();
    const documents = await pdfService.getAllDocuments();

    res.status(aiHealth.ok ? 200 : 503).json({
      ok: aiHealth.ok,
      dependencies: aiHealth,
      stats: {
        documents: documents.length
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.exportQueryResultPdf = async (req, res) => {
  let doc;
  try {
    const { query, answer, sources = [], inputMethod = 'text' } = req.body || {};
    const exportSources = Array.isArray(sources) ? sources.slice(0, MAX_EXPORT_SOURCES) : [];
    const compactAnswer = compactText(answer, MAX_ANSWER_CHARS);

    if (!query || !answer) {
      return res.status(400).json({ error: 'Query and answer are required to export PDF' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBase = sanitizeFilename(query).slice(0, 40) || 'query-result';
    const fileName = `${safeBase}-${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    doc = new PDFDocument({ size: 'A4', margin: 50 });

    // Prevent server crash if client closes early during streaming.
    doc.on('error', (streamError) => {
      console.error('PDF stream error:', streamError.message);
      if (!res.writableEnded) {
        try {
          res.end();
        } catch (_) {
          // Ignore close failures.
        }
      }
    });

    res.on('error', (responseError) => {
      console.error('Response stream error:', responseError.message);
    });

    doc.pipe(res);

    doc.on('pageAdded', () => drawFooter(doc));

    doc.font('Helvetica-Bold').fontSize(22).fillColor(PDF_THEME.title).text('Query Result Report');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor(PDF_THEME.muted).text('Generated from AI-PDF Retrieval System');
    doc.moveDown(0.4);

    drawInfoCard(doc, [
      `Generated: ${new Date().toLocaleString()}`,
      `Input Method: ${inputMethod}`,
      `Citations Included: ${exportSources.length}${Array.isArray(sources) && sources.length > exportSources.length ? ` (showing top ${exportSources.length} of ${sources.length})` : ''}`
    ]);

    drawTextPanel(doc, 'Question', compactText(query, 260));
    drawTextPanel(doc, 'Answer', compactAnswer);

    if (exportSources.length > 0) {
      writeSectionTitle(doc, 'Sources');

      exportSources.forEach((source, index) => {
        ensurePageSpace(doc, 115);
        const fileLabel = source.originalName || source.fileName || 'Unknown document';
        const page = source.page ?? '-';
        const para = source.paragraph ?? '-';
        const lineStart = source.startLine ?? '-';
        const lineEnd = source.endLine ?? lineStart;
        const lineLabel = lineStart === '-' ? '-' : `line ${lineStart}${lineEnd !== lineStart ? `-${lineEnd}` : ''}`;
        const sourceExcerpt = compactText(source.text || '-', MAX_SOURCE_EXCERPT_CHARS);
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        const heading = `${index + 1}. ${fileLabel} (p.${page}, para ${para}, ${lineLabel})`;
        const sourceHeight = doc.heightOfString(sourceExcerpt, { width: width - 24, lineGap: 1.5 });
        const cardHeight = Math.max(56, sourceHeight + 34);
        const top = doc.y;

        doc.save();
        doc.roundedRect(left, top, width, cardHeight, 8).fillAndStroke('#ffffff', PDF_THEME.border);
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(PDF_THEME.title).text(heading, left + 12, top + 10, {
          width: width - 24
        });
        doc.font('Helvetica').fontSize(10).fillColor(PDF_THEME.text).text(sourceExcerpt, left + 12, top + 26, {
          width: width - 24,
          lineGap: 1.5
        });

        doc.y = top + cardHeight + 8;
      });
    }

    drawFooter(doc);
    doc.end();
  } catch (error) {
    if (doc) {
      try {
        doc.end();
      } catch (_) {
        // Ignore cleanup failures.
      }
    }

    if (!res.headersSent && !res.writableEnded) {
      res.status(500).json({ error: error.message });
      return;
    }

    console.error('Export PDF failed after headers sent:', error.message);
  }
};
