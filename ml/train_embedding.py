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
        query = (row.get("query") or "").strip()
        positive = (row.get("positive") or "").strip()
        negative = (row.get("negative") or "").strip()
        if query and positive and negative:
            triplets.append(InputExample(texts=[query, positive, negative]))
    return triplets


def main():
    parser = argparse.ArgumentParser(description="Fine-tune embedding model for PDF retrieval.")
    parser.add_argument("--base-model", default="intfloat/multilingual-e5-base")
    parser.add_argument("--train-file", default="data/train.jsonl")
    parser.add_argument("--val-file", default="data/val.jsonl")
    parser.add_argument("--output-dir", default="models/custom-e5")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--eval-steps", type=int, default=200)
    parser.add_argument("--max-train-samples", type=int, default=0)
    parser.add_argument("--max-val-samples", type=int, default=0)
    args = parser.parse_args()

    train_rows = load_jsonl(Path(args.train_file))
    val_rows = load_jsonl(Path(args.val_file))
    if args.max_train_samples > 0:
        train_rows = train_rows[:args.max_train_samples]
    if args.max_val_samples > 0:
        val_rows = val_rows[:args.max_val_samples]
    train_examples = to_triplets(train_rows)
    val_examples = to_triplets(val_rows)

    if not train_examples:
        raise RuntimeError("Training file has no valid rows.")

    model = SentenceTransformer(args.base_model)
    train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=args.batch_size)
    train_loss = losses.TripletLoss(model=model)

    evaluator = None
    if val_examples:
        anchors = [e.texts[0] for e in val_examples]
        positives = [e.texts[1] for e in val_examples]
        negatives = [e.texts[2] for e in val_examples]
        evaluator = TripletEvaluator(
            anchors=anchors,
            positives=positives,
            negatives=negatives,
            name="val-triplets",
        )

    warmup_steps = math.ceil(len(train_dataloader) * args.epochs * 0.1)
    model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        evaluator=evaluator,
        epochs=args.epochs,
        optimizer_params={"lr": args.lr},
        warmup_steps=warmup_steps,
        evaluation_steps=args.eval_steps if evaluator else 0,
        output_path=args.output_dir,
        save_best_model=bool(evaluator),
        use_amp=torch.cuda.is_available(),
        show_progress_bar=True,
    )

    model.save(args.output_dir)
    print(f"Saved model to: {args.output_dir}")


if __name__ == "__main__":
    main()
