import os
import asyncio
from typing import Optional

VOICE_MAP = {
    "English": "en-US-JennyNeural",
    "English (UK)": "en-GB-SoniaNeural",
    "Bengali": "bn-BD-NabanitaNeural",
    "Spanish": "es-ES-ElviraNeural",
    "French": "fr-FR-DeniseNeural",
    "German": "de-DE-KatjaNeural",
    "Arabic": "ar-SA-ZariyahNeural",
    "Hindi": "hi-IN-SwaraNeural"
}

class RukuVoiceEngine:
    def __init__(self, output_dir: str = "assets/audio_temp"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    async def generate_speech(self, text: str, language: str = "English", filename: Optional[str] = None) -> str:
        """
        Synthesizes text into high-quality neural female voice audio using edge-tts.
        Returns the relative path to the generated MP3 file.
        """
        voice = VOICE_MAP.get(language, "en-US-JennyNeural")
        if not filename:
            import uuid
            filename = f"ruku_voice_{uuid.uuid4().hex[:8]}.mp3"

        filepath = os.path.join(self.output_dir, filename)

        try:
            import edge_tts
            communicate = edge_tts.Communicate(text, voice)
            await asyncio.wait_for(communicate.save(filepath), timeout=3.5)
            return f"/assets/audio_temp/{filename}"
        except Exception as e:
            print(f"[Notice] edge-tts fallback triggered ({e}). Using browser neural speech synthesis.")
            return ""
