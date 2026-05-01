# 🤖 AI PDF Retrieval — Project Explanation
### *A Simple Guide for the Team*

---

## 🎯 What Does This Project Do? (In One Line)

> You upload PDFs → Ask questions in text or voice → The AI finds the answer from inside those PDFs → Shows the answer with **exact page & paragraph citations**.

---

## 🏗️ Tech Stack — What Tools We Use

| Layer | Technology | What It Does |
|---|---|---|
| **Frontend UI** | React.js | The webpage the user sees and interacts with |
| **Backend API** | Node.js + Express | The server that handles all requests |
| **AI Brain** | Google Gemini API | Understands questions and generates answers |
| **Embeddings** | Gemini / Custom Python model | Converts text into numbers (vectors) for smart search |
| **Local AI Server** | Python FastAPI + `uvicorn` | Serves our own fine-tuned embedding model |
| **ML Training** | `sentence-transformers` (Python) | Fine-tunes an embedding model on our own data |
| **Database** | MongoDB (or local JSON fallback) | Stores PDF chunks and their embeddings |
| **PDF Reading** | `pdf-parse` (Node.js) | Extracts text from PDFs page by page |
| **OCR (optional)** | Tesseract + Poppler | Reads scanned/image PDFs that have no selectable text |
| **PDF Export** | PDFKit | Generates a downloadable PDF report of the answer |

---

## 🔄 How It Works — Step by Step

### Step 1: You Upload a PDF
- The backend reads the PDF using `pdf-parse`
- It splits the text into small **chunks** (pieces) — each chunk has a page number and paragraph number
- If a page is a scanned image (no selectable text), **Tesseract OCR** reads it visually

### Step 2: Creating Embeddings (The "Memory")
- Each text chunk is converted into a list of numbers called a **vector** (embedding)
- Think of it like a **GPS coordinate for meaning** — similar sentences get similar coordinates
- These vectors are stored in MongoDB alongside the chunk text
- This is what makes the search "smart" — it's not just keyword matching

### Step 3: You Ask a Question
- If you use **voice**, the browser converts your speech to text first (Web Speech API)
- Your question also gets converted into a vector using the same embedding model

### Step 4: Finding the Best Chunks (Retrieval)
- The system compares your question's vector against all stored chunk vectors
- It uses **Cosine Similarity** — a math formula that measures how "close" two vectors are in meaning
- It also does **keyword matching** for extra accuracy
- Special smart logic handles record lookups (e.g. *"give me all details for post ID 30136468"*)

### Step 5: Generating the Answer (via Gemini)
- The top matching chunks are sent to **Google Gemini** as context
- The AI is told: *"Answer ONLY using these chunks, return answer + source chunk IDs"*
- Gemini returns a structured JSON: `{"answer": "...", "citations": ["chunk1", "chunk2"]}`

### Step 6: Showing the Answer
- The frontend maps the cited chunk IDs back to file names, page numbers, and paragraph numbers
- The user sees the **answer** + **source cards** showing exactly where it came from

### Step 7: Download PDF Report (Optional)
- User clicks "Download PDF"
- Backend uses **PDFKit** to generate and stream a real PDF with the answer + sources

---

## 🧠 About the AI Models

### Two Types of AI Are Used:

| | Embedding Model | Answer Model |
|---|---|---|
| **Job** | Convert text → numbers | Read context → write answer |
| **Default (Cloud)** | `gemini-embedding-001` | `gemini-2.5-flash` |
| **Local option** | Fine-tuned `multilingual-e5-base` | `llama3.1:8b` via Ollama |

### Our Custom Fine-Tuned Model (the `ml/` folder):
- Starts from a pre-trained model: **`intfloat/multilingual-e5-base`** (understands 100+ languages)
- We further train it on **our own PDF data** to make it better at our specific domain
- It gets served as a **FastAPI Python server** at `http://127.0.0.1:8000/embed`

---

## 🗂️ Project Folder Structure

```
ai-pdf-retrieval/
├── frontend/client/         → React UI (what users see)
├── backend/                 → Node.js Express API server
│   ├── services/
│   │   ├── aiService.js     → ALL the AI logic (retrieval, prompts, scoring)
│   │   └── pdfService.js    → PDF upload + chunking
│   ├── controllers/         → Route handlers (PDF upload, queries)
│   ├── uploads/             → Stored PDF files
│   └── data/                → Local JSON fallback (when no MongoDB)
└── ml/                      → Python ML training + local embedding server
    ├── train_embedding.py   → Fine-tune the embedding model
    ├── embed_api.py         → FastAPI server to serve the model
    └── models/custom-e5/    → Our saved fine-tuned model
```

