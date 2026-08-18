# AI Law Assistant

An intelligent legal assistance platform combining a Python backend with **LangChain**, **FAISS vector search**, and **Google Gemini**, paired with a modern **Next.js** frontend.

---

## Features

- **Document Analysis & Summarization:** Upload legal PDFs and case sheets for instant summarization and insights.
- **Semantic Retrieval (RAG):** Fast vector search across case documents using FAISS and HuggingFace sentence embeddings.
- **Autonomous Agent Workflows:** Multi-step reasoning using LangChain agents powered by Google Gemini.
- **Modern Web Interface:** Fast and responsive chat UI built with Next.js and TypeScript.

---

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend:** Python, SQLite (`app.db`)
- **LLM & Agent Framework:** Google Gemini (`gemini-1.5-flash`), LangChain, HuggingFace Embeddings (`sentence-transformers/all-MiniLM-L6-v2`)
- **Vector Database:** FAISS (Facebook AI Similarity Search)

---

## Project Structure

```text
Law-Assistant/
├── case_sheets/              # Input legal PDFs to be indexed
├── index/                    # Generated FAISS vector index
├── next-frontend/            # Next.js frontend application
│   ├── app/                  # App router pages and UI components
│   └── package.json
├── agents.py                 # LangChain agent orchestrator and tools
├── Api.py                    # Backend API server
├── build_index.py            # Vector database indexing script
├── document_cache.py         # Document caching mechanism
├── processing.py             # Document preprocessing pipeline
├── retrieval.py              # FAISS loading and retrieval logic
├── requirements.txt          # Python dependencies
└── .env                      # API keys and environment variables