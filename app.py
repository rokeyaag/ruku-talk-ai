import os
import json
import io
from pathlib import Path
from fastapi import FastAPI, Request, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import speech_recognition as sr


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
    chat_history: Optional[list] = None

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

LANGUAGE_STT_MAP = {
    "English": "en-US",
    "English (UK)": "en-GB",
    "Bengali": "bn-BD",
    "Spanish": "es-ES",
    "French": "fr-FR",
    "German": "de-DE",
    "Arabic": "ar-SA",
    "Hindi": "hi-IN"
}

@app.post("/api/speech-to-text")
async def speech_to_text(audio: UploadFile = File(...), language: str = Form("English")):
    """
    Universal browser-independent STT:
    Accepts client-side microphone WAV audio and transcribes accurately.
    Works flawlessly across Brave, Chrome, Firefox, Edge, Safari and Mobile.
    """
    try:
        content = await audio.read()
        if not content or len(content) < 300:
            return JSONResponse({"text": "", "success": False, "error": "Audio recording too short"})

        recognizer = sr.Recognizer()
        recognizer.dynamic_energy_threshold = False
        recognizer.energy_threshold = 120
        audio_file = io.BytesIO(content)

        with sr.AudioFile(audio_file) as source:
            audio_data = recognizer.record(source)

        lang_code = LANGUAGE_STT_MAP.get(language, "en-US")
        recognized_text = recognizer.recognize_google(audio_data, language=lang_code)

        return JSONResponse({"text": recognized_text, "success": True})
    except sr.UnknownValueError:
        return JSONResponse({"text": "", "success": False, "error": "Could not understand voice. Please speak a little louder or closer."})
    except Exception as e:
        print(f"[STT Error]: {e}")
        return JSONResponse({"text": "", "success": False, "error": str(e)})


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
        language=lang,
        chat_history=request.chat_history
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
