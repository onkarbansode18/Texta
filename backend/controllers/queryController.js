const aiService = require('../services/aiService');
const pdfService = require('../services/pdfService');
const PDFDocument = require('pdfkit');

/* ─── Premium PDF Theme ─────────────────────────────────────────────── */
const PDF_THEME = {
  // Header / branding
  headerGradientStart: '#1e293b',
  headerGradientEnd:   '#0f172a',
  headerAccent:        '#6366f1',
  headerText:          '#ffffff',
  headerSubText:       '#94a3b8',

  // Body
  title:     '#0f172a',
  text:      '#1e293b',
  muted:     '#64748b',
  primary:   '#6366f1',
  secondary: '#8b5cf6',
  success:   '#059669',
  border:    '#e2e8f0',

  // Panels
  questionBg:    '#eef2ff',
  questionBorder:'#c7d2fe',
  answerBg:      '#f0fdf4',
  answerBorder:  '#a7f3d0',
  sourceBg:      '#fafafa',
  sourceBorder:  '#e2e8f0',
  metaBg:        '#f8fafc',
  metaBorder:    '#e2e8f0',

  // Footer
  footerLine: '#e2e8f0',
  footerText: '#94a3b8'
};
const MAX_EXPORT_SOURCES = 3;
const MAX_ANSWER_CHARS = 1800;
const MAX_SOURCE_EXCERPT_CHARS = 280;
const MAX_BATCH_QUERIES = 20;
const PAGE_MARGIN = 48;

/* ─── Helper utilities ──────────────────────────────────────────────── */
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

/* ─── PDF Drawing Helpers ───────────────────────────────────────────── */
function getUsableWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function getRemainingSpace(doc) {
  return doc.page.height - doc.page.margins.bottom - doc.y;
}

function ensurePageSpace(doc, minSpace = 60) {
  if (getRemainingSpace(doc) < minSpace) {
    doc.addPage();
  }
}

/**
 * Draw a premium header banner at the top of the first page.
 */
function drawHeaderBanner(doc, query, inputMethod) {
  const left = 0;
  const width = doc.page.width;
  const bannerHeight = 105;

  // Dark gradient background
  doc.save();
  doc.rect(left, 0, width, bannerHeight).fill(PDF_THEME.headerGradientStart);

  // Accent stripe at bottom of banner
  doc.rect(left, bannerHeight - 3, width, 3).fill(PDF_THEME.headerAccent);
  doc.restore();

  // Title
  doc.font('Helvetica-Bold').fontSize(20).fillColor(PDF_THEME.headerText)
    .text('Query Result Report', PAGE_MARGIN, 24, { width: width - PAGE_MARGIN * 2 });

  // Subtitle
  doc.font('Helvetica').fontSize(10).fillColor(PDF_THEME.headerSubText)
    .text('AI-PDF Retrieval System  •  Intelligent Document Analysis', PAGE_MARGIN, 50, { width: width - PAGE_MARGIN * 2 });

  // Metadata line
  const dateStr = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  doc.font('Helvetica').fontSize(9).fillColor(PDF_THEME.headerSubText)
    .text(`Generated: ${dateStr}   |   Input: ${inputMethod.toUpperCase()}`, PAGE_MARGIN, 72, { width: width - PAGE_MARGIN * 2 });

  doc.y = bannerHeight + 18;
}

/**
 * Draw a labeled info card with icon.
 */
function drawInfoCard(doc, rows) {
  const left = doc.page.margins.left;
  const width = getUsableWidth(doc);
  const rowHeight = 18;
  const paddingY = 12;
  const cardHeight = paddingY * 2 + rows.length * rowHeight;

  ensurePageSpace(doc, cardHeight + 10);

  const top = doc.y;

  doc.save();
  doc.roundedRect(left, top, width, cardHeight, 6)
    .lineWidth(0.75).fillAndStroke(PDF_THEME.metaBg, PDF_THEME.metaBorder);
  doc.restore();

  // Accent left bar
  doc.save();
  doc.rect(left, top, 4, cardHeight).fill(PDF_THEME.primary);
  doc.restore();

  let y = top + paddingY;
  rows.forEach((row) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(PDF_THEME.muted)
      .text(row, left + 16, y, { width: width - 28 });
    y += rowHeight;
  });

  doc.y = top + cardHeight + 12;
}

