# main.py
"""Advanced AI Resume Analyzer — FastAPI Backend

Endpoints:
  GET  /                         Home dashboard
  GET  /analyzer                 Analyzer page
  GET  /report                   Report page
  GET  /resources                Resources page
  GET  /jd-match                 JD Match page
  GET  /chat                     AI Chat page
  GET  /cover-letter             Cover Letter Generator page

  POST /analyze                  Full resume analysis (15 fields)
  POST /analyze/jd-match         Resume vs Job Description match
  POST /analyze/interview-questions  Generate interview questions
  POST /analyze/cover-letter     Generate cover letter
  POST /analyze/parsed-info      Extract structured resume info
  POST /analyze/chat             AI Chat about the resume
"""

import os
import json
import secrets
import traceback
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import FastAPI, File, Form, UploadFile, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from dotenv import load_dotenv

# ── Environment ────────────────────────────────────────────────────────────────
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not set in .env")

GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"

# ── App Setup ──────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Advanced AI Resume Analyzer", version="2.0.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# ── Pydantic Schemas ───────────────────────────────────────────────────────────
class AnalysisResult(BaseModel):
    ats_score: int
    keyword_score: int
    experience_score: int
    project_score: int
    education_score: int
    skills_identified: List[str]
    missing_skills: List[str]
    missing_certifications: List[str]
    strengths: List[str]
    weaknesses: List[str]
    improvements: List[str]
    project_suggestions: List[str]
    resume_improvement_suggestions: List[str]
    career_recommendations: List[str]
    recommended_roles: List[str]
    interview_topics: List[str]

class JDMatchResult(BaseModel):
    match_percentage: int
    matched_skills: List[str]
    missing_skills: List[str]
    keyword_overlap: List[str]
    experience_fit: str
    overall_assessment: str

class ParsedInfo(BaseModel):
    name: str
    email: str
    phone: str
    linkedin: str
    github: str
    education: List[str]
    experience: List[str]
    skills: List[str]
    projects: List[str]
    certifications: List[str]
    achievements: List[str]

# ── Text Extraction ────────────────────────────────────────────────────────────
def extract_text_from_pdf(file_path: Path) -> str:
    """Extract text from PDF using pdfplumber with PyPDF2 fallback."""
    try:
        import pdfplumber
        with pdfplumber.open(str(file_path)) as pdf:
            texts = []
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    texts.append(t)
            if texts:
                return "\n".join(texts)
    except Exception:
        pass

    # Fallback to PyPDF2
    from PyPDF2 import PdfReader
    reader = PdfReader(str(file_path))
    texts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            texts.append(t)
    return "\n".join(texts)


