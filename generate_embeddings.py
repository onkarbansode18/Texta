import argparse
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_DIR = BASE_DIR / "trained_model"
DEFAULT_OUTPUT_DIR = BASE_DIR / "processed_data"
DEFAULT_TEXT_FILES = [
    BASE_DIR / "processed_data" / "research_text.txt",
    BASE_DIR / "processed_data" / "loan_text.txt",
    BASE_DIR / "processed_data" / "financial_text.txt",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate document embeddings using a trained SentenceTransformer model."
    )
    parser.add_argument(
        "--model",
        default=str(DEFAULT_MODEL_DIR),
        help="Path to the trained model directory",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Batch size for model.encode()",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory to save embeddings.npy and all_documents.txt",
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


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    documents = load_documents(DEFAULT_TEXT_FILES)
    if not documents:
        raise ValueError("No documents found in processed_data text files.")

    model = SentenceTransformer(args.model)
    embeddings = model.encode(
        documents,
        batch_size=args.batch_size,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    np.save(output_dir / "embeddings.npy", embeddings)
    with open(output_dir / "all_documents.txt", "w", encoding="utf-8") as file:
        file.write("\n".join(documents))

    print(f"Saved embeddings: {output_dir / 'embeddings.npy'}")
    print(f"Saved documents: {output_dir / 'all_documents.txt'}")
    print(f"Embedding shape: {embeddings.shape}")


if __name__ == "__main__":
    main()
