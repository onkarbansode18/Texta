# Local Model Training (Embeddings)

This folder lets you train and use your own embedding model for retrieval.

## 1. Create Python env and install

```powershell
cd d:\VIT\edi\ai-pdf-retrieval\ml
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2. Build training data from your MongoDB documents

```powershell
python build_training_data.py --output-dir data --val-ratio 0.1
```

This reads `../backend/.env` for:
- `MONGODB_URI`
- `MONGODB_DB_NAME` (defaults to `ai_pdf_retrieval`)
- `MONGODB_COLLECTION_NAME` (defaults to `documents`)

If Mongo TLS fails on Python, export JSON via backend and use fallback:

```powershell
cd d:\VIT\edi\ai-pdf-retrieval\backend
npm run export-docs -- d:\VIT\edi\ai-pdf-retrieval\ml\data\documents-export.json
cd ..\ml
python build_training_data.py --input-json data/documents-export.json --output-dir data --val-ratio 0.1
```

## 3. Train your embedding model

```powershell
python train_embedding.py --base-model intfloat/multilingual-e5-base --train-file data/train.jsonl --val-file data/val.jsonl --output-dir models/custom-e5 --epochs 1 --batch-size 16
```

For better quality, increase `--epochs` to `2` or `3` if GPU is available.

## 4. Run local embedding API

```powershell
$env:LOCAL_EMBEDDING_MODEL_DIR="d:\VIT\edi\ai-pdf-retrieval\ml\models\custom-e5"
uvicorn embed_api:app --host 127.0.0.1 --port 8000
```

## 5. Switch backend to local embeddings

In `../backend/.env` add:

```env
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_URL=http://127.0.0.1:8000/embed
```

Then restart backend.

## Important

- Main app mode can use Gemini for embeddings/answers, or local providers.
- When provider changes, backend will refresh document embeddings automatically.
- Training from scratch is not done here; this fine-tunes an existing strong embedding model.
