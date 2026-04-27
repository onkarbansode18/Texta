import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const BACKEND_BASE = API_BASE.replace(/\/api\/?$/, '');
const VIEWPORT_SCALE = 1.6;

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getPdfUrl = (fileName) => {
  const encodedFileName = String(fileName || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return encodedFileName ? `${BACKEND_BASE}/uploads/${encodedFileName}` : '';
};

const getSearchPhrase = (source) => {
  const normalized = normalizeText(source?.text || '');
  if (!normalized) {
    return '';
  }

  const words = normalized.split(' ').filter(Boolean);
  return words.slice(0, 10).join(' ');
};

const buildTextSegments = (items, viewport) =>
  (items || [])
    .map((item, index) => {
      const raw = String(item?.str || '');
      const normalized = normalizeText(raw);
      if (!normalized) {
        return null;
      }

      const rect = viewport.convertToViewportRectangle([
        item.transform[4],
        item.transform[5],
        item.transform[4] + item.width,
        item.transform[5] + item.height
      ]);

      const left = Math.min(rect[0], rect[2]);
      const top = Math.min(rect[1], rect[3]);
      const width = Math.abs(rect[0] - rect[2]);
      const height = Math.abs(rect[1] - rect[3]);

      return {
        index,
        raw,
        normalized,
        sourceY: item.transform[5],
        left,
        top,
        width,
        height
      };
    })
    .filter(Boolean);

const buildTextLines = (segments) => {
  const lines = [];
  let currentLine = null;
  let lastY;

  segments.forEach((segment) => {
    if (lastY === undefined || Math.abs(lastY - segment.sourceY) >= 1.5) {
      if (currentLine && currentLine.text.trim()) {
        lines.push({
          ...currentLine,
          lineNumber: lines.length + 1
        });
      }

      currentLine = {
        items: [segment],
        text: `${segment.raw} `
      };
      lastY = segment.sourceY;
      return;
    }

    currentLine.items.push(segment);
    currentLine.text += `${segment.raw} `;
    lastY = segment.sourceY;
  });

  if (currentLine && currentLine.text.trim()) {
    lines.push({
      ...currentLine,
      lineNumber: lines.length + 1
    });
  }

  return lines.map((line) => {
    const left = Math.min(...line.items.map((item) => item.left));
    const top = Math.min(...line.items.map((item) => item.top));
    const right = Math.max(...line.items.map((item) => item.left + item.width));
    const bottom = Math.max(...line.items.map((item) => item.top + item.height));

    return {
      lineNumber: line.lineNumber,
      text: line.text.replace(/\s+/g, ' ').trim(),
      left,
      top,
      width: right - left,
      height: bottom - top
    };
  });
};

const getLineRangeHighlightRects = (lines, source) => {
  const startLine = Number(source?.startLine);
  const endLine = Number(source?.endLine || source?.startLine);

  if (!Number.isFinite(startLine) || startLine <= 0 || !Number.isFinite(endLine) || endLine < startLine) {
    return [];
  }

  return lines
    .filter((line) => line.lineNumber >= startLine && line.lineNumber <= endLine)
    .map((line) => ({
      left: line.left,
      top: line.top,
      width: Math.max(24, line.width),
      height: Math.max(16, line.height)
    }));
};

const getHighlightRects = (segments, phrase) => {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase || segments.length === 0) {
    return [];
  }

  const phraseWords = normalizedPhrase.split(' ').filter(Boolean);
  if (phraseWords.length === 0) {
    return [];
  }

  let bestStart = -1;
  let bestEnd = -1;
  let bestScore = 0;

  for (let start = 0; start < segments.length; start += 1) {
    let combined = '';

    for (let end = start; end < segments.length && end < start + 12; end += 1) {
      combined = `${combined} ${segments[end].normalized}`.trim();

      let score = 0;
      if (combined.includes(normalizedPhrase)) {
        score = normalizedPhrase.length + 1000;
      } else {
        let matchedWords = 0;
        for (let i = 0; i < phraseWords.length; i += 1) {
          const word = phraseWords[i];
          if (combined.includes(word)) {
            matchedWords += 1;
          }
        }
        score = matchedWords;
      }

      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
        bestEnd = end;
      }
    }
  }

  if (bestStart < 0 || bestEnd < bestStart) {
    return [];
  }

  const matchedSegments = segments.slice(bestStart, bestEnd + 1);
  const lineGroups = [];

  matchedSegments.forEach((segment) => {
    const existingLine = lineGroups.find((line) => Math.abs(line.top - segment.top) < 8);
    if (existingLine) {
      existingLine.left = Math.min(existingLine.left, segment.left);
      existingLine.top = Math.min(existingLine.top, segment.top);
      existingLine.right = Math.max(existingLine.right, segment.left + segment.width);
      existingLine.bottom = Math.max(existingLine.bottom, segment.top + segment.height);
      return;
    }

    lineGroups.push({
      left: segment.left,
      top: segment.top,
      right: segment.left + segment.width,
      bottom: segment.top + segment.height
    });
  });

  return lineGroups.map((line) => ({
    left: line.left,
    top: line.top,
    width: Math.max(24, line.right - line.left),
    height: Math.max(16, line.bottom - line.top)
  }));
};

