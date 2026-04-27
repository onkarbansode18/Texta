import React, { useState } from 'react';
import { exportQueryResultPdf } from '../services/api';
import PdfReferenceViewer from './PdfReferenceViewer';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const BACKEND_BASE = API_BASE.replace(/\/api\/?$/, '');

const buildExportPayload = (item, fallbackInputMethod = 'text') => ({
  query: String(item?.query || ''),
  answer: String(item?.answer || ''),
  inputMethod: String(item?.inputMethod || fallbackInputMethod),
  sources: Array.isArray(item?.sources)
    ? item.sources.map((source) => ({
        chunkId: source?.chunkId || '',
        fileName: source?.fileName || '',
        originalName: source?.originalName || '',
        page: source?.page ?? '-',
        paragraph: source?.paragraph ?? '-',
        startLine: source?.startLine ?? '-',
        endLine: source?.endLine ?? '-',
        text: String(source?.text || '')
      }))
    : []
});

const encodePdfPath = (fileName) =>
  String(fileName || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const buildPdfViewerUrl = (source) => {
  const encodedFileName = encodePdfPath(source?.fileName || '');
  if (!encodedFileName) {
    return '';
  }

  const page = Number(source?.page);
  const params = [];

  if (Number.isFinite(page) && page > 0) {
    params.push(`page=${page}`);
  }

  const hash = params.length > 0 ? `#${params.join('&')}` : '';
  return `${BACKEND_BASE}/uploads/${encodedFileName}${hash}`;
};

const PdfPreviewModal = ({ source, onClose }) => {
  if (!source) {
    return null;
  }

  const pdfUrl = buildPdfViewerUrl(source);

  return (
    <div className="pdf-preview-backdrop" onClick={onClose} role="presentation">
      <div
        className="pdf-preview-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="PDF preview"
      >
        <div className="pdf-preview-head">
          <div>
            <p className="field-label" style={{ marginBottom: 6 }}>Source Preview</p>
            <h3 className="pdf-preview-title">{source.originalName || source.fileName}</h3>
            <p className="pdf-preview-meta">
              Page {source.page || '-'}, paragraph {source.paragraph || '-'}, line {source.startLine || '-'}
              {source.endLine && source.endLine !== source.startLine ? `-${source.endLine}` : ''}
            </p>
          </div>

          <div className="pdf-preview-actions">
            <a className="btn btn-primary" href={pdfUrl} target="_blank" rel="noreferrer">
              Open In New Tab
            </a>
            <button className="btn btn-question-remove" type="button" onClick={onClose}>
              x
            </button>
          </div>
        </div>

        <div className="pdf-preview-frame-wrap">
          <PdfReferenceViewer source={source} />
        </div>

        <p className="pdf-preview-note">
          The cited page is rendered inside the app and the matched text is highlighted in yellow when the excerpt can be located on that page.
        </p>
      </div>
    </div>
  );
};

const SourcesSection = ({ sources, onSourceOpen }) => {
  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  return (
    <div className="sources-wrap">
      <p className="field-label">Referenced Sources</p>
      <div className="sources-grid">
        {sources.map((source, index) => (
          <button
            key={`${source.chunkId || index}`}
            className="source-card source-card-button"
            style={{ animationDelay: `${index * 0.06}s` }}
            type="button"
            onClick={() => onSourceOpen(source)}
          >
            <div className="source-top">
              <span className="source-file">
                <span className="source-num">{index + 1}</span>
                {source.originalName || source.fileName}
              </span>
              <span className="source-loc">p.{source.page} para {source.paragraph}</span>
            </div>
            <p className="field-label" style={{ marginBottom: 6 }}>
              line {source.startLine || '-'}
              {source.endLine && source.endLine !== source.startLine ? `-${source.endLine}` : ''}
            </p>
            <p className="source-text">
              {String(source.text || '').substring(0, 260)}
              {String(source.text || '').length > 260 ? '...' : ''}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

const ResultItem = ({ item, index, downloading, onDownload, onSourceOpen }) => (
  <article className="batch-result-card">
    <div className="panel-head panel-head-inline">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: 36,
            height: 36,
            background: 'linear-gradient(135deg, #00c2a8, #059669)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
            color: '#ffffff',
            fontWeight: 700
          }}
        >
          {index + 1}
        </div>
        <h2 style={{ margin: 0 }}>Answer {index + 1}</h2>
      </div>

      <div className="result-actions">
        <span className="badge">
          {item.sources?.length || 0} {item.sources?.length === 1 ? 'citation' : 'citations'}
        </span>
        <button className="btn btn-primary" type="button" onClick={onDownload} disabled={downloading}>
          {downloading ? 'Preparing PDF...' : 'Download PDF'}
        </button>
      </div>
    </div>

    <div className="answer-block question-block">
      <p className="field-label">Question</p>
      <p className="question-text">{item.query}</p>
    </div>

    <div className="answer-block response-block">
      <p className="field-label">Response</p>
      <div className="response-text">{item.answer}</div>
    </div>

    <SourcesSection sources={item.sources} onSourceOpen={onSourceOpen} />
  </article>
);

const ResultDisplay = ({ result }) => {
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [activeSource, setActiveSource] = useState(null);

  if (!result) {
    return null;
  }

  const items = Array.isArray(result.results) ? result.results : [result];

  const handleDownloadPdf = async (item, index) => {
    const key = `${index}-${item.query}`;

    try {
      setDownloadingKey(key);
      const exportPayload = buildExportPayload(item, result.inputMethod || 'text');
      const { blob, fileName } = await exportQueryResultPdf(exportPayload);

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2 style={{ margin: 0 }}>Query Results</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-3)' }}>
            {items.length} {items.length === 1 ? 'question answered' : 'questions answered'} across uploaded PDFs.
          </p>
        </div>

        <div className="batch-result-list">
          {items.map((item, index) => {
            const key = `${index}-${item.query}`;
            return (
              <ResultItem
                key={key}
                item={item}
                index={index}
                downloading={downloadingKey === key}
                onDownload={() => handleDownloadPdf(item, index)}
                onSourceOpen={setActiveSource}
              />
            );
          })}
        </div>
      </section>

      <PdfPreviewModal source={activeSource} onClose={() => setActiveSource(null)} />
    </>
  );
};

export default ResultDisplay;
