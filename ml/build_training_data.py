import argparse
import json
import os
import random
import re
from pathlib import Path

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient
from pypdf import PdfReader


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was",
    "were", "what", "when", "where", "which", "with", "you", "your"
}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def first_sentence(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return normalize_text(parts[0] if parts else text)


def extract_keywords(text: str, limit: int = 5) -> list[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9-]{2,}", text.lower())
    freq = {}
    for word in words:
        if word in STOPWORDS:
            continue
        freq[word] = freq.get(word, 0) + 1
    ranked = sorted(freq.items(), key=lambda x: (-x[1], -len(x[0]), x[0]))
    return [w for w, _ in ranked[:limit]]


def generate_queries(text: str) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []

    lead = first_sentence(text)
    keywords = extract_keywords(text)
    key_phrase = ", ".join(keywords[:3]) if keywords else lead[:60]
    short_lead = " ".join(lead.split()[:12]).strip()

    queries = [
        f"What does this section say about {key_phrase}?",
        f"Summarize this: {short_lead}",
        f"Explain the main point in this paragraph.",
    ]
    if keywords:
        queries.append(f"What is mentioned about {keywords[0]}?")
    return [normalize_text(q) for q in queries if q.strip()]


def load_documents(mongo_uri_override: str = "") -> list[dict]:
    project_root = Path(__file__).resolve().parents[1]
    env_path = project_root / "backend" / ".env"
    load_dotenv(env_path)

    mongo_uri = (mongo_uri_override or os.getenv("MONGODB_URI", "")).strip()
    db_name = os.getenv("MONGODB_DB_NAME", "ai_pdf_retrieval").strip()
    collection_name = os.getenv("MONGODB_COLLECTION_NAME", "documents").strip()

    if not mongo_uri:
        raise RuntimeError("MONGODB_URI missing in backend/.env")

    try:
        client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        docs = list(client[db_name][collection_name].find({}, {"_id": 0}))
        client.close()
        return docs
    except Exception as exc:
        raise RuntimeError(
            "Failed to fetch documents from MongoDB. "
            "Try --mongo-uri with mongodb+srv URI, or use --input-json fallback."
        ) from exc


def chunk_payload(doc: dict, chunk: dict) -> dict:
    return {
        "fileName": doc.get("fileName"),
        "originalName": doc.get("originalName"),
        "chunkId": chunk.get("chunkId"),
        "page": chunk.get("page"),
        "paragraph": chunk.get("paragraph"),
        "text": normalize_text(chunk.get("text", "")),
    }


def split_into_paragraphs(text: str, max_chars: int = 1200) -> list[str]:
    cleaned = normalize_text(text)
    if not cleaned:
        return []

    raw_parts = re.split(r"\n{2,}", text)
    paragraphs = []

    for part in raw_parts:
        value = normalize_text(part)
        if not value:
            continue
        if len(value) <= max_chars:
            paragraphs.append(value)
            continue

        sentences = re.split(r"(?<=[.!?])\s+", value)
        current = []
        current_len = 0
        for sentence in sentences:
            sentence = normalize_text(sentence)
            if not sentence:
                continue
            projected = current_len + len(sentence) + (1 if current else 0)
            if projected > max_chars and current:
                paragraphs.append(" ".join(current))
                current = [sentence]
                current_len = len(sentence)
            else:
                current.append(sentence)
                current_len = projected
        if current:
            paragraphs.append(" ".join(current))

    return paragraphs


def load_documents_from_uploads() -> list[dict]:
    uploads_dir = Path(__file__).resolve().parents[1] / "backend" / "uploads"
    if not uploads_dir.exists():
        raise RuntimeError("No uploads directory found for PDF fallback.")

    docs = []
    for pdf_path in sorted(uploads_dir.glob("*.pdf")):
        reader = PdfReader(str(pdf_path))
        structured = []
        for page_idx, page in enumerate(reader.pages, start=1):
            page_text = page.extract_text() or ""
            paragraphs = split_into_paragraphs(page_text)
            for para_idx, para in enumerate(paragraphs, start=1):
                structured.append({
                    "chunkId": f"{pdf_path.name}::p{page_idx}::para{para_idx}",
                    "page": page_idx,
                    "paragraph": para_idx,
                    "text": para,
                })

        if structured:
            docs.append({
                "fileName": pdf_path.name,
                "originalName": pdf_path.name,
                "structuredData": structured,
            })
    return docs


def build_samples(documents: list[dict], seed: int = 42) -> list[dict]:
    random.seed(seed)
    all_chunks = []

    for doc in documents:
        for chunk in doc.get("structuredData", []) or []:
            payload = chunk_payload(doc, chunk)
            if len(payload["text"]) >= 80:
                all_chunks.append(payload)

    if len(all_chunks) < 10:
        raise RuntimeError("Not enough chunks found. Upload more PDFs before training.")

    samples = []
    seen = set()

    for idx, chunk in enumerate(all_chunks):
        negatives = [c for i, c in enumerate(all_chunks) if i != idx and c["fileName"] != chunk["fileName"]]
        if not negatives:
            negatives = [c for i, c in enumerate(all_chunks) if i != idx]
        if not negatives:
            continue

        for query in generate_queries(chunk["text"]):
            negative = random.choice(negatives)
            key = (query, chunk["chunkId"], negative["chunkId"])
            if key in seen:
                continue
            seen.add(key)
            samples.append({
                "query": query,
                "positive": chunk["text"],
                "negative": negative["text"],
                "positive_meta": {
                    "chunkId": chunk["chunkId"],
                    "page": chunk["page"],
                    "paragraph": chunk["paragraph"],
                    "fileName": chunk["fileName"],
                    "originalName": chunk["originalName"],
                },
            })

    random.shuffle(samples)
    return samples


def write_jsonl(records: list[dict], file_path: Path) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with file_path.open("w", encoding="utf-8") as handle:
        for row in records:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Build weakly supervised retrieval training data.")
    parser.add_argument("--output-dir", default="data", help="Folder for train/val JSONL files.")
    parser.add_argument("--val-ratio", type=float, default=0.1, help="Validation split ratio.")
    parser.add_argument("--input-json", default="", help="Optional local JSON file with document records.")
    parser.add_argument("--mongo-uri", default="", help="Optional Mongo URI override.")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    if args.input_json:
        with Path(args.input_json).open("r", encoding="utf-8") as handle:
            docs = json.load(handle)
    else:
        try:
            docs = load_documents(mongo_uri_override=args.mongo_uri)
        except Exception as exc:
            print(f"Mongo load failed ({exc}). Falling back to PDFs in backend/uploads.")
            docs = load_documents_from_uploads()
    samples = build_samples(docs, seed=args.seed)

    split_at = max(1, int(len(samples) * (1 - args.val_ratio)))
    train_rows = samples[:split_at]
    val_rows = samples[split_at:]

    write_jsonl(train_rows, output_dir / "train.jsonl")
    write_jsonl(val_rows, output_dir / "val.jsonl")

    print(f"Built {len(samples)} samples")
    print(f"Train: {len(train_rows)} -> {output_dir / 'train.jsonl'}")
    print(f"Val: {len(val_rows)} -> {output_dir / 'val.jsonl'}")


if __name__ == "__main__":
    main()
