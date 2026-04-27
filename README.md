# AI PDF Retrieval (RAG with Citations)

This project is an end-to-end RAG pipeline:
PDF ingestion -> chunking -> embeddings -> semantic retrieval -> LLM answer with citations -> exportable PDF report.

## System startup
1. Frontend runs on `http://127.0.0.1:3000` (React UI).
2. Backend runs on `http://127.0.0.1:5000` (Express API).
3. Optional local embedding API runs on `http://127.0.0.1:8000` (Python FastAPI model server).
4. Runtime config is loaded from [backend/.env](/d:/VIT/edi/ai-pdf-retrieval/backend/.env).

## Document upload flow
1. You upload a PDF from the UI.
2. Frontend calls `POST /api/pdf/upload`.
3. Backend stores the file in `backend/uploads`.
4. Backend extracts text page-by-page and paragraph-by-paragraph.
5. If a page has little or no selectable text and OCR is enabled, backend falls back to OCR for that page.
6. Backend creates chunks with metadata:
   - `fileName`
   - `page`
   - `paragraph`
   - `chunkId`
   - `text`
7. Backend generates embeddings for every chunk.
8. Backend stores chunk data plus embeddings.
9. If MongoDB is unavailable, it falls back to local JSON:
   [backend/data/documents-index.json](/d:/VIT/edi/ai-pdf-retrieval/backend/data/documents-index.json).

Main files:
- [backend/services/pdfService.js](/d:/VIT/edi/ai-pdf-retrieval/backend/services/pdfService.js)
- [backend/utils/textExtractor.js](/d:/VIT/edi/ai-pdf-retrieval/backend/utils/textExtractor.js)

## OCR support for scanned PDFs
Scanned or image-only PDFs can be ingested by enabling OCR in [backend/.env](/d:/VIT/edi/ai-pdf-retrieval/backend/.env):

- `OCR_ENABLED=true`
- `OCR_LANGUAGE=eng`
- `OCR_RENDER_DPI=200`
- `OCR_PAGE_TEXT_THRESHOLD=20`
- `OCR_PSM=3`
- `TESSERACT_PATH=tesseract`
- `PDFTOPPM_PATH=pdftoppm`

This fallback requires two system tools to be installed and available on PATH:

- Tesseract OCR (`tesseract`)
- Poppler utils (`pdftoppm`)

Behavior:
- Selectable-text PDFs continue using fast native extraction.
- OCR only runs for pages that come back nearly empty.
- If OCR is enabled but the tools are missing, scanned PDFs will fail with a clear setup message.

## Query flow (text or voice)
1. User asks a question by text or voice.
2. Voice is converted to text in the browser.
3. Backend receives query at:
   - `POST /api/query/text`
   - `POST /api/query/voice`
4. Backend creates query embedding.
5. Backend compares query vector with chunk vectors using cosine similarity.
6. Top semantic matches are selected.

Main files:
- [backend/services/aiService.js](/d:/VIT/edi/ai-pdf-retrieval/backend/services/aiService.js)
- [backend/controllers/queryController.js](/d:/VIT/edi/ai-pdf-retrieval/backend/controllers/queryController.js)

## Answer generation + citations
1. Backend sends top chunks as context to Gemini answer model.
2. Model is instructed to:
   - answer only from provided chunks
   - return strict JSON
   - include cited `chunkId`s
3. Backend maps cited `chunkId` back to metadata:
   - file name
   - page number
   - paragraph
   - source text
4. Response is returned to frontend.

Frontend shows:
- final answer
- cited source cards with page/paragraph

## PDF export flow
1. User clicks Download PDF.
2. Frontend calls `POST /api/query/export-pdf` with query, answer, and sources.
3. Backend builds report PDF via PDFKit.
4. Export stays compact:
   - answer trimmed
   - max 3 sources
   - short excerpt + page/paragraph per source
5. PDF is streamed back for browser download.

Main files:
- [frontend/client/src/components/ResultDisplay.js](/d:/VIT/edi/ai-pdf-retrieval/frontend/client/src/components/ResultDisplay.js)
- [frontend/client/src/services/api.js](/d:/VIT/edi/ai-pdf-retrieval/frontend/client/src/services/api.js)
- [backend/controllers/queryController.js](/d:/VIT/edi/ai-pdf-retrieval/backend/controllers/queryController.js)

## Custom model training workflow (optional)
1. Build training pairs/triples from uploaded PDFs.
2. Fine-tune embedding model (`sentence-transformers`).
3. Save model at `ml/models/custom-e5`.
4. Serve model with FastAPI at `/embed`.
5. Use backend local embedding provider:
   - `EMBEDDING_PROVIDER=local`
   - `LOCAL_EMBEDDING_URL=http://127.0.0.1:8000/embed`

Training files:
- [ml/build_training_data.py](/d:/VIT/edi/ai-pdf-retrieval/ml/build_training_data.py)
- [ml/train_embedding.py](/d:/VIT/edi/ai-pdf-retrieval/ml/train_embedding.py)
- [ml/embed_api.py](/d:/VIT/edi/ai-pdf-retrieval/ml/embed_api.py)
- [ml/README.md](/d:/VIT/edi/ai-pdf-retrieval/ml/README.md)

## Provider config summary
- Gemini mode (current default in backend):
  - `EMBEDDING_PROVIDER=gemini`
  - `ANSWER_PROVIDER=gemini`
  - `GEMINI_API_KEY=...`
- Local mode:
  - `EMBEDDING_PROVIDER=local`
  - `LOCAL_EMBEDDING_URL=http://127.0.0.1:8000/embed`
  - `ANSWER_PROVIDER=local`
  - `LOCAL_ANSWER_URL=http://127.0.0.1:11434/api/generate`
  - `LOCAL_ANSWER_MODEL=llama3.1:8b`
