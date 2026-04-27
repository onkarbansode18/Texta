import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import DocumentList from './components/DocumentList';
import QueryInterface from './components/QueryInterface';
import ResultDisplay from './components/ResultDisplay';
import { getDocuments } from './services/api';
import './App.css';

function App() {
  const [documents, setDocuments] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedFileNames, setSelectedFileNames] = useState([]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const data = await getDocuments();
      const nextDocuments = data.documents || [];
      setDocuments(nextDocuments);
      setSelectedFileNames((prev) => {
        const available = new Set(nextDocuments.map((doc) => doc.fileName));
        const preserved = prev.filter((fileName) => available.has(fileName));
        if (preserved.length > 0) {
          const preservedSet = new Set(preserved);
          const newlyAdded = nextDocuments
            .map((doc) => doc.fileName)
            .filter((fileName) => !preservedSet.has(fileName));
          return [...preserved, ...newlyAdded];
        }
        return nextDocuments.map((doc) => doc.fileName);
      });
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = () => fetchDocuments();
  const handleDocumentDelete = () => {
    fetchDocuments();
    setResult(null);
  };
  const handleQueryResult = (queryResult) => setResult(queryResult);
  const handleSelectionChange = (nextSelectedFileNames) => {
    setSelectedFileNames(nextSelectedFileNames);
    setResult(null);
  };

  return (
    <div className="app-shell">
      <div className="bg-canvas">
        <div className="bg-mesh bg-mesh-1" />
        <div className="bg-mesh bg-mesh-2" />
        <div className="bg-mesh bg-mesh-3" />
      </div>

      <main className="app-main">
        <header className="hero">
          <div>
            <div className="hero-label">
              <span className="hero-label-dot" />
              Texta
            </div>
            <h1>
              Texta:
              <br />
              <em>AI-Powered Knowledge Retrieval</em>
            </h1>
            <p className="hero-subtitle">
              Upload your documents, ask by text or voice, and get grounded answers
              with clear citations from the exact source PDF and lines.
            </p>
          </div>
          <div className="hero-stats">
            <div>
              <div className="hero-stat-num">{documents.length}</div>
              <div className="hero-stat-label">Documents</div>
            </div>
            <div className="hero-stat-divider" />
            <div>
              <div className="hero-stat-num">
                {documents.reduce((sum, d) => sum + (d.numPages || 0), 0)}
              </div>
              <div className="hero-stat-label">Pages indexed</div>
            </div>
          </div>
        </header>

        <div className="section-grid">
          <FileUpload onUploadSuccess={handleUploadSuccess} />

          {loading ? (
            <div className="panel loading-panel">
              <div className="loading-spinner" />
              Loading documents...
            </div>
          ) : (
            <DocumentList
              documents={documents}
              selectedFileNames={selectedFileNames}
              onSelectionChange={handleSelectionChange}
              onDelete={handleDocumentDelete}
            />
          )}
        </div>

        {documents.length > 0 && (
          <div className="query-panel">
            <QueryInterface
              onResult={handleQueryResult}
              selectedFileNames={selectedFileNames}
              selectedCount={selectedFileNames.length}
            />
          </div>
        )}

        {result && (
          <div className="result-panel">
            <ResultDisplay result={result} />
          </div>
        )}

        <footer className="app-footer">
          Texta <span className="footer-dot" /> AI-Powered Knowledge Retrieval
        </footer>
      </main>
    </div>
  );
}

export default App;
