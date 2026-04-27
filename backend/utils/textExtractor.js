const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');
const pdf = require('pdf-parse');

require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const MAX_PARAGRAPH_CHARS = 900;
const PDF_PARSE_TIMEOUT_MS = Number(process.env.PDF_PARSE_TIMEOUT_MS || 120000);
const PDF_MAX_PAGES = Number(process.env.PDF_MAX_PAGES || 250);
const OCR_ENABLED = String(process.env.OCR_ENABLED || 'false').trim().toLowerCase() === 'true';
const OCR_PAGE_TEXT_THRESHOLD = Number(process.env.OCR_PAGE_TEXT_THRESHOLD || 20);
const OCR_RENDER_DPI = Number(process.env.OCR_RENDER_DPI || 200);
const OCR_LANGUAGE = String(process.env.OCR_LANGUAGE || 'eng').trim() || 'eng';
const OCR_PAGE_SEGMENTATION_MODE = String(process.env.OCR_PSM || '3').trim() || '3';
const PDFTOPPM_PATH = String(process.env.PDFTOPPM_PATH || 'pdftoppm').trim() || 'pdftoppm';
const TESSERACT_PATH = String(process.env.TESSERACT_PATH || 'tesseract').trim() || 'tesseract';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_OCR_ENABLED = String(process.env.GEMINI_OCR_ENABLED || 'false').trim().toLowerCase() === 'true';
const GEMINI_OCR_MODEL = String(process.env.GEMINI_OCR_MODEL || process.env.GEMINI_ANSWER_MODEL || 'gemini-2.5-flash').trim();

function withTimeout(promise, timeoutMs, timeoutMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);
}

function splitParagraphsWithLineNumbers(pageText) {
  const normalized = pageText
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    return [];
  }

  const indexedLines = normalized
    .split('\n')
    .map((line, index) => ({
      lineNumber: index + 1,
      text: line.replace(/[ \t]+/g, ' ').trim()
    }))
    .filter((line) => Boolean(line.text));

  if (indexedLines.length === 0) {
    return [];
  }

  const grouped = [];
  let currentText = '';
  let currentStartLine = indexedLines[0].lineNumber;
  let currentEndLine = indexedLines[0].lineNumber;

  indexedLines.forEach((line) => {
    const projected = `${currentText} ${line.text}`.trim();
    const shouldSplit =
      Boolean(currentText) &&
      (
        projected.length > MAX_PARAGRAPH_CHARS ||
        (/[.!?]$/.test(currentText) && currentText.length >= 220)
      );

    if (shouldSplit) {
      grouped.push({
        text: currentText.trim(),
        startLine: currentStartLine,
        endLine: currentEndLine
      });
      currentText = line.text;
      currentStartLine = line.lineNumber;
      currentEndLine = line.lineNumber;
      return;
    }

    currentText = projected;
    currentEndLine = line.lineNumber;
  });

  if (currentText.trim()) {
    grouped.push({
      text: currentText.trim(),
      startLine: currentStartLine,
      endLine: currentEndLine
    });
  }

  const sizedParagraphs = [];

  grouped.forEach((paragraph) => {
    if (paragraph.text.length <= MAX_PARAGRAPH_CHARS) {
      sizedParagraphs.push(paragraph);
      return;
    }

    const sentences = paragraph.text.split(/(?<=[.!?])\s+/);
    let current = '';

    sentences.forEach((sentence) => {
      const projected = `${current} ${sentence}`.trim();
      if (projected.length > MAX_PARAGRAPH_CHARS && current.trim()) {
        sizedParagraphs.push({
          text: current.trim(),
          startLine: paragraph.startLine,
          endLine: paragraph.endLine
        });
        current = sentence;
      } else {
        current = projected;
      }
    });

    if (current.trim()) {
      sizedParagraphs.push({
        text: current.trim(),
        startLine: paragraph.startLine,
        endLine: paragraph.endLine
      });
    }
  });

  return sizedParagraphs;
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function normalizePageText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createStructuredDataFromPages(pages) {
  const structuredData = [];

  pages.forEach((pageData) => {
    const paragraphs = splitParagraphsWithLineNumbers(pageData.text);
    paragraphs.forEach((paragraph, index) => {
      structuredData.push({
        page: pageData.page,
        paragraph: index + 1,
        startLine: paragraph.startLine,
        endLine: paragraph.endLine,
        text: paragraph.text
      });
    });
  });

  return structuredData;
}

