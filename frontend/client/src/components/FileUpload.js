import React, { useEffect, useRef, useState } from 'react';
import { uploadPDFs } from '../services/api';

const FileUpload = ({ onUploadSuccess }) => {
  const [mode, setMode] = useState('folder'); // 'file' | 'folder'
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  // Apply / remove the directory attributes based on mode
  useEffect(() => {
    if (!inputRef.current) return;

    if (mode === 'folder') {
      inputRef.current.setAttribute('webkitdirectory', '');
      inputRef.current.setAttribute('directory', '');
      inputRef.current.removeAttribute('multiple');
    } else {
      inputRef.current.removeAttribute('webkitdirectory');
      inputRef.current.removeAttribute('directory');
      inputRef.current.setAttribute('multiple', '');
    }

    // Reset selection whenever mode changes
    inputRef.current.value = '';
    setFiles([]);
    setMessage('');
  }, [mode]);

  const selectedLabel = (() => {
    if (files.length === 0) return '';
    if (mode === 'folder') {
      const firstRelativePath = files[0]?.webkitRelativePath || '';
      const folderName = firstRelativePath.split('/')[0];
      if (folderName) return `${folderName} (${files.length} PDF${files.length === 1 ? '' : 's'})`;
    }
    if (files.length === 1) return files[0].name;
    return `${files.length} files selected`;
  })();

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const onlyPdf = selectedFiles.filter((file) => {
      const fileName = String(file.name || '').toLowerCase();
      return file.type === 'application/pdf' || fileName.endsWith('.pdf');
    });

    if (selectedFiles.length > 0 && onlyPdf.length === 0) {
      setMessage(
        mode === 'folder'
          ? 'The selected folder does not contain any PDF files.'
          : 'Only PDF files are allowed.'
      );
      setFiles([]);
      return;
    }

    if (selectedFiles.length !== onlyPdf.length) {
      setMessage(
        `Found ${onlyPdf.length} PDF file${onlyPdf.length === 1 ? '' : 's'}. Non-PDF files were ignored.`
      );
    } else {
      setMessage('');
    }

    setFiles(onlyPdf);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setMessage(
        mode === 'folder'
          ? 'Please select a folder that contains at least one PDF file.'
          : 'Please select at least one PDF file.'
      );
      return;
    }

    setUploading(true);
    setMessage('');
    try {
      const result = await uploadPDFs(files);

      if (result?.results && Array.isArray(result.results)) {
        const successCount = result.successCount || 0;
        const failedCount = result.failedCount || 0;
        const failedItems = result.results
          .filter((item) => !item.success)
          .slice(0, 3)
          .map((item) => `${item.fileName}: ${item.error}`)
          .join(' | ');
        setMessage(
          failedCount > 0
            ? `Success: ${successCount} uploaded, ${failedCount} failed. ${failedItems}`
            : `Success: ${successCount} uploaded.`
        );
      } else {
        setMessage(`Success: ${result.fileName} uploaded with ${result.numPages} pages.`);
      }

      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      if (onUploadSuccess) onUploadSuccess();
    } catch (error) {
      const data = error.response?.data;
      const failedItems = Array.isArray(data?.results)
        ? data.results
            .filter((item) => !item.success)
            .slice(0, 3)
            .map((item) => `${item.fileName}: ${item.error}`)
            .join(' | ')
        : '';
      setMessage(`Error: ${data?.error || data?.message || failedItems || error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, #3575ff, #1a4fd8)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0
            }}
          >
            UP
          </div>
          <h2 style={{ margin: 0 }}>Upload Documents</h2>
        </div>
      </div>

      {/* Mode toggle */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '12px',
          background: 'var(--surface-2, rgba(255,255,255,0.06))',
          borderRadius: '10px',
          padding: '4px'
        }}
      >
        {['file', 'folder'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.2s',
              background: mode === m
                ? 'linear-gradient(135deg, #3575ff, #1a4fd8)'
                : 'transparent',
              color: mode === m ? '#fff' : 'var(--ink-2, #94a3b8)',
              boxShadow: mode === m ? '0 2px 8px rgba(53,117,255,0.35)' : 'none'
            }}
          >
            {m === 'file' ? '📄 Select File(s)' : '📁 Select Folder'}
          </button>
        ))}
      </div>

      <div className="upload-zone">
        <input
          id="fileInput"
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="file-input"
        />

        {selectedLabel && <div className="file-picked">{selectedLabel}</div>}

        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          className="btn btn-primary btn-full"
          type="button"
        >
          {uploading ? (
            <>
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 0.75s linear infinite',
                  display: 'inline-block'
                }}
              />
              Uploading...
            </>
          ) : (
            mode === 'folder' ? 'Upload Folder PDFs' : 'Upload PDF(s)'
          )}
        </button>
      </div>

      {message && (
        <div
          className={`status-message ${
            message.startsWith('Success') ? 'status-success' : 'status-error'
          }`}
        >
          {message}
        </div>
      )}
    </section>
  );
};

export default FileUpload;
