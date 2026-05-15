import argparse
import json
import math
from pathlib import Path

import torch
from sentence_transformers import InputExample, SentenceTransformer, losses
from sentence_transformers.evaluation import TripletEvaluator
from torch.utils.data import DataLoader


def load_jsonl(file_path: Path) -> list[dict]:
    rows = []
    with file_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def to_triplets(rows: list[dict]) -> list[InputExample]:
    triplets = []
    for row in rows:
        query    = (row.get("query")    or "").strip()
        positive = (row.get("positive") or "").strip()
        negative = (row.get("negative") or "").strip()
        if query and positive and negative:
            triplets.append(InputExample(texts=[query, positive, negative]))
    return triplets


def to_pairs(rows: list[dict]) -> list[InputExample]:
    """(query, positive) pairs for MultipleNegativesRankingLoss."""
    pairs = []
    for row in rows:
        query    = (row.get("query")    or "").strip()
        positive = (row.get("positive") or "").strip()
        if query and positive:
            pairs.append(InputExample(texts=[query, positive]))
    return pairs


def main():
    parser = argparse.ArgumentParser(description="Fine-tune embedding model for PDF retrieval.")
    parser.add_argument("--base-model",        default="intfloat/multilingual-e5-base")
    parser.add_argument("--train-file",        default="data/train.jsonl")
    parser.add_argument("--val-file",          default="data/val.jsonl")
    parser.add_argument("--output-dir",        default="models/custom-e5")
    parser.add_argument("--epochs",     type=int,   default=5)
    parser.add_argument("--batch-size", type=int,   default=16)
    parser.add_argument("--lr",         type=float, default=1e-5)
    parser.add_argument("--eval-steps", type=int,   default=50)
    parser.add_argument("--max-train-samples", type=int, default=0)
    parser.add_argument("--max-val-samples",   type=int, default=0)
    args = parser.parse_args()

    train_rows = load_jsonl(Path(args.train_file))
    val_rows   = load_jsonl(Path(args.val_file))
    if args.max_train_samples > 0:
        train_rows = train_rows[:args.max_train_samples]
    if args.max_val_samples > 0:
        val_rows = val_rows[:args.max_val_samples]

    train_triplets = to_triplets(train_rows)
    train_pairs    = to_pairs(train_rows)
    val_triplets   = to_triplets(val_rows)

    if not train_triplets:
        raise RuntimeError("Training file has no valid rows.")

    print(f"Train triplets : {len(train_triplets)}")
    print(f"Train pairs    : {len(train_pairs)}")
    print(f"Val triplets   : {len(val_triplets)}")
    print(f"Epochs : {args.epochs}  |  LR: {args.lr}  |  Batch: {args.batch_size}")
    print(f"Device : {'GPU (CUDA)' if torch.cuda.is_available() else 'CPU'}")

    model = SentenceTransformer(args.base_model)

    # Objective 1: TripletLoss — (query, positive, negative)
    triplet_loader = DataLoader(train_triplets, shuffle=True, batch_size=args.batch_size)
    triplet_loss   = losses.TripletLoss(model=model)

    # Objective 2: MultipleNegativesRankingLoss — (query, positive)
    # Uses every other positive in the batch as a hard negative — much stronger signal
    pair_loader = DataLoader(train_pairs, shuffle=True, batch_size=args.batch_size)
    mnrl_loss   = losses.MultipleNegativesRankingLoss(model=model)

    # Evaluator
    evaluator = None
    if val_triplets:
        evaluator = TripletEvaluator(
            anchors   = [e.texts[0] for e in val_triplets],
            positives = [e.texts[1] for e in val_triplets],
            negatives = [e.texts[2] for e in val_triplets],
            name      = "val-triplets",
        )

    total_steps  = len(triplet_loader) * args.epochs
    warmup_steps = math.ceil(total_steps * 0.1)

    model.fit(
        train_objectives=[
            (triplet_loader, triplet_loss),  # Objective 1
            (pair_loader,    mnrl_loss),     # Objective 2
        ],
        evaluator        = evaluator,
        epochs           = args.epochs,
        optimizer_params = {"lr": args.lr},
        warmup_steps     = warmup_steps,
        evaluation_steps = args.eval_steps if evaluator else 0,
        output_path      = args.output_dir,
        save_best_model  = bool(evaluator),
        use_amp          = torch.cuda.is_available(),
        show_progress_bar= True,
    )

    model.save(args.output_dir)
    print(f"\nSaved improved model to: {args.output_dir}")
    print("Check eval/triplet_evaluation_val-triplets_results.csv for final accuracy.")


if __name__ == "__main__":
    main()
