import React, { useMemo } from 'react';
import { deleteDocument } from '../services/api';

const groupDocumentsByFolder = (documents) => {
  const grouped = new Map();

  (documents || []).forEach((doc) => {
    const folderKey = doc.folderPath || 'Root';
    if (!grouped.has(folderKey)) {
      grouped.set(folderKey, []);
    }
    grouped.get(folderKey).push(doc);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folderPath, items]) => ({
      folderPath,
      items: items.sort((a, b) =>
        String(a.relativePath || a.originalName || a.fileName).localeCompare(
          String(b.relativePath || b.originalName || b.fileName)
        )
      )
    }));
};

const DocumentList = ({ documents, selectedFileNames = [], onSelectionChange, onDelete }) => {
  const groupedDocuments = useMemo(() => groupDocumentsByFolder(documents), [documents]);
  const selectedSet = useMemo(() => new Set(selectedFileNames), [selectedFileNames]);
  const allSelected = documents.length > 0 && selectedFileNames.length === documents.length;

  const handleDelete = async (fileName) => {
    if (window.confirm(`Delete ${fileName}?`)) {
      try {
        await deleteDocument(fileName);
        onDelete();
      } catch (error) {
        alert(`Error: ${error.message}`);
      }
    }
  };

  const toggleFile = (fileName) => {
    if (selectedSet.has(fileName)) {
      onSelectionChange(selectedFileNames.filter((item) => item !== fileName));
      return;
    }

    onSelectionChange([...selectedFileNames, fileName]);
  };

  const selectAll = () => {
    onSelectionChange(documents.map((doc) => doc.fileName));
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  if (!documents || documents.length === 0) {
    return (
      <section className="panel empty-panel">
        <p>No documents yet. Upload a PDF to get started.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head panel-head-inline">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0
            }}
          >
            DR
          </div>
          <div>
            <h3 style={{ margin: 0 }}>Document Repository</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
              Choose which uploaded files should be used for answering questions.
            </p>
          </div>
        </div>
        <span className="badge">{selectedFileNames.length}/{documents.length} selected</span>
      </div>

      <div className="doc-toolbar">
        <label className="doc-select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => (event.target.checked ? selectAll() : clearAll())}
          />
          <span>Select all files</span>
        </label>

        <button className="btn btn-question-remove doc-toolbar-btn" type="button" onClick={clearAll}>
          Clear
        </button>
      </div>

      <div className="doc-list doc-tree-list">
        {groupedDocuments.map((group) => (
          <section key={group.folderPath} className="doc-folder-group">
            <div className="doc-folder-head">
              <span className="doc-folder-path">{group.folderPath}</span>
              <span className="doc-folder-count">{group.items.length}</span>
            </div>

            <div className="doc-folder-files">
              {group.items.map((doc, i) => (
                <article key={doc.fileName} className="doc-card" style={{ animationDelay: `${i * 0.05}s` }}>
                  <label className="doc-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(doc.fileName)}
                      onChange={() => toggleFile(doc.fileName)}
                    />
                  </label>

                  <div className="doc-icon">
                    {(doc.originalName || doc.fileName).charAt(0).toUpperCase()}
                  </div>

                  <div className="doc-info">
                    <h4 className="doc-title">{doc.originalName || doc.fileName}</h4>
                    <div className="doc-path">{doc.relativePath || doc.originalName || doc.fileName}</div>
                    <div className="doc-meta">
                      <span className="doc-meta-chip">{doc.numPages} pages</span>
                      <span className="doc-meta-chip">{doc.paragraphCount || 0} paras</span>
                      <span className="doc-meta-chip">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(doc.fileName)}
                    className="btn btn-danger"
                    type="button"
                    title="Delete document"
                  >
                    Delete
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
};

export default DocumentList;