/**
 * Draw a section title with an accent marker.
 */
function writeSectionTitle(doc, title, color) {
  ensurePageSpace(doc, 40);
  doc.moveDown(0.6);
  const left = doc.page.margins.left;
  const y = doc.y;

  // Accent dot
  doc.save();
  doc.circle(left + 5, y + 7, 5).fill(color || PDF_THEME.primary);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(13).fillColor(PDF_THEME.title)
    .text(title, left + 16, y);
  doc.moveDown(0.4);
}

/**
 * Draw a styled text panel (question or answer) with background + border.
 * Properly calculates height to prevent blank pages.
 */
function drawStyledPanel(doc, title, text, bgColor, borderColor, accentColor) {
  writeSectionTitle(doc, title, accentColor);

  const left = doc.page.margins.left;
  const width = getUsableWidth(doc);
  const innerWidth = width - 28;
  const textValue = String(text || '-');

  // Measure the text height accurately
  const textHeight = doc.heightOfString(textValue, {
    width: innerWidth,
    align: 'left',
    lineGap: 3
  });
  const paddingY = 14;
  const panelHeight = textHeight + paddingY * 2;
  const available = getRemainingSpace(doc);

  // If panel fits in remaining space, draw inline; otherwise just flow text across pages
  if (panelHeight <= available - 4) {
    const top = doc.y;
    doc.save();
    doc.roundedRect(left, top, width, panelHeight, 6)
      .lineWidth(0.75).fillAndStroke(bgColor, borderColor);
    doc.restore();

    // Left accent bar
    doc.save();
    doc.rect(left, top, 4, panelHeight).fill(accentColor);
    doc.restore();

    doc.font('Helvetica').fontSize(11).fillColor(PDF_THEME.text)
      .text(textValue, left + 16, top + paddingY, {
        width: innerWidth,
        align: 'left',
        lineGap: 3
      });
    doc.y = top + panelHeight + 6;
  } else {
    // Text is too long for a single panel box — draw background for visible portion
    // then let text flow naturally across pages
    doc.font('Helvetica').fontSize(11).fillColor(PDF_THEME.text)
      .text(textValue, left + 16, doc.y, {
        width: innerWidth,
        align: 'left',
        lineGap: 3
      });
    doc.moveDown(0.5);
  }
}

/**
 * Draw a thin divider line.
 */
function drawDivider(doc) {
  ensurePageSpace(doc, 16);
  const left = doc.page.margins.left;
  const width = getUsableWidth(doc);
  const y = doc.y + 4;

  doc.save();
  doc.moveTo(left, y).lineTo(left + width, y)
    .lineWidth(0.5).strokeColor(PDF_THEME.border).stroke();
  doc.restore();

  doc.y = y + 8;
}

/**
 * Draw a source card with number badge and accent bar.
 */