const PdfReferenceViewer = ({ source }) => {
  const canvasRef = useRef(null);
  const [state, setState] = useState({
    loading: true,
    error: '',
    rects: [],
    pageWidth: 0,
    pageHeight: 0,
    highlightFound: false
  });

  const pdfUrl = useMemo(() => getPdfUrl(source?.fileName), [source?.fileName]);
  const searchPhrase = useMemo(() => getSearchPhrase(source), [source]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;

    const renderPage = async () => {
      if (!source || !pdfUrl || !canvasRef.current) {
        setState({
          loading: false,
          error: 'PDF source is not available.',
          rects: [],
          pageWidth: 0,
          pageHeight: 0,
          highlightFound: false
        });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: '' }));

      try {
        loadingTask = getDocument({
          url: pdfUrl,
          withCredentials: false
        });

        const pdf = await loadingTask.promise;
        const pageNumber = Number(source?.page) > 0 ? Number(source.page) : 1;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: VIEWPORT_SCALE });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport
        }).promise;

        const textContent = await page.getTextContent();
        const segments = buildTextSegments(textContent.items, viewport);
        const lines = buildTextLines(segments);
        const rects = getLineRangeHighlightRects(lines, source);
        const fallbackRects = rects.length > 0 ? rects : getHighlightRects(segments, searchPhrase);

        if (!cancelled) {
          setState({
            loading: false,
            error: '',
            rects: fallbackRects,
            pageWidth: viewport.width,
            pageHeight: viewport.height,
            highlightFound: fallbackRects.length > 0
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error?.message || 'Failed to load PDF preview.',
            rects: [],
            pageWidth: 0,
            pageHeight: 0,
            highlightFound: false
          });
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy();
      }
    };
  }, [pdfUrl, searchPhrase, source]);

  return (
    <div className="pdf-render-shell">
      {state.loading && <div className="pdf-render-status">Rendering preview...</div>}
      {state.error && <div className="pdf-render-status pdf-render-status-error">{state.error}</div>}

      <div
        className="pdf-canvas-stage"
        style={{
          width: state.pageWidth || undefined,
          height: state.pageHeight || undefined
        }}
      >
        <canvas ref={canvasRef} className="pdf-render-canvas" />

        {!state.loading && !state.error && state.rects.map((rect, index) => (
          <div
            key={`${rect.left}-${rect.top}-${index}`}
            className="pdf-highlight-rect"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }}
          />
        ))}
      </div>

      {!state.loading && !state.error && !state.highlightFound && (
        <div className="pdf-render-status">
          Exact highlight was not found on the page. The cited page is still opened for manual verification.
        </div>
      )}
    </div>
  );
};

export default PdfReferenceViewer;