function parseGeminiJsonText(rawText) {
  const raw = String(rawText || '').trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}

async function extractTextWithGeminiPdf(filePath, pageCount) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!GEMINI_OCR_ENABLED || !apiKey) {
    return new Map();
  }

  const pdfData = fs.readFileSync(filePath).toString('base64');
  const pageInstruction = pageCount > 0
    ? `The PDF has ${pageCount} page(s).`
    : 'Read every page in the PDF.';
  const prompt = [
    'Extract readable text from this scanned or image-based PDF.',
    pageInstruction,
    'Return strict JSON only with this shape:',
    '{"pages":[{"page":1,"text":"all readable text from page 1"}]}',
    'Preserve names, roll numbers, marks, dates, subjects, totals, and tables as plain text.',
    'If a page has no readable text, return an empty string for that page.'
  ].join('\n');

  const buildPayload = (inlineKey) => ({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            [inlineKey]: {
              mimeType: 'application/pdf',
              data: pdfData
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0
    }
  });

  let response;
  try {
    response = await axios.post(
      `${GEMINI_API_BASE}/models/${GEMINI_OCR_MODEL}:generateContent`,
      buildPayload('inlineData'),
      {
        params: { key: apiKey },
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000
      }
    );
  } catch (error) {
    if (error.response?.status !== 400) {
      const detail = error.response?.data?.error?.message || error.message;
      throw new Error(`Gemini OCR failed: ${detail}`);
    }

    response = await axios.post(
      `${GEMINI_API_BASE}/models/${GEMINI_OCR_MODEL}:generateContent`,
      buildPayload('inline_data'),
      {
        params: { key: apiKey },
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000
      }
    );
  }

  const rawText = response.data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
  const parsed = parseGeminiJsonText(rawText);
  const extractedPages = Array.isArray(parsed?.pages) ? parsed.pages : [];
  const ocrResults = new Map();

  extractedPages.forEach((page, index) => {
    const pageNumber = Number(page?.page) || index + 1;
    const text = normalizePageText(page?.text);
    if (pageNumber > 0 && text) {
      ocrResults.set(pageNumber, text);
    }
  });

  return ocrResults;
}