function drawSourceCard(doc, source, index) {
  const left = doc.page.margins.left;
  const width = getUsableWidth(doc);
  const innerWidth = width - 32;

  const fileLabel = source.originalName || source.fileName || 'Unknown document';
  const page = source.page ?? '-';
  const para = source.paragraph ?? '-';
  const lineStart = source.startLine ?? '-';
  const lineEnd = source.endLine ?? lineStart;
  const lineLabel = lineStart === '-' ? '-' : `line ${lineStart}${lineEnd !== lineStart ? `-${lineEnd}` : ''}`;
  const sourceExcerpt = compactText(source.text || '-', MAX_SOURCE_EXCERPT_CHARS);

  const heading = `${fileLabel}`;
  const meta = `Page ${page}  •  Paragraph ${para}  •  ${lineLabel}`;

  // Measure heights
  const headingHeight = doc.heightOfString(heading, { width: innerWidth });
  const metaHeight = 14;
  const excerptHeight = doc.heightOfString(sourceExcerpt, { width: innerWidth, lineGap: 2 });
  const cardHeight = Math.max(60, headingHeight + metaHeight + excerptHeight + 36);

  ensurePageSpace(doc, cardHeight + 10);

  const top = doc.y;

  // Card background
  doc.save();
  doc.roundedRect(left, top, width, cardHeight, 6)
    .lineWidth(0.75).fillAndStroke(PDF_THEME.sourceBg, PDF_THEME.sourceBorder);
  doc.restore();

  // Accent bar
  const accentColors = ['#6366f1', '#8b5cf6', '#059669'];
  doc.save();
  doc.rect(left, top, 4, cardHeight).fill(accentColors[index % accentColors.length]);
  doc.restore();

  // Number badge
  const badgeX = left + 14;
  const badgeY = top + 12;
  doc.save();
  doc.circle(badgeX + 10, badgeY + 10, 10).fill(accentColors[index % accentColors.length]);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
    .text(String(index + 1), badgeX + 4, badgeY + 4, { width: 12, align: 'center' });

  // File name
  const textX = left + 40;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(PDF_THEME.title)
    .text(heading, textX, top + 12, { width: width - 56 });

  // Meta info
  doc.font('Helvetica').fontSize(8.5).fillColor(PDF_THEME.muted)
    .text(meta, textX, top + 12 + headingHeight + 2, { width: width - 56 });

  // Excerpt
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_THEME.text)
    .text(sourceExcerpt, textX, top + 12 + headingHeight + metaHeight + 8, {
      width: width - 56,
      lineGap: 2
    });

  doc.y = top + cardHeight + 8;
}

/**
 * Draw a footer on every page with line and text.
 */
function drawFooter(doc) {
  const footerY = doc.page.height - doc.page.margins.bottom + 8;
  const left = doc.page.margins.left;
  const width = getUsableWidth(doc);

  // Divider line above footer
  doc.save();
  doc.moveTo(left, footerY).lineTo(left + width, footerY)
    .lineWidth(0.5).strokeColor(PDF_THEME.footerLine).stroke();
  doc.restore();

  doc.font('Helvetica').fontSize(8).fillColor(PDF_THEME.footerText)
    .text('AI-PDF Retrieval System  •  Intelligent Document Analysis',
      left, footerY + 6,
      { width, align: 'center', lineBreak: false });
}

/* ─── Route Handlers ────────────────────────────────────────────────── */

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

    doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,       // Buffer all pages so we can remove blanks
      autoFirstPage: true,
      info: {
        Title: `Query Result: ${compactText(query, 60)}`,
        Author: 'AI-PDF Retrieval System',
        Subject: 'Query Result Export',
        Creator: 'AI-PDF Retrieval'
      }
    });

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

    // ── Header Banner ──
    drawHeaderBanner(doc, query, inputMethod);

    // ── Info Card ──
    const citationsText = `${exportSources.length} citation${exportSources.length !== 1 ? 's' : ''}`
      + (Array.isArray(sources) && sources.length > exportSources.length
        ? ` (top ${exportSources.length} of ${sources.length})`
        : '');
    drawInfoCard(doc, [
      `📋  Input Method: ${inputMethod.charAt(0).toUpperCase() + inputMethod.slice(1)}`,
      `📎  Citations: ${citationsText}`
    ]);

    // ── Question Panel ──
    drawStyledPanel(
      doc,
      'Question',
      compactText(query, 400),
      PDF_THEME.questionBg,
      PDF_THEME.questionBorder,
      PDF_THEME.primary
    );

    // ── Answer Panel ──
    drawStyledPanel(
      doc,
      'Answer',
      compactAnswer,
      PDF_THEME.answerBg,
      PDF_THEME.answerBorder,
      PDF_THEME.success
    );

    // ── Sources ──
    if (exportSources.length > 0) {
      drawDivider(doc);
      writeSectionTitle(doc, `Referenced Sources (${exportSources.length})`, PDF_THEME.secondary);

      exportSources.forEach((source, index) => {
        drawSourceCard(doc, source, index);
      });
    }

    // ── Draw footer on ALL pages ──
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      drawFooter(doc);
    }

    // ── Remove any trailing blank pages ──
    // PDFKit bufferedPages lets us detect pages with no real content.
    // Since we use bufferPages, we can just finalize now.
    doc.flushPages();
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
