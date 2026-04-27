import json
import re
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="Local Answer API")


class GenerateRequest(BaseModel):
    model: str = "local-extractive"
    prompt: str
    stream: bool = False
    format: str = "json"


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was",
    "were", "what", "when", "where", "which", "with", "you", "your"
}


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def tokenize(value: str) -> List[str]:
    return re.findall(r"[a-z0-9]{2,}", (value or "").lower())


def parse_prompt(prompt: str):
    question_match = re.search(r"Question:\s*(.*?)\n\s*\n\s*Context chunks:", prompt, flags=re.S | re.I)
    context_match = re.search(r"Context chunks:\s*(.*)$", prompt, flags=re.S | re.I)

    question = normalize(question_match.group(1) if question_match else "")
    context = context_match.group(1) if context_match else ""

    chunks = []
    for block in [b.strip() for b in context.split("\n\n") if b.strip()]:
        # Expected block:
        # [chunkId] [doc - Page X, Para Y] text
        m = re.match(r"^\[([^\]]+)\]\s+\[[^\]]+\]\s+([\s\S]+)$", block)
        if m:
            chunks.append({"chunk_id": m.group(1).strip(), "text": normalize(m.group(2))})

    return question, chunks


def score_chunk(question: str, chunk_text: str) -> float:
    q_tokens = [t for t in tokenize(question) if t not in STOPWORDS]
    if not q_tokens:
        return 0.0

    chunk_tokens = tokenize(chunk_text)
    chunk_set = set(chunk_tokens)

    overlap = sum(1 for t in q_tokens if t in chunk_set)
    overlap_score = overlap / max(1, len(set(q_tokens)))

    quoted = [m[0] or m[1] for m in re.findall(r'"([^"]+)"|\'([^\']+)\'', question)]
    numeric = re.findall(r"\d{3,}", question)
    exact_tokens = [normalize(x).lower() for x in (quoted + numeric) if normalize(x)]
    exact_boost = 0.35 if any(t and t in chunk_text.lower() for t in exact_tokens) else 0.0

    return overlap_score + exact_boost


def first_sentence(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", normalize(text))
    return parts[0] if parts else normalize(text)


def answer_from_chunks(question: str, chunks: List[dict]):
    if not chunks:
        return {
            "answer": "I could not find this in the uploaded documents.",
            "citations": []
        }

    ranked = sorted(
        ({**c, "score": score_chunk(question, c["text"])} for c in chunks),
        key=lambda x: x["score"],
        reverse=True
    )

    top = [c for c in ranked if c["score"] > 0][:3]
    if not top:
        return {
            "answer": "I could not find this in the uploaded documents.",
            "citations": []
        }

    lines = []
    for c in top[:2]:
        lines.append(first_sentence(c["text"]))

    answer_text = " ".join([l for l in lines if l]).strip()
    if not answer_text:
        answer_text = "I could not find this in the uploaded documents."

    return {
        "answer": answer_text,
        "citations": [c["chunk_id"] for c in top]
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "local-answer-api"}


@app.post("/generate")
def generate(req: GenerateRequest):
    question, chunks = parse_prompt(req.prompt)
    result = answer_from_chunks(question, chunks)
    return {
        "model": req.model,
        "done": True,
        "response": json.dumps(result, ensure_ascii=True)
    }
