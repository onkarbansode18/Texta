import React, { useEffect, useMemo, useRef, useState } from 'react';
import { uploadPDFs } from '../services/api';

const FileUpload = ({ onUploadSuccess }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.setAttribute('webkitdirectory', '');
    inputRef.current.setAttribute('directory', '');
  }, []);

  const selectedLabel = useMemo(() => {
    if (files.length === 0) {
      return '';
    }

    const firstRelativePath = files[0]?.webkitRelativePath || '';
    const folderName = firstRelativePath.split('/')[0];

    if (folderName) {
      return `${folderName} (${files.length} PDF${files.length === 1 ? '' : 's'})`;
    }

    if (files.length === 1) {
      return files[0].name;
    }

    return `${files.length} files selected`;
  }, [files]);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const onlyPdf = selectedFiles.filter((file) => {
      const fileName = String(file.name || '').toLowerCase();
      return file.type === 'application/pdf' || fileName.endsWith('.pdf');
    });

    if (selectedFiles.length > 0 && onlyPdf.length === 0) {
      setMessage('The selected folder does not contain any PDF files.');
      setFiles([]);
      return;
    }

    if (selectedFiles.length !== onlyPdf.length) {
      setMessage(`Found ${onlyPdf.length} PDF file${onlyPdf.length === 1 ? '' : 's'} in the selected folder. Non-PDF files were ignored.`);
    } else {
      setMessage('');
    }

    setFiles(onlyPdf);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setMessage('Please select a folder that contains at least one PDF file.');
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
            : `Success: ${successCount} uploaded, ${failedCount} failed.`
        );
      } else {
        setMessage(`Success: ${result.fileName} uploaded with ${result.numPages} pages.`);
      }

      setFiles([]);
      if (inputRef.current) {
        inputRef.current.value = '';
      }

      if (onUploadSuccess) {
        onUploadSuccess();
      }
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

      <div className="upload-zone">
        <input
          id="fileInput"
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
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
            'Upload Folder PDFs'
          )}
        </button>
      </div>

      {message && (
        <div className={`status-message ${message.startsWith('Success') ? 'status-success' : 'status-error'}`}>
          {message}
        </div>
      )}
    </section>
  );
};

export default FileUpload;