def extract_text_from_docx(file_path: Path) -> str:
    """Extract text from a DOCX file."""
    from docx import Document
    doc = Document(str(file_path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def extract_resume_text(file_path: Path, content_type: str) -> str:
    """Route extraction by file type."""
    if content_type == "application/pdf" or file_path.suffix.lower() == ".pdf":
        return extract_text_from_pdf(file_path)
    if content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ) or file_path.suffix.lower() in (".docx", ".doc"):
        return extract_text_from_docx(file_path)
    raise HTTPException(status_code=400, detail="Unsupported file type. Upload PDF or DOCX.")


def save_upload(file: UploadFile, content: bytes) -> Path:
    """Persist an uploaded file and return its path."""
    safe_name = f"{secrets.token_hex(8)}_{Path(file.filename).name}"
    file_path  = UPLOAD_DIR / safe_name
    file_path.write_bytes(content)
    return file_path

# ── Groq LLM Helper ───────────────────────────────────────────────────────────
async def call_groq(prompt: str, max_tokens: int = 3000) -> str:
    """Call Groq API and return raw content string."""
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(GROQ_URL, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


def parse_json_response(raw: str) -> dict:
    """Parse JSON from LLM response, stripping markdown fences if present."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
    return json.loads(raw)

# ── Prompts ────────────────────────────────────────────────────────────────────
FULL_ANALYSIS_SCHEMA = (
    '{"ats_score":int,"keyword_score":int,"experience_score":int,"project_score":int,'
    '"education_score":int,"skills_identified":[],"missing_skills":[],'
    '"missing_certifications":[],"strengths":[],"weaknesses":[],"improvements":[],'
    '"project_suggestions":[],"resume_improvement_suggestions":[],'
    '"career_recommendations":[],"recommended_roles":[],"interview_topics":[]}'
)

def build_full_analysis_prompt(resume_text: str) -> str:
    return (
        "You are a senior career analyst and ATS expert. "
        "Analyze the resume below and return ONLY a valid JSON object matching this schema exactly "
        f"(no extra text, no markdown): {FULL_ANALYSIS_SCHEMA}\n\n"
        "Score fields (0-100): ats_score=overall ATS readiness, keyword_score=keyword match quality, "
        "experience_score=experience relevance and depth, project_score=project quality and impact, "
        "education_score=education relevance.\n"
        "Arrays: at least 5 items each where relevant.\n"
        "recommended_roles: list of 5 specific job titles suited for this candidate.\n"
        "interview_topics: list of 8 technical/behavioral topics the candidate should prepare.\n"
        f"\nResume:\n{resume_text}"
    )

def build_jd_match_prompt(resume_text: str, job_description: str) -> str:
    schema = (
        '{"match_percentage":int,"matched_skills":[],"missing_skills":[],'
        '"keyword_overlap":[],"experience_fit":"string","overall_assessment":"string"}'
    )
    return (
        "You are an expert ATS and recruitment analyst. Compare the resume against the job description "
        f"and return ONLY a valid JSON object matching this schema: {schema}\n\n"
        "match_percentage: 0-100 overall fit score.\n"
        "matched_skills: skills present in both resume and JD.\n"
        "missing_skills: skills required by JD but absent from resume.\n"
        "keyword_overlap: important keywords that appear in both.\n"
        "experience_fit: one paragraph assessing experience alignment.\n"
        "overall_assessment: one paragraph summary recommendation.\n"
        f"\nResume:\n{resume_text}\n\nJob Description:\n{job_description}"
    )

def build_parsed_info_prompt(resume_text: str) -> str:
    schema = (
        '{"name":"","email":"","phone":"","linkedin":"","github":"",'
        '"education":[],"experience":[],"skills":[],"projects":[],'
        '"certifications":[],"achievements":[]}'
    )
    return (
        "You are a resume parser. Extract all structured information from the resume below. "
        f"Return ONLY a valid JSON object matching this schema: {schema}\n\n"
        "Use empty string or empty array if a field is not found. "
        "education: list each degree/institution. experience: list each role + company + duration. "
        "projects: list each project name and brief description.\n"
        f"\nResume:\n{resume_text}"
    )

def build_interview_questions_prompt(resume_text: str) -> str:
    schema = (
        '{"technical_questions":[],"hr_questions":[],"project_questions":[],"behavioral_questions":[]}'
    )
    return (
        "You are a senior interviewer. Based on the resume below, generate relevant interview questions. "
        f"Return ONLY a valid JSON object matching this schema: {schema}\n\n"
        "technical_questions: 6 questions testing technical skills mentioned.\n"
        "hr_questions: 5 standard HR questions tailored to this profile.\n"
        "project_questions: 5 questions probing specific projects listed.\n"
        "behavioral_questions: 4 situational/behavioral questions.\n"
        f"\nResume:\n{resume_text}"
    )

def build_cover_letter_prompt(resume_text: str, job_description: str, company_name: str, job_title: str) -> str:
    return (
        f"You are an expert career coach. Write a professional, personalized cover letter for the candidate "
        f"applying to the role of '{job_title}' at '{company_name}'. "
        "The cover letter should be compelling, ATS-friendly, and tailored to both the resume and job description. "
        "Format: 4 paragraphs — introduction, relevant experience, skills alignment, closing call to action. "
        "Return ONLY the cover letter text (no JSON, no markdown, no extra text).\n\n"
        f"Resume:\n{resume_text}\n\nJob Description:\n{job_description}"
    )

def build_chat_prompt(resume_text: str, question: str) -> str:
    return (
        "You are a smart career advisor with full access to the candidate's resume. "
        "Answer the following question about the resume concisely and helpfully. "
        "Be specific, reference actual resume content when relevant.\n\n"
        f"Resume:\n{resume_text}\n\nQuestion: {question}"
    )

# ── Page Routes ────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def get_home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/analyzer", response_class=HTMLResponse)
async def get_analyzer(request: Request):
    return templates.TemplateResponse("analyzer.html", {"request": request})

@app.get("/report", response_class=HTMLResponse)
async def get_report(request: Request):
    return templates.TemplateResponse("report.html", {"request": request})

@app.get("/resources", response_class=HTMLResponse)
async def get_resources(request: Request):
    return templates.TemplateResponse("resources.html", {"request": request})

@app.get("/jd-match", response_class=HTMLResponse)
async def get_jd_match(request: Request):
    return templates.TemplateResponse("jd-match.html", {"request": request})

@app.get("/chat", response_class=HTMLResponse)
async def get_chat(request: Request):
    return templates.TemplateResponse("chat.html", {"request": request})

@app.get("/cover-letter", response_class=HTMLResponse)
async def get_cover_letter(request: Request):
    return templates.TemplateResponse("cover-letter.html", {"request": request})

# ── API Routes ─────────────────────────────────────────────────────────────────
@app.post("/analyze")
async def analyze_resume(file: UploadFile = File(...)):
    """Full resume analysis — returns 16-field JSON."""
    content = await file.read()
    file_path = save_upload(file, content)
    try:
        resume_text = extract_resume_text(file_path, file.content_type)
        if not resume_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract text from the uploaded file.")
        raw = await call_groq(build_full_analysis_prompt(resume_text))
        result = parse_json_response(raw)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@app.post("/analyze/jd-match")
async def jd_match(file: UploadFile = File(...), job_description: str = Form(...)):
    """Compare resume against a job description."""
    content = await file.read()
    file_path = save_upload(file, content)
    try:
        resume_text = extract_resume_text(file_path, file.content_type)
        raw = await call_groq(build_jd_match_prompt(resume_text, job_description))
        result = parse_json_response(raw)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@app.post("/analyze/parsed-info")
async def parsed_info(file: UploadFile = File(...)):
    """Extract structured personal/professional information from resume."""
    content = await file.read()
    file_path = save_upload(file, content)
    try:
        resume_text = extract_resume_text(file_path, file.content_type)
        raw = await call_groq(build_parsed_info_prompt(resume_text))
        result = parse_json_response(raw)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@app.post("/analyze/interview-questions")
async def interview_questions(file: UploadFile = File(...)):
    """Generate interview questions based on the resume."""
    content = await file.read()
    file_path = save_upload(file, content)
    try:
        resume_text = extract_resume_text(file_path, file.content_type)
        raw = await call_groq(build_interview_questions_prompt(resume_text))
        result = parse_json_response(raw)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@app.post("/analyze/cover-letter")
async def cover_letter(
    file: UploadFile = File(...),
    job_description: str = Form(...),
    company_name: str = Form(...),
    job_title: str = Form(...),
):
    """Generate a personalized cover letter."""
    content = await file.read()
    file_path = save_upload(file, content)
    try:
        resume_text = extract_resume_text(file_path, file.content_type)
        letter = await call_groq(
            build_cover_letter_prompt(resume_text, job_description, company_name, job_title),
            max_tokens=1500,
        )
        return JSONResponse(content={"cover_letter": letter.strip()})
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@app.post("/analyze/chat")
async def chat_with_resume(
    question: str = Form(...),
    resume_text: str = Form(default=""),
):
    """Ask a question about the resume stored in the session."""
    if not resume_text.strip():
        return JSONResponse(
            status_code=400,
            content={"error": "No resume text provided. Please analyze a resume first."}
        )
    try:
        answer = await call_groq(build_chat_prompt(resume_text, question), max_tokens=800)
        return JSONResponse(content={"answer": answer.strip()})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
