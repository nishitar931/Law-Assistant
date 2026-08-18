import os
import hashlib
from PyPDF2 import PdfReader
from pdf2image import convert_from_path
import pytesseract

class PDFProcessor:
    """Extract text from PDFs with OCR fallback.
       NOTE: This never embeds content; it only returns text for chat context."""
    def __init__(self, tesseract_cmd=r"/usr/bin/tesseract"):
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    def _ocr_page(self, pdf_path, page_idx: int) -> str:
        try:
            img = convert_from_path(pdf_path, first_page=page_idx+1, last_page=page_idx+1)[0]
            return pytesseract.image_to_string(img)
        except Exception:
            return ""

    def _extract_page(self, page, pdf_path, page_idx: int) -> str:
        try:
            t = page.extract_text() or ""
            return t if len(t) >= 200 else self._ocr_page(pdf_path, page_idx)
        except Exception:
            return self._ocr_page(pdf_path, page_idx)

    def process_pdf(self, file_path: str):
        pages = []
        with open(file_path, "rb") as f:
            reader = PdfReader(f)
            for i, page in enumerate(reader.pages):
                text = self._extract_page(page, file_path, i)
                pages.append({"text": text, "metadata": {"filename": os.path.basename(file_path), "page": i+1}})
        return pages
