import os
import json
import io
from pathlib import Path
from fastapi import FastAPI, Request, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import speech_recognition as sr


from core.tutor_engine import RukuTutorEngine
from core.tts_engine import RukuVoiceEngine

load_dotenv()

app = FastAPI(title="RukuTalk AI", description="Multilingual Talking Avatar English Tutor")

BASE_DIR = Path(__file__).resolve().parent

# Serverless/Vercel Environment Handling
IS_VERCEL = bool(os.getenv("VERCEL"))
AUDIO_DIR = Path("/tmp/audio_temp") if IS_VERCEL else (BASE_DIR / "assets" / "audio_temp")
CHAT_LOGS_FILE = Path("/tmp/chat_logs.json") if IS_VERCEL else (BASE_DIR / "data" / "chat_logs.json")

try:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

# Helper functions for persistent chat logs across local & serverless environments
def get_chat_logs() -> list:
    if CHAT_LOGS_FILE.exists():
        try:
            with open(CHAT_LOGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    seed_file = BASE_DIR / "data" / "chat_logs.json"
    if seed_file.exists():
        try:
            with open(seed_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_chat_logs(logs: list):
    try:
        CHAT_LOGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CHAT_LOGS_FILE, "w", encoding="utf-8") as f:
            json.dump(logs[-300:], f, indent=2, ensure_ascii=False)
    except Exception as log_err:
        print(f"[Notice] Failed to write backend chat log: {log_err}")

# Mount Static & Assets Folders
if (BASE_DIR / "static").exists():
    app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
if (BASE_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(BASE_DIR / "assets")), name="assets")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Initialize Core AI Engines
tutor_engine = RukuTutorEngine()
voice_engine = RukuVoiceEngine(output_dir=str(AUDIO_DIR))

@app.get("/assets/audio_temp/{filename}")
async def get_audio_temp(filename: str):
    """Serve generated audio files dynamically from writable dir or assets."""
    file_path = AUDIO_DIR / filename
    if file_path.exists():
        return FileResponse(str(file_path), media_type="audio/mpeg")
    local_path = BASE_DIR / "assets" / "audio_temp" / filename
    if local_path.exists():
        return FileResponse(str(local_path), media_type="audio/mpeg")
    return JSONResponse({"error": "Audio file not found"}, status_code=404)

class ChatRequest(BaseModel):
    message: str
    stage: Optional[Dict[str, Any]] = None
    language: Optional[str] = "English"
    chat_history: Optional[list] = None

