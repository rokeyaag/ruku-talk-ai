# 🌟 RukuTalk AI

> **"Talk with Ruku, Speak English with Confidence!"**  
> An interactive, multilingual AI Avatar Companion for conversational English fluency, real-time grammar feedback, structured learning stages, and seamless PayPal checkout.

[![Built with Python](https://img.shields.io/badge/Built%20with-Python%203.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Google Gemini](https://img.shields.io/badge/AI%20Brain-Google%20Gemini-8E75C4?logo=google&logoColor=white)](https://ai.google.dev)
[![PayPal](https://img.shields.io/badge/Payments-PayPal%20Sandbox-00457C?logo=paypal&logoColor=white)](https://developer.paypal.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Overview
Millions of non-native English learners around the world face a common barrier: **the fear of speaking**. While grammar books and multiple-choice apps teach rules, they do not overcome speaking anxiety or provide natural conversation practice.

**RukuTalk AI** solves this by providing **Ruku**—a lifelike, empathetic, and culturally intelligent female AI digital tutor available 24/7. Ruku listens to user speech in real-time, responds with natural synchronized lip movements and facial animations, gently highlights grammar mistakes, and guides learners through a structured 12-stage curriculum.

---

## ✨ Key Features

- 🎭 **Interactive Talking Avatar (Ruku):** Dynamic audio-driven mouth lip-synchronization, natural eye blinking, and active listening cues.
- 🎙️ **Voice-First Interaction:** Built-in Speech Recognition (STT) and natural neural female text-to-speech (TTS) synthesis.
- 🌍 **Multilingual Bridge:** Non-native speakers can practice in English while receiving guidance or asking questions in **Bengali, Spanish, French, German, Arabic, Hindi**, and more.
- 💡 **Real-time Pedagogical Feedback:** Detects grammatical slips (*"You said"* vs *"Better way to say"*) with gentle explanations and vocabulary enhancements.
- 🗺️ **Structured 3-Level, 12-Stage Curriculum:**
  - **Level 1 (Beginner):** Self-introductions, daily routines, cafe orders, asking directions.
  - **Level 2 (Intermediate):** Travel memories, expressing opinions, shopping & bargaining, workplace chats.
  - **Level 3 (Advanced):** Job interview simulations, business meetings, nuanced debates, and IELTS Speaking mock tests.
- 💳 **PayPal Sandbox Monetization:** Freemium access with 1-click PayPal Smart Checkout for unlocking unlimited speaking sessions and advanced IELTS scoring.

---

## 🏗️ Architecture Flow

```
[ User Speech (Mic) ]
         │
         ▼
[ Web Speech / Whisper STT ] ────► User Text
                                       │
                                       ▼
                     [ Google Gemini AI Tutor Engine ]
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        [ Pedagogical Feedback ]               [ Conversational Reply ]
         • Grammar corrections                            │
         • Fluency / Accuracy %                           ▼
         • Vocabulary boosters                 [ Neural TTS Voice Engine ]
                                                          │
                                                          ▼
                                            [ Ruku Talking Avatar ]
                                            (Audio-driven Lip Sync)
```

---

## 🚀 Quickstart & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/rokeyaag/ruku-talk-ai.git
cd ruku-talk-ai
```

### 2. Set Up Virtual Environment & Dependencies
```bash
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and provide your credentials (optional for basic demo mode):
```bash
GEMINI_API_KEY=your_gemini_api_key_here
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
```

### 4. Run the Application
```bash
python app.py
```
Open your browser and navigate to: **`http://127.0.0.1:8000`**

---

## 💳 PayPal Integration Details
RukuTalk AI utilizes the **PayPal Developer Platform (Sandbox environment)**:
- **Sandbox Client SDK:** Renders PayPal Smart Buttons directly in the web application modal.
- **Subscription / On-Demand Checkout:** Allows learners to upgrade to **RukuTalk Pro** ($4.99/mo) with simulated payments and immediate tier activation.

---

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).
