import argparse
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_EMBEDDINGS = BASE_DIR / "processed_data" / "embeddings.npy"
DEFAULT_MODEL_DIR = BASE_DIR / "trained_model"
DEFAULT_DOCUMENTS_FILE = BASE_DIR / "processed_data" / "all_documents.txt"
DEFAULT_TEXT_FILES = [
    BASE_DIR / "processed_data" / "research_text.txt",
    BASE_DIR / "processed_data" / "loan_text.txt",
    BASE_DIR / "processed_data" / "financial_text.txt",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Search documents using stored embeddings.")
    parser.add_argument(
        "--embeddings",
        default=str(DEFAULT_EMBEDDINGS),
        help="Path to embeddings .npy file",
    )
    parser.add_argument(
        "--model",
        default=str(DEFAULT_MODEL_DIR),
        help="Path to the trained SentenceTransformer model directory",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        help="Number of search results to display",
    )
    parser.add_argument(
        "--documents",
        default=str(DEFAULT_DOCUMENTS_FILE),
        help="Path to the flattened documents file created by generate_embeddings.py",
    )
    return parser.parse_args()


def load_documents(files):
    documents = []
    for file_path in files:
        with open(file_path, "r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if line:
                    documents.append(line)
    return documents


def load_documents_for_search(documents_path):
    path = Path(documents_path)
    if path.exists():
        with open(path, "r", encoding="utf-8") as file:
            return [line.strip() for line in file if line.strip()]
    return load_documents(DEFAULT_TEXT_FILES)


def main():
    args = parse_args()
    embeddings = np.load(args.embeddings)
    documents = load_documents_for_search(args.documents)[: len(embeddings)]
    model = SentenceTransformer(args.model)

    while True:
        query = input("\nEnter search query (or type exit): ").strip()

        if query.lower() == "exit":
            break

        query_embedding = model.encode([query], normalize_embeddings=True)
        similarities = cosine_similarity(query_embedding, embeddings)[0]
        top_indices = similarities.argsort()[-args.top_k :][::-1]

        print("\nTop results:\n")
        for index in top_indices:
            print(documents[index])
            print("Similarity:", similarities[index])
            print("-" * 50)


if __name__ == "__main__":
    main()