async function performOcrOnPages(filePath, pageNumbers) {
  if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
    return new Map();
  }

  const uniquePages = [...new Set(pageNumbers.map((page) => Number(page)).filter((page) => Number.isInteger(page) && page > 0))]
    .sort((a, b) => a - b);

  if (uniquePages.length === 0) {
    return new Map();
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-ocr-'));
  const imagePrefix = path.join(tempDir, 'page');

  try {
    await execFileAsync(PDFTOPPM_PATH, [
      '-png',
      '-r',
      String(Math.max(72, OCR_RENDER_DPI)),
      '-f',
      String(uniquePages[0]),
      '-l',
      String(uniquePages[uniquePages.length - 1]),
      filePath,
      imagePrefix
    ]);

    const ocrResults = new Map();

    for (const pageNumber of uniquePages) {
      const imagePath = `${imagePrefix}-${pageNumber}.png`;
      if (!fs.existsSync(imagePath)) {
        continue;
      }

      const { stdout } = await execFileAsync(TESSERACT_PATH, [
        imagePath,
        'stdout',
        '-l',
        OCR_LANGUAGE,
        '--psm',
        OCR_PAGE_SEGMENTATION_MODE
      ]);

      ocrResults.set(pageNumber, normalizePageText(stdout));
    }

    return ocrResults;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const missingCommand = error.path || error.spawnargs?.[0] || 'OCR tool';
      throw new Error(
        `${missingCommand} is not installed or not available on PATH. Install Tesseract OCR and Poppler pdftoppm, or set TESSERACT_PATH/PDFTOPPM_PATH.`
      );
    }

    const stderr = String(error?.stderr || '').trim();
    throw new Error(stderr || error.message || 'OCR extraction failed.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const extractTextWithPageNumbers = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pages = [];
    let currentPage = 0;

    const data = await withTimeout(
      pdf(dataBuffer, {
        max: PDF_MAX_PAGES > 0 ? PDF_MAX_PAGES : 0,
        pagerender: async (pageData) => {
          currentPage += 1;
          const textContent = await pageData.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false
          });

          let pageText = '';
          let lastY;

          for (const item of textContent.items) {
            const y = item.transform[5];
            if (lastY === undefined || Math.abs(lastY - y) < 1.5) {
              pageText += `${item.str} `;
            } else {
              pageText += `\n${item.str} `;
            }
            lastY = y;
          }

          const cleanPageText = normalizePageText(pageText);
          pages.push({ page: currentPage, text: cleanPageText, extractionMethod: cleanPageText ? 'text' : 'empty' });

          return cleanPageText;
        }
      }),
      PDF_PARSE_TIMEOUT_MS,
      `PDF text extraction timed out after ${Math.round(PDF_PARSE_TIMEOUT_MS / 1000)}s.`
    );

    const pagesNeedingOcr = OCR_ENABLED
      ? pages
        .filter((page) => normalizePageText(page.text).length <= OCR_PAGE_TEXT_THRESHOLD)
        .map((page) => page.page)
      : [];
    let ocrUsed = false;

    if (pagesNeedingOcr.length > 0) {
      const ocrResults = await performOcrOnPages(filePath, pagesNeedingOcr);

      pages.forEach((page) => {
        if (!ocrResults.has(page.page)) {
          return;
        }

        const ocrText = normalizePageText(ocrResults.get(page.page));
        if (!ocrText) {
          return;
        }

        page.text = ocrText;
        page.extractionMethod = 'ocr';
        ocrUsed = true;
      });
    }

    const fullText = pages
      .map((page) => normalizePageText(page.text))
      .filter(Boolean)
      .join('\n\n');
    const structuredData = createStructuredDataFromPages(pages);

    if (!fullText && GEMINI_OCR_ENABLED) {
      let geminiOcrResults = new Map();
      try {
        geminiOcrResults = await extractTextWithGeminiPdf(filePath, pages.length);
      } catch (error) {
        console.warn(`Gemini OCR skipped: ${error.message}`);
      }
      pages.forEach((page) => {
        if (!geminiOcrResults.has(page.page)) {
          return;
        }

        page.text = normalizePageText(geminiOcrResults.get(page.page));
        page.extractionMethod = 'gemini-ocr';
        ocrUsed = true;
      });
    }

    const finalFullText = pages
      .map((page) => normalizePageText(page.text))
      .filter(Boolean)
      .join('\n\n');
    const finalStructuredData = createStructuredDataFromPages(pages);

    if (!finalFullText) {
      const ocrHint = OCR_ENABLED
        ? ' OCR ran but no readable text was found.'
        : ' Enable OCR with OCR_ENABLED=true for scanned PDFs, or keep GEMINI_OCR_ENABLED=true with a valid GEMINI_API_KEY.';
      throw new Error(`No readable text could be extracted from this PDF.${ocrHint}`);
    }

    return {
      fullText: finalFullText,
      // Some PDFs report incorrect huge numpages metadata; use parsed pages count.
      numPages: pages.length,
      pages,
      structuredData: finalStructuredData,
      extractionSummary: {
        ocrEnabled: OCR_ENABLED,
        ocrUsed,
        textPages: pages.filter((page) => page.extractionMethod === 'text').length,
        ocrPages: pages.filter((page) => page.extractionMethod === 'ocr' || page.extractionMethod === 'gemini-ocr').length
      }
    };
  } catch (error) {
    console.error(error);
    throw new Error(error.message);
  }
};

module.exports = {
  extractTextWithPageNumbers
};