---

## 🌊 Complete Data Flow

```
╔══════════════════════════════════════════════════════════════╗
║                        PDF UPLOAD FLOW                       ║
╚══════════════════════════════════════════════════════════════╝

  [User Browser]
       │  Upload PDF
       ▼
  [React Frontend] ──POST /api/pdf/upload──▶ [Express Backend]
                                                     │
                                           pdf-parse / Tesseract OCR
                                                     │
                                             Split into chunks
                                                     │
                                           Embed each chunk (Gemini/Local)
                                                     │
                                           Store in MongoDB / JSON file


╔══════════════════════════════════════════════════════════════╗
║                        QUERY FLOW                            ║
╚══════════════════════════════════════════════════════════════╝

  [User types/speaks question]
       │
  [React Frontend] ──POST /api/query/text──▶ [Express Backend]
                                                     │
                                           Embed the question
                                                     │
                                           Cosine similarity search
                                                     │
                                           Top N chunks selected
                                                     │
                                           Send to Gemini with prompt
                                                     │
                                           Gemini returns answer + citations
                                                     │
  [React Frontend] ◀── JSON response ───── Map citations → page/paragraph
       │
  [User sees answer + source cards]
```

---

## ⚙️ Special Smart Features

| Feature | How It Works |
|---|---|
| **Record Lookup** | Ask "details for post ID 30136468" → direct table scan, no AI needed |
| **All Details Query** | Ask "give me all details" → returns every field (ID, office, marks, etc.) |
| **Voice Input** | Browser Web Speech API converts voice → text → same pipeline |
| **Multilingual Support** | Handles Hindi and other languages via query normalization |
| **OCR Fallback** | Scanned PDFs automatically use Tesseract |
| **Quota Fallback** | If Gemini API limit hits, extracts text directly from matched chunks |
| **PDF Report Export** | Generates a downloadable PDF with the answer + citations |

---

## 🌐 API Endpoints (Backend)

| Method | Endpoint | What It Does |
|---|---|---|
| `POST` | `/api/pdf/upload` | Upload a PDF file |
| `POST` | `/api/query/text` | Ask a text question |
| `POST` | `/api/query/voice` | Ask a voice question |
| `POST` | `/api/query/export-pdf` | Download answer as PDF |
| `GET` | `/api/health` | Check if AI services are running |

---

## 🚀 How to Run the Project

Open **3 separate terminal windows** and run:

```powershell
# Terminal 1 — Python ML Embedding Server
cd d:\VIT\edi\ai-pdf-retrieval\ml
.\.venv\Scripts\Activate.ps1
uvicorn embed_api:app --host 127.0.0.1 --port 8000

# Terminal 2 — Node.js Backend (API Server)
cd d:\VIT\edi\ai-pdf-retrieval\backend
npm start

# Terminal 3 — React Frontend (UI)
cd d:\VIT\edi\ai-pdf-retrieval\frontend\client
npm start
```

Then open **http://localhost:3000** in your browser ✅

### Ports Used:
| Service | Port | URL |
|---|---|---|
| React Frontend | 3000 | http://localhost:3000 |
| Express Backend | 5000 | http://localhost:5000 |
| Python ML Server | 8000 | http://localhost:8000 |

---

## 🔑 Environment Config (`backend/.env`)

```env
PORT=5000
GEMINI_API_KEY=your_key_here          # Google Gemini API Key
MONGODB_URI=your_mongodb_uri          # MongoDB connection string
EMBEDDING_PROVIDER=gemini             # "gemini" or "local"
ANSWER_PROVIDER=gemini                # "gemini" or "local"
LOCAL_EMBEDDING_URL=http://127.0.0.1:8000/embed
OCR_ENABLED=false                     # Set true for scanned PDFs
```

---

## 📦 Key Dependencies

### Backend (Node.js)
- `express` — Web server framework
- `pdf-parse` — Extract text from PDFs
- `pdfkit` — Generate PDF reports
- `mongodb` — Database driver
- `multer` — Handle file uploads
- `axios` — Make HTTP requests (to Gemini API)
- `dotenv` — Load environment variables

### Frontend (React)
- `axios` — API calls to backend
- `react-speech-recognition` — Voice input
- `pdfjs-dist` — PDF viewer in browser

### Python ML
- `sentence-transformers` — Train/use embedding models
- `fastapi` + `uvicorn` — Serve the embedding API
- `torch` — Deep learning backend

---

*Document generated for internal team use — AI PDF Retrieval Project*
