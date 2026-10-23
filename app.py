import os
import json
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
from dotenv import load_dotenv

from core.tutor_engine import RukuTutorEngine
from core.tts_engine import RukuVoiceEngine

load_dotenv()

app = FastAPI(title="RukuTalk AI", description="Multilingual Talking Avatar English Tutor")

BASE_DIR = Path(__file__).resolve().parent

# Mount Static & Assets Folders
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.mount("/assets", StaticFiles(directory=str(BASE_DIR / "assets")), name="assets")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Initialize Core AI Engines
tutor_engine = RukuTutorEngine()
voice_engine = RukuVoiceEngine(output_dir=str(BASE_DIR / "assets" / "audio_temp"))

class ChatRequest(BaseModel):
    message: str
    stage: Optional[Dict[str, Any]] = None
    language: Optional[str] = "English"

@app.get("/")
async def index(request: Request):
    """Render the main web interface."""
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/api/stages")
async def get_stages():
    """Returns the 3-level, 12-stage curriculum."""
    stages_file = BASE_DIR / "data" / "stages.json"
    if stages_file.exists():
        with open(stages_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"levels": []}

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Processes user speech/text:
    1. Evaluates grammar & generates feedback via Gemini AI.
    2. Synthesizes Ruku's natural female voice via Edge-TTS.
    3. Returns full payload for UI & lip-sync avatar.
    """
    stage_info = request.stage or {}
    lang = request.language or "English"

    # Generate tutor response & grammar correction
    feedback = tutor_engine.generate_response(
        user_message=request.message,
        stage_info=stage_info,
        language=lang
    )

    reply_text = feedback.get("reply", "That was a great effort! Let's keep practicing.")

    # Generate audio
    audio_url = await voice_engine.generate_speech(reply_text, language=lang)
    feedback["audio_url"] = audio_url

    return JSONResponse(feedback)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[str(BASE_DIR)],
        reload_excludes=["assets/*", "*.mp3", ".git/*"]
    )
