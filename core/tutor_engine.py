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
        self._init_client()

    def _init_client(self):
        key = self.api_key or os.getenv("GEMINI_API_KEY", "")
        if key and genai and not self.client:
            try:
                self.client = genai.Client(api_key=key)
            except Exception as e:
                print(f"[Warning] Failed to initialize Gemini Client: {e}")

    def _get_client(self):
        if not self.client:
            self._init_client()
        return self.client

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

        # Build recent conversation history snippet if provided
        history_snippet = ""
        if chat_history and isinstance(chat_history, list):
            recent_turns = []
            for item in chat_history[-6:]:
                sender = item.get("sender") or item.get("role", "User")
                text = item.get("text") or item.get("message", "")
                if text:
                    recent_turns.append(f"{sender.capitalize()}: {text}")
            if recent_turns:
                history_snippet = "Recent Conversation History:\n" + "\n".join(recent_turns) + "\n\n"

        client = self._get_client()
        if client:
            candidate_models = [
                os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip(),
                "gemini-3.5-flash",
                "gemini-3.8-flash",
                "gemini-flash-latest",
                "gemini-3.6-flash",
                "gemini-3.7-flash"
            ]
            valid_models = []
            for m in candidate_models:
                if m and m not in valid_models:
                    valid_models.append(m)

            prompt_content = f"{system_prompt}\n\n{history_snippet}User Message: \"{user_message}\""

            for model_name in valid_models:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt_content
                    )
                    text = response.text.strip()
                    # Clean markdown fences or find JSON block
                    match = re.search(r"\{[\s\S]*\}", text)
                    if match:
                        return json.loads(match.group(0))
                    return json.loads(text)
                except Exception as e:
                    err_str = str(e)
                    print(f"[Notice: Gemini API call with {model_name} failed: {err_str[:120]}]")
                    if any(term in err_str.lower() for term in ["api_key_invalid", "unauthenticated", "permission_denied", "api key not valid", "403", "401", "invalid_argument"]):
                        break


        # Fallback intelligent rule-based simulator if API key is pending
        return self._intelligent_fallback(user_message, stage_title, language)

    def _intelligent_fallback(self, user_message: str, stage_title: str, language: str) -> Dict[str, Any]:
        """Provides a natural demo response when GEMINI_API_KEY is not yet set."""
        lower_msg = user_message.lower().strip()
        has_mistake = False
        original_mistake = None
        correction = None
        explanation = None

        # 1. Past tense with time marker heuristics
        past_markers = ["yesterday", "last night", "last week", "last year", "ago", "in the past", "earlier today"]
        if any(marker in lower_msg for marker in past_markers):
            if "i go" in lower_msg:
                has_mistake = True
                original_mistake = "I go"
                correction = "I went"
                explanation = "When speaking about finished past events, use the past simple 'went' instead of 'go'."
            elif "i see" in lower_msg:
                has_mistake = True
                original_mistake = "I see"
                correction = "I saw"
                explanation = "Use 'saw' for completed past actions."
            elif "i buy" in lower_msg:
                has_mistake = True
                original_mistake = "I buy"
                correction = "I bought"
                explanation = "Use 'bought' as the past tense of 'buy'."

        # 2. Third-person subject-verb agreement
        if not has_mistake:
            if re.search(r"\b(he|she|it)\s+don't\b", lower_msg):
                has_mistake = True
                match = re.search(r"\b(he|she|it)\s+don't\b", lower_msg)
                subj = match.group(1).capitalize()
                original_mistake = f"{subj} don't"
                correction = f"{subj} doesn't"
                explanation = f"For third-person singular (he/she/it), use 'doesn't' instead of 'don't'."
            elif re.search(r"\b(he|she|it)\s+have\b", lower_msg):
                has_mistake = True
                match = re.search(r"\b(he|she|it)\s+have\b", lower_msg)
                subj = match.group(1).capitalize()
                original_mistake = f"{subj} have"
                correction = f"{subj} has"
                explanation = f"Use 'has' instead of 'have' with singular third-person subjects."

        # 3. Double comparatives
        if not has_mistake:
            comp_match = re.search(r"\bmore\s+(better|faster|easier|bigger|stronger|smarter)\b", lower_msg)
            if comp_match:
                has_mistake = True
                word = comp_match.group(1)
                original_mistake = f"more {word}"
                correction = word
                explanation = f"Comparative adjectives ending in '-er' already denote 'more', so omit 'more'."

        # 4. Countable vs uncountable
        if not has_mistake:
            count_match = re.search(r"\bmuch\s+(people|persons|friends|cars|books|days|hours)\b", lower_msg)
            if count_match:
                has_mistake = True
                noun = count_match.group(1)
                original_mistake = f"much {noun}"
                correction = f"many {noun}"
                explanation = f"'{noun.capitalize()}' is a countable noun, so use 'many' instead of 'much'."

        # 5. Prepositions & Word Confusion (e.g., learn vs teach)
        if not has_mistake:
            if "learn me" in lower_msg:
                has_mistake = True
                original_mistake = "learn me"
                correction = "teach me"
                explanation = "In English, 'teach' means to instruct someone, while 'learn' means to gain knowledge yourself. Use 'Can you teach me?'"
            elif "listen music" in lower_msg or "listening music" in lower_msg:
                has_mistake = True
                original_mistake = "listen music"
                correction = "listen to music"
                explanation = "The verb 'listen' takes the preposition 'to' when followed by an object."
            elif "discuss about" in lower_msg:
                has_mistake = True
                original_mistake = "discuss about"
                correction = "discuss"
                explanation = "'Discuss' already incorporates the meaning of 'talk about', so 'about' is redundant."

        # 6. Auxiliary verb + base form
        if not has_mistake:
            aux_match = re.search(r"\bdid\s+(went|saw|ate|bought|came)\b", lower_msg)
            if aux_match:
                has_mistake = True
                past_form = aux_match.group(1)
                base_forms = {"went": "go", "saw": "see", "ate": "eat", "bought": "buy", "came": "come"}
                base = base_forms.get(past_form, "base verb")
                original_mistake = f"did {past_form}"
                correction = f"did {base}"
                explanation = "After the auxiliary 'did' or 'didn't', always use the base form of the main verb."

        # Conversational response generation tailored to specific intent and stage
        lower_stage = stage_title.lower()
        if "learn english" in lower_msg or "teach me" in lower_msg or "learn me" in lower_msg or "want to learn" in lower_msg:
            reply = "I would be thrilled to teach you! We will practice speaking step by step until you feel completely fluent and confident. Let's start right now!"
            tip = "A polite way to ask is: 'Could you help me practice conversational English?'"
        elif "name" in lower_msg or "who are you" in lower_msg or "what's your name" in lower_msg:
            reply = "My name is Ruku! I'm your empathetic AI English speaking partner. What is your name, and what brings you here today?"
            tip = "You can introduce yourself by saying 'I am...' or 'My name is...'"
        elif "how are you" in lower_msg or "how do you do" in lower_msg or "how are you doing" in lower_msg:
            reply = "I'm doing great, thank you for asking! I'm very excited to help you practice English today. How has your day been so far?"
            tip = "Natural ways to respond include: 'I've had a busy day' or 'Everything is going smoothly!'"
        elif "bengali" in lower_msg or "bangla" in lower_msg:
            reply = "হ্যাঁ, আমি বাংলা বুঝি! You can speak or ask questions in Bengali whenever you want, and I'll explain how to say it naturally in English."
            tip = "Don't hesitate to speak naturally even if you mix words!"
        elif re.search(r"\b(hello|hi|hey|good morning|good afternoon|good evening)\b", lower_msg) and len(lower_msg.split()) <= 4:
            reply = f"Hello there! It is so wonderful to practice with you in {stage_title}. What would you like to talk about today?"
            tip = "Try answering with 'I'd like to practice...' or 'Tell me about...'"
        elif "food" in lower_stage or "cafe" in lower_stage or "restaurant" in lower_stage:
            reply = "That sounds delicious! Would you like to order something to drink or a side dessert with that?"
            tip = "Use 'Could I also please have...' or 'I would love to try...' when ordering."
        elif "direction" in lower_stage or "travel" in lower_stage:
            reply = "That sounds like a great destination! What is your favorite way to travel when you visit new cities?"
            tip = "Try using 'scenic route', 'must-see landmarks', or 'picturesque views'."
        elif "routine" in lower_stage:
            reply = "Having a consistent routine is so helpful! What is your favorite part of your day to unwind?"
            tip = "Phrases like 'kick-start my morning' or 'wind down in the evening' sound very native."
        elif "self" in lower_stage or "introduction" in lower_stage:
            reply = f"That's lovely to hear! Tell me more about what you do or what you enjoy doing in your spare time."
            tip = "Express enthusiasm with 'I'm deeply interested in...' or 'I enjoy spending time...'"
        else:
            reply = f"That is a great thought! Practicing aloud like this builds incredible confidence. Could you elaborate a bit more on that?"
            tip = "Use connectors like 'Moreover', 'In addition', or 'For instance' to expand your ideas."

        return {
            "reply": reply,
            "has_mistake": has_mistake,
            "original_mistake": original_mistake,
            "correction": correction,
            "explanation": explanation,
            "fluency_score": 85 if not has_mistake else 72,
            "accuracy_score": 90 if not has_mistake else 75,
            "vocabulary_tip": tip
        }
