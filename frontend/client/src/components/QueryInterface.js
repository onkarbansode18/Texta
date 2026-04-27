import React, { useMemo, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { textQuery, voiceQuery } from '../services/api';

const QueryInterface = ({ onResult, selectedFileNames = [], selectedCount = 0 }) => {
  const [questions, setQuestions] = useState(['']);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US');

  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition();

  const normalizedQuestions = useMemo(() => {
    const cleaned = questions
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    return Array.from(new Set(cleaned));
  }, [questions]);

  const updateQuestion = (index, value) => {
    setQuestions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, '']);
  };

  const removeQuestion = (index) => {
    setQuestions((prev) => {
      if (prev.length <= 1) {
        return [''];
      }

      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [''];
    });
  };

  const handleTextQuery = async () => {
    if (normalizedQuestions.length === 0) {
      alert('Please enter at least one question');
      return;
    }

    if (selectedCount === 0) {
      alert('Please select at least one file from the repository.');
      return;
    }

    setLoading(true);
    try {
      const payload = normalizedQuestions.length === 1 ? normalizedQuestions[0] : normalizedQuestions;
      const result = await textQuery(payload, selectedFileNames);
      onResult(result);
    } catch (error) {
      alert(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    resetTranscript();
    setIsListening(true);
    SpeechRecognition.startListening({ continuous: true, language: speechLang });
  };

  const stopListening = async () => {
    SpeechRecognition.stopListening();
    setIsListening(false);
    if (transcript.trim()) {
      if (selectedCount === 0) {
        alert('Please select at least one file from the repository.');
        return;
      }

      setLoading(true);
      try {
        const result = await voiceQuery(transcript, selectedFileNames);
        onResult(result);
        setQuestions((prev) => {
          const hasEmpty = prev.some((item) => !String(item || '').trim());
          if (hasEmpty) {
            const firstEmpty = prev.findIndex((item) => !String(item || '').trim());
            return prev.map((item, index) => (index === firstEmpty ? transcript : item));
          }
          return [...prev, transcript];
        });
      } catch (error) {
        alert(`Error: ${error.response?.data?.error || error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleTextQuery();
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 4 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0,
              color: '#ffffff',
              fontWeight: 700
            }}
          >
            Q
          </div>
          <h2 style={{ margin: 0 }}>Ask a Question</h2>
        </div>
        <p style={{ margin: '4px 0 0 46px', fontSize: 13, color: 'var(--ink-3)' }}>
          Search only inside the selected files. Click + to add another question. Tip: Ctrl+Enter to submit.
        </p>
        <p style={{ margin: '8px 0 0 46px', fontSize: 12, color: selectedCount > 0 ? 'var(--ink-3)' : '#b42318' }}>
          {selectedCount > 0
            ? `${selectedCount} file${selectedCount === 1 ? '' : 's'} selected for search.`
            : 'No files selected. Choose at least one file from the repository.'}
        </p>
      </div>

      <div className="query-layout">
        <div>
          <label className="field-label">Your question(s)</label>
          <div className="question-list">
            {questions.map((question, index) => (
              <div key={`question-${index}`} className="question-row">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => updateQuestion(index, e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="question-input"
                  placeholder={`Question ${index + 1}`}
                />
                <button
                  type="button"
                  className="btn btn-question-add"
                  onClick={addQuestion}
                  title="Add next question"
                >
                  +
                </button>
                {questions.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-question-remove"
                    onClick={() => removeQuestion(index)}
                    title="Remove this question"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleTextQuery}
            disabled={loading || normalizedQuestions.length === 0 || selectedCount === 0}
            className="btn btn-primary btn-full"
            type="button"
          >
            {loading ? (
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
                Searching...
              </>
            ) : 'Search Documents'}
          </button>
        </div>

        <div className="voice-pane">
          <div className="voice-pane-header">
            <div className="voice-icon">V</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Voice Query</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Speak your question</div>
            </div>
          </div>

          {!browserSupportsSpeechRecognition ? (
            <div className="status-message status-error">
              Speech recognition not supported. Use Chrome or Edge.
            </div>
          ) : (
            <>
              <label className="field-label" htmlFor="speech-language">Language</label>
              <select
                id="speech-language"
                value={speechLang}
                onChange={(e) => setSpeechLang(e.target.value)}
                className="input-select"
              >
                <option value="en-US">English (US)</option>
                <option value="hi-IN">Hindi</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="ja-JP">Japanese</option>
                <option value="zh-CN">Chinese</option>
              </select>

              {!isListening ? (
                <button onClick={startListening} className="btn btn-voice btn-full" type="button" disabled={selectedCount === 0}>
                  Start Speaking
                </button>
              ) : (
                <button onClick={stopListening} className="btn btn-stop btn-full" type="button">
                  Stop and Search
                </button>
              )}

              {listening && (
                <div className="listening-chip">
                  <span className="listening-dot" />
                  Listening...
                </div>
              )}

              {transcript && (
                <div className="transcript-box">
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}
                  >
                    Transcript
                  </span>
                  <p style={{ margin: '6px 0 0', color: 'var(--ink)' }}>{transcript}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default QueryInterface;
