import os
from typing import List

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer


class EmbedRequest(BaseModel):
    texts: List[str]


MODEL_DIR = os.getenv("LOCAL_EMBEDDING_MODEL_DIR", "models/custom-e5")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

app = FastAPI(title="Local Embedding API")
model = None


@app.on_event("startup")
def load_model():
    global model
    try:
        model = SentenceTransformer(MODEL_DIR, device=DEVICE)
    except Exception as exc:
        raise RuntimeError(f"Failed to load model from {MODEL_DIR}: {exc}") from exc


@app.get("/health")
def health():
    return {"ok": True, "model_dir": MODEL_DIR, "device": DEVICE}


@app.post("/embed")
def embed(request: EmbedRequest):
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded.")
    if not request.texts:
        return {"embeddings": []}

    vectors = model.encode(
        request.texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return {"embeddings": vectors.tolist()}
