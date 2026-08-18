import os
import argparse
from retrieval import build_or_rebuild_index

def main():
    ap = argparse.ArgumentParser(description="Build FAISS index for case-sheets (one-time).")
    ap.add_argument("--case_dir", default=os.getenv("CASE_SHEETS_DIR", "./case_sheets"), help="Path to PDFs")
    ap.add_argument("--index_dir", default=os.getenv("INDEX_DIR", "./index"), help="Where to persist FAISS")
    ap.add_argument("--embed_model", default=os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
                    help="HuggingFace model name for embeddings")
    args = ap.parse_args()

    # allow override via CLI
    os.environ["EMBED_MODEL"] = args.embed_model

    vs = build_or_rebuild_index(args.case_dir, args.index_dir)
    # FAISS index size
    try:
        n = vs.index.ntotal  # type: ignore[attr-defined]
    except Exception:
        n = -1
    print(f"✅ Built index at {args.index_dir} with {n} vectors.")

if __name__ == "__main__":
    main()
