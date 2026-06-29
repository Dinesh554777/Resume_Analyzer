import requests
import json
import os

url = "http://127.0.0.1:8000/analyze/jd-match"

# Create a minimal but valid PDF that PyPDF2 can parse
pdf_content = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]"
    b" /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    b"4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 100 700 Td (Python Developer Resume) Tj ET\nendstream\nendobj\n"
    b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    b"xref\n0 6\n"
    b"0000000000 65535 f \n"
    b"0000000009 00000 n \n"
    b"0000000058 00000 n \n"
    b"0000000115 00000 n \n"
    b"0000000266 00000 n \n"
    b"0000000360 00000 n \n"
    b"trailer\n<< /Size 6 /Root 1 0 R >>\n"
    b"startxref\n441\n%%EOF\n"
)
with open("dummy.pdf", "wb") as f:
    f.write(pdf_content)

files = {"file": ("dummy.pdf", open("dummy.pdf", "rb"), "application/pdf")}
data = {"job_description": "We need a Python developer with FastAPI and React experience."}

response = requests.post(url, files=files, data=data)
print("Status:", response.status_code)
print("Response:", response.text)
