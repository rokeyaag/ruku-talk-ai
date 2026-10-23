import os
import json
import re
from typing import Dict, Any, Optional

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None


class RukuTutorEngine:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.client = None
        if self.api_key and genai:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[Warning] Failed to initialize Gemini Client: {e}")

    def generate_response(
        self,
        user_message: str,
        stage_info: Dict[str, Any],
        language: str = "English",
        chat_history: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Evaluates the user's message, provides gentle pedagogical feedback,
        and generates Ruku's conversational reply.
        """
        stage_title = stage_info.get("title", "General Conversation")
        stage_desc = stage_info.get("description", "")
        
        system_prompt = f"""You are 'Ruku', an empathetic, encouraging, and friendly female AI English tutor and conversational partner.
The user is learning and practicing English speaking.
Current Practice Context:
- Stage: {stage_title}
- Goal: {stage_desc}
- Selected Practice Language: {language}

Your Responsibilities:
1. Be warm, friendly, natural, and conversational (never robotic or overly formal).
2. If the user makes grammatical or phrasing mistakes, gently explain the better way to say it without discouraging them.
3. If the user asks in Bengali or another language for help, explain the meaning in that language and show how to say it naturally in English.
4. Continue the conversation by asking an engaging follow-up question related to the stage.
5. Provide a constructive score for Fluency (0-100) and Grammar Accuracy (0-100).

You MUST respond strictly in valid JSON format with the following keys:
{{
  "reply": "Your verbal response as Ruku to the user (keep it concise, 2-3 sentences max, suitable for voice output)",
  "has_mistake": true/false,
  "original_mistake": "exact part of user's sentence with mistake or null",
  "correction": "corrected phrasing or null",
  "explanation": "friendly 1-line explanation of why, or null",
  "fluency_score": 85,
  "accuracy_score": 90,
  "vocabulary_tip": "A smart alternative vocabulary word or phrase related to the topic"
}}
Do NOT output markdown backticks around the JSON. Output pure raw JSON.
"""

        if self.client:
            try:
                model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=[
                        {"role": "user", "parts": [{"text": f"{system_prompt}\n\nUser Message: \"{user_message}\""}]}
                    ]
                )
                text = response.text.strip()
                # Clean any markdown code fences if present
                text = re.sub(r"^```json\s*", "", text)
                text = re.sub(r"^```\s*", "", text)
                text = re.sub(r"\s*```$", "", text)
                return json.loads(text)
            except Exception as e:
                print(f"[Error in Gemini API call]: {e}")

        # Fallback intelligent rule-based simulator if API key is pending
        return self._intelligent_fallback(user_message, stage_title, language)

    def _intelligent_fallback(self, user_message: str, stage_title: str, language: str) -> Dict[str, Any]:
        """Provides a natural demo response when GEMINI_API_KEY is not yet set."""
        lower_msg = user_message.lower()
        has_mistake = False
        correction = None
        explanation = None

        if "i go to" in lower_msg and ("yesterday" in lower_msg or "last" in lower_msg):
            has_mistake = True
            correction = "Yesterday I went to..."
            explanation = "When talking about past events, use the past tense 'went' instead of 'go'."
        elif "he don't" in lower_msg or "she don't" in lower_msg:
            has_mistake = True
            correction = "He/She doesn't..."
            explanation = "For third-person singular (he, she, it), we use 'doesn't' instead of 'don't'."

        if "hello" in lower_msg or "hi" in lower_msg:
            reply = f"Hello there! It is so wonderful to practice with you in {stage_title}. Tell me more about yourself!"
        elif "how are you" in lower_msg:
            reply = "I'm doing great, thank you for asking! How has your day been so far?"
        else:
            reply = f"That was really well expressed! Speaking step by step is the fastest way to master {stage_title}. What do you think about this?"

        return {
            "reply": reply,
            "has_mistake": has_mistake,
            "original_mistake": "Sample phrasing" if has_mistake else None,
            "correction": correction,
            "explanation": explanation,
            "fluency_score": 82,
            "accuracy_score": 88 if not has_mistake else 74,
            "vocabulary_tip": "Try using words like 'magnificent' or 'fascinating' to elevate your expressions!"
        }