@app.get("/")
async def index(request: Request):
    """Render the main web interface."""
    paypal_client_id = os.getenv("PAYPAL_CLIENT_ID", "test")
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"paypal_client_id": paypal_client_id}
    )

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
    Accepts client-side microphone WAV/WebM audio and transcribes accurately.
    Uses dual-engine pipeline: Google SpeechRecognition + Gemini Multimodal AI.
    """
    try:
        content = await audio.read()
        if not content or len(content) < 300:
            return JSONResponse({"text": "", "success": False, "error": "Audio recording too short. Please speak again."})

        mime_type = audio.content_type or "audio/webm"
        print(f"[STT Request] Received {len(content)} bytes, mime: {mime_type}, language: {language}")
        recognized_text = ""

        # Detect real mime type from magic file bytes
        if content[:4] == b"RIFF":
            real_mime = "audio/wav"
        elif content[:4] == b"\x1aE\xdf\xa3":
            real_mime = "audio/webm"
        elif content[:4] == b"\xff\xfb" or content[:3] == b"ID3":
            real_mime = "audio/mp3"
        elif len(content) > 8 and content[4:8] == b"ftyp":
            real_mime = "audio/mp4"
        else:
            real_mime = mime_type or "audio/webm"

        # 1. Primary Engine: Gemini Multimodal Audio (Accurate with accents, noise, and multi-language)
        try:
            recognized_text = tutor_engine.transcribe_audio(content, language=language, mime_type=real_mime)
        except Exception as gemini_err:
            print(f"[STT Notice] Gemini STT attempt: {gemini_err}")
            recognized_text = ""

        # 2. Secondary Engine: Google Speech Recognition (for WAV recordings)
        if not recognized_text and (real_mime == "audio/wav" or content[:4] == b"RIFF"):
            try:
                recognizer = sr.Recognizer()
                recognizer.dynamic_energy_threshold = False
                recognizer.energy_threshold = 80
                audio_file = io.BytesIO(content)

                with sr.AudioFile(audio_file) as source:
                    audio_data = recognizer.record(source)

                lang_code = LANGUAGE_STT_MAP.get(language, "en-US")
                recognized_text = recognizer.recognize_google(audio_data, language=lang_code)
            except Exception as e:
                recognized_text = ""

        # Filter out noise artifacts
        clean_check = recognized_text.strip().lower()
        noise_tokens = ["<noise>", "[noise]", "<silence>", "[silence]", "0:00", "00", "0", "...", "noise", "silence", "undefined"]
        if clean_check in noise_tokens or not any(c.isalpha() for c in clean_check):
            recognized_text = ""

        if recognized_text and recognized_text.strip():
            print(f"[STT Success] ({language}): '{recognized_text.strip()}'")
            return JSONResponse({"text": recognized_text.strip(), "success": True})
        else:
            print(f"[STT Notice] No speech detected in {len(content)} bytes of audio for language: {language}")
            return JSONResponse({"text": "", "success": False, "error": "Could not hear any clear voice. Please speak closer to your microphone."})

    except Exception as e:
        print(f"[STT Error]: {e}")
        return JSONResponse({"text": "", "success": False, "error": str(e)})


@app.post("/api/voice-chat")
async def voice_chat(
    audio: UploadFile = File(...),
    language: str = Form("English"),
    stage_json: str = Form("{}"),
    chat_history_json: str = Form("[]")
):
    """
    Unified Single-Roundtrip Voice Chat Pipeline:
    1. Transcribes incoming microphone speech via Gemini Multimodal Audio Perception.
    2. Immediately evaluates grammar, scores fluency, and crafts conversational reply.
    3. Synthesizes Ruku's neural audio response in parallel.
    4. Persists the turn to chat logs.
    Returns the complete bundle in ONE fast HTTP trip!
    """
    try:
        content = await audio.read()
        if not content or len(content) < 300:
            return JSONResponse({
                "success": False,
                "error": "Audio recording too short. Please hold the mic and speak clearly."
            })

        # Detect real mime type from magic bytes
        if content[:4] == b"RIFF":
            real_mime = "audio/wav"
        elif content[:4] == b"\x1aE\xdf\xa3":
            real_mime = "audio/webm"
        elif content[:4] == b"\xff\xfb" or content[:3] == b"ID3":
            real_mime = "audio/mp3"
        elif len(content) > 8 and content[4:8] == b"ftyp":
            real_mime = "audio/mp4"
        else:
            real_mime = audio.content_type or "audio/webm"

        # Parse stage & chat history
        try:
            stage_info = json.loads(stage_json) if stage_json else {}
        except Exception:
            stage_info = {}

        try:
            chat_history = json.loads(chat_history_json) if chat_history_json else []
        except Exception:
            chat_history = []

        # 1. Multimodal Audio Transcription
        recognized_text = ""
        try:
            recognized_text = tutor_engine.transcribe_audio(content, language=language, mime_type=real_mime)
        except Exception as stt_err:
            print(f"[Voice-Chat STT Error]: {stt_err}")
            recognized_text = ""

        # Fallback to Google STT if WAV
        if not recognized_text and (real_mime == "audio/wav" or content[:4] == b"RIFF"):
            try:
                recognizer = sr.Recognizer()
                recognizer.dynamic_energy_threshold = False
                recognizer.energy_threshold = 80
                audio_file = io.BytesIO(content)
                with sr.AudioFile(audio_file) as source:
                    audio_data = recognizer.record(source)
                lang_code = LANGUAGE_STT_MAP.get(language, "en-US")
                recognized_text = recognizer.recognize_google(audio_data, language=lang_code)
            except Exception:
                recognized_text = ""

        # Filter noise artifacts
        clean_check = recognized_text.strip().lower()
        noise_tokens = ["<noise>", "[noise]", "<silence>", "[silence]", "0:00", "00", "0", "...", "noise", "silence", "undefined"]
        if clean_check in noise_tokens or not any(c.isalpha() for c in clean_check):
            recognized_text = ""

        if not recognized_text or not recognized_text.strip():
            return JSONResponse({
                "success": False,
                "error": "Could not catch clear words. Please speak a little louder or closer to your microphone."
            })

        user_text = recognized_text.strip()
        print(f"[Voice-Chat Detected] ({language}): '{user_text}'")

        # 2. Generate Pedagogical Response
        feedback = tutor_engine.generate_response(
            user_message=user_text,
            stage_info=stage_info,
            language=language,
            chat_history=chat_history
        )

        reply_text = feedback.get("reply", "That was a great effort! Let's keep practicing.")

        # 3. Generate Speech Audio
        audio_url = await voice_engine.generate_speech(reply_text, language=language)
        feedback["audio_url"] = audio_url
        feedback["user_text"] = user_text
        feedback["success"] = True

        # 4. Save to persistent chat logs
        logs = get_chat_logs()
        import datetime
        logs.append({
            "timestamp": datetime.datetime.now().isoformat(),
            "stage_id": int(stage_info.get("id", 1)),
            "language": language,
            "user": user_text,
            "ruku": reply_text,
            "audio_url": audio_url,
            "fluency_score": feedback.get("fluency_score"),
            "accuracy_score": feedback.get("accuracy_score"),
            "has_mistake": feedback.get("has_mistake", False),
            "original_mistake": feedback.get("original_mistake"),
            "correction": feedback.get("correction"),
            "explanation": feedback.get("explanation"),
            "vocabulary_tip": feedback.get("vocabulary_tip")
        })
        save_chat_logs(logs)

        return JSONResponse(feedback)

    except Exception as e:
        print(f"[Voice-Chat Exception]: {e}")
        return JSONResponse({"success": False, "error": str(e)})


@app.get("/api/chat-history")
async def get_chat_history(stage_id: Optional[int] = 1):
    """Fetch persistent chat history for a stage from backend disk storage."""
    try:
        logs = get_chat_logs()
        filtered = [turn for turn in logs if turn.get("stage_id") == stage_id]
        return JSONResponse({"history": filtered})
    except Exception as e:
        return JSONResponse({"history": [], "error": str(e)})


@app.delete("/api/chat-history")
async def delete_chat_history(stage_id: Optional[int] = 1):
    """Clear persistent chat history for a stage."""
    try:
        logs = get_chat_logs()
        remaining = [turn for turn in logs if turn.get("stage_id") != stage_id]
        save_chat_logs(remaining)
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)})


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
    print(f"[Chat] User message ({lang}): '{request.message}'")

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

    # Save to persistent backend memory log
    logs = get_chat_logs()
    import datetime
    logs.append({
        "timestamp": datetime.datetime.now().isoformat(),
        "stage_id": int(stage_info.get("id", 1)),
        "language": lang,
        "user": request.message,
        "ruku": reply_text,
        "audio_url": audio_url,
        "fluency_score": feedback.get("fluency_score"),
        "accuracy_score": feedback.get("accuracy_score"),
        "has_mistake": feedback.get("has_mistake", False),
        "original_mistake": feedback.get("original_mistake"),
        "correction": feedback.get("correction"),
        "explanation": feedback.get("explanation"),
        "vocabulary_tip": feedback.get("vocabulary_tip")
    })
    save_chat_logs(logs)

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
