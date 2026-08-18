import os
from typing import List
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings              

EMBED_MODEL = os.environ.get("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

def _split_docs(docs):
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    return splitter.split_documents(docs)

def _load_case_pdfs(case_dir: str):
    docs = []
    for root, _, files in os.walk(case_dir):
        for fn in files:
            if fn.lower().endswith(".pdf"):
                loader = PyPDFLoader(os.path.join(root, fn))
                for d in loader.load():
                    if "page" not in d.metadata:
                        d.metadata["page"] = d.metadata.get("page_number")
                    d.metadata["source"] = os.path.basename(loader.file_path)
                    docs.append(d)
    return docs

def build_or_rebuild_index(case_dir: str, index_dir: str):
    os.makedirs(index_dir, exist_ok=True)
    emb = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
    raw_docs = _load_case_pdfs(case_dir)
    chunks = _split_docs(raw_docs)
    if not chunks:
        raise RuntimeError(f"No PDF content found under {case_dir}")
    vs = FAISS.from_documents(chunks, emb)
    vs.save_local(index_dir)
    return vs

def load_vector_store_or_raise(index_dir: str):
    emb = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
    faiss_path = os.path.join(index_dir, "index.faiss")
    pkl_path = os.path.join(index_dir, "index.pkl")
    if os.path.exists(faiss_path) and os.path.exists(pkl_path):
        return FAISS.load_local(index_dir, emb, allow_dangerous_deserialization=True)
    raise FileNotFoundError(
        f"FAISS index not found in {index_dir}. Run build_index.py first."
    )
