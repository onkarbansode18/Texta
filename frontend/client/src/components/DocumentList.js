import React, { useMemo, useState } from 'react';
import { deleteDocument, deleteFolder } from '../services/api';

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

  // Track which folders are currently being deleted (for loading state)
  const [deletingFolders, setDeletingFolders] = useState(new Set());

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

  const handleDeleteFolder = async (folderPath, itemCount) => {
    if (
      !window.confirm(
        `Delete entire folder "${folderPath}" and all ${itemCount} file${itemCount === 1 ? '' : 's'} inside it?\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingFolders((prev) => new Set(prev).add(folderPath));
    try {
      await deleteFolder(folderPath);
      onDelete();
    } catch (error) {
      alert(`Error deleting folder: ${error.message}`);
    } finally {
      setDeletingFolders((prev) => {
        const next = new Set(prev);
        next.delete(folderPath);
        return next;
      });
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
        {groupedDocuments.map((group) => {
          const isDeletingThisFolder = deletingFolders.has(group.folderPath);
          return (
            <section key={group.folderPath} className="doc-folder-group">
              <div className="doc-folder-head">
                <span className="doc-folder-path">{group.folderPath}</span>
                <span className="doc-folder-count">{group.items.length}</span>

                {/* Delete entire folder button */}
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={isDeletingThisFolder}
                  title={`Delete entire folder "${group.folderPath}"`}
                  onClick={() => handleDeleteFolder(group.folderPath, group.items.length)}
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 10px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    opacity: isDeletingThisFolder ? 0.6 : 1
                  }}
                >
                  {isDeletingThisFolder ? (
                    <>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 0.75s linear infinite',
                          display: 'inline-block'
                        }}
                      />
                      Deleting…
                    </>
                  ) : (
                    '🗑 Delete Folder'
                  )}
                </button>
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
          );
        })}
      </div>
    </section>
  );
};

export default DocumentList;
