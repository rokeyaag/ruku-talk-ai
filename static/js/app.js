// RukuTalk AI - Client Application Logic

let stagesData = [];
let currentStage = null;
let currentLanguage = "English";
let isRecording = false;
let recognition = null;
let audioContext = null;
let analyser = null;
let animFrameId = null;

// DOM Elements
const stagesContainer = document.getElementById("stagesContainer");
const currentStageTitle = document.getElementById("currentStageTitle");
const currentStageGoal = document.getElementById("currentStageGoal");
const currentStageTag = document.getElementById("currentStageTag");
const currentLevelBadge = document.getElementById("currentLevelBadge");
const micBtn = document.getElementById("micBtn");
const micHint = document.getElementById("micHint");
const audioVisualizer = document.getElementById("audioVisualizer");
const chatForm = document.getElementById("chatForm");
const textInput = document.getElementById("textInput");
const chatMessages = document.getElementById("chatMessages");
const fluencyScore = document.getElementById("fluencyScore");
const accuracyScore = document.getElementById("accuracyScore");
const grammarContent = document.getElementById("grammarContent");
const vocabContent = document.getElementById("vocabContent");
const rukuAudio = document.getElementById("rukuAudio");
const rukuMouth = document.getElementById("rukuMouth");
const avatarGraphic = document.getElementById("avatarGraphic");
const stateText = document.getElementById("stateText");
const languageSelect = document.getElementById("languageSelect");
const paypalModal = document.getElementById("paypalModal");
const proModalBtn = document.getElementById("proModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");

// 1. Initialize App & Fetch Stages
document.addEventListener("DOMContentLoaded", async () => {
    initSpeechRecognition();
    await loadStages();
    setupEventListeners();
    setupPayPal();
});

async function loadStages() {
    try {
        const res = await fetch("/api/stages");
        const data = await res.json();
        stagesData = data.levels || [];
        renderStages();
        
        // Select Stage 1 by default
        if (stagesData.length > 0 && stagesData[0].stages.length > 0) {
            selectStage(stagesData[0].stages[0], stagesData[0].name);
        }
    } catch (err) {
        console.error("Failed to load stages:", err);
    }
}

function renderStages() {
    stagesContainer.innerHTML = "";
    stagesData.forEach(level => {
        const levelHeader = document.createElement("div");
        levelHeader.style.cssText = "font-size:12px; font-weight:700; color:var(--text-muted); margin-top:8px;";
        levelHeader.innerText = level.name;
        stagesContainer.appendChild(levelHeader);

        level.stages.forEach(stage => {
            const item = document.createElement("div");
            item.className = "stage-item";
            item.id = `stage-btn-${stage.id}`;
            item.innerHTML = `
                <div class="stage-item-header">
                    <span>${stage.title}</span>
                    <span>⭐ 3/3</span>
                </div>
                <div class="stage-item-desc">${stage.description}</div>
            `;
            item.addEventListener("click", () => selectStage(stage, level.name));
            stagesContainer.appendChild(item);
        });
    });
}

function selectStage(stage, levelName) {
    currentStage = stage;
    document.querySelectorAll(".stage-item").forEach(el => el.classList.remove("active"));
    const activeBtn = document.getElementById(`stage-btn-${stage.id}`);
    if (activeBtn) activeBtn.classList.add("active");

    currentStageTitle.innerText = stage.title;
    currentStageGoal.innerText = stage.description;
    currentStageTag.innerText = `Stage ${stage.id}`;
    if (levelName) currentLevelBadge.innerText = levelName;

    // Reset feedback for new stage
    grammarContent.innerHTML = `<p class="empty-state">Starting ${stage.title}. Speak with Ruku!</p>`;
    vocabContent.innerText = `Focus topics: ${stage.topics.join(", ")}`;
    
    // Add Ruku's greeting to chat
    appendMessage("Ruku", stage.initial_ruku_message, "ruku-message");
    speakRukuText(stage.initial_ruku_message);
}

// 2. Speech Recognition Setup (Web Speech API)
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = getLanguageCode(currentLanguage);

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add("recording");
            audioVisualizer.classList.add("active");
            micHint.innerText = "Listening... Speak now";
            stateText.innerText = "Ruku is listening carefully...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            handleUserMessage(transcript);
        };

        recognition.onerror = (event) => {
            console.warn("Speech error:", event.error);
            stopRecording();
        };

        recognition.onend = () => {
            stopRecording();
        };
    } else {
        micHint.innerText = "Speech API not supported in this browser. Use text input below.";
    }
}

function getLanguageCode(lang) {
    const map = {
        "English": "en-US",
        "English (UK)": "en-GB",
        "Bengali": "bn-BD",
        "Spanish": "es-ES",
        "French": "fr-FR",
        "German": "de-DE",
        "Arabic": "ar-SA",
        "Hindi": "hi-IN"
    };
    return map[lang] || "en-US";
}

function stopRecording() {
    isRecording = false;
    micBtn.classList.remove("recording");
    audioVisualizer.classList.remove("active");
    micHint.innerText = "Click the microphone to speak with Ruku";
    stateText.innerText = "Ruku is ready to listen";
}

// 3. User Message Handling & Server Communication
async function handleUserMessage(message) {
    if (!message || !message.trim()) return;

    appendMessage("You", message, "user-message");
    stateText.innerText = "Ruku is thinking...";

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: message,
                stage: currentStage || {},
                language: currentLanguage
            })
        });

        const data = await response.json();
        
        // Update UI with feedback
        updateScores(data.fluency_score, data.accuracy_score);
        updateGrammarFeedback(data);
        if (data.vocabulary_tip) {
            vocabContent.innerText = data.vocabulary_tip;
        }

        // Output Ruku's response
        appendMessage("Ruku", data.reply, "ruku-message");
        
        if (data.audio_url) {
            playServerAudio(data.audio_url);
        } else {
            speakRukuText(data.reply);
        }
    } catch (err) {
        console.error("Chat error:", err);
        stateText.innerText = "Ruku is ready to listen";
    }
}

function updateScores(fluency, accuracy) {
    if (fluency) fluencyScore.innerText = `${fluency}%`;
    if (accuracy) accuracyScore.innerText = `${accuracy}%`;
}

function updateGrammarFeedback(data) {
    if (data.has_mistake && data.correction) {
        grammarContent.innerHTML = `
            <div>
                <strong style="color:var(--danger)">Needs improvement:</strong>
                <p style="font-size:12px; margin-top:2px; color:var(--text-muted);">"${data.original_mistake || 'Original phrase'}"</p>
                <div class="correction-highlight">
                    <strong style="color:var(--primary)">💡 Better way to say:</strong>
                    <p style="font-size:12px; margin-top:2px;">"${data.correction}"</p>
                </div>
                ${data.explanation ? `<p style="font-size:11px; color:var(--accent); margin-top:4px;">${data.explanation}</p>` : ''}
            </div>
        `;
    } else {
        grammarContent.innerHTML = `
            <div class="correction-highlight">
                <span style="color:var(--primary)">✨ Excellent grammar and natural phrasing! Keep going!</span>
            </div>
        `;
    }
}

function appendMessage(sender, text, className) {
    const msg = document.createElement("div");
    msg.className = `message ${className}`;
    msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 4. Voice Output & Talking Lip-Sync Animation
function playServerAudio(url) {
    rukuAudio.src = url;
    rukuAudio.play().catch(e => console.log("Audio play error:", e));
    setupLipSync();
}

function speakRukuText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = getLanguageCode(currentLanguage);
        utterance.rate = 0.95;
        
        // Find natural female voice if available
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => v.lang.startsWith(utterance.lang.slice(0, 2)) && (v.name.includes("Female") || v.name.includes("Jenny") || v.name.includes("Zira")));
        if (femaleVoice) utterance.voice = femaleVoice;

        utterance.onstart = () => startSimulatedLipSync();
        utterance.onend = () => stopLipSync();
        utterance.onerror = () => stopLipSync();

        window.speechSynthesis.speak(utterance);
    }
}

function startSimulatedLipSync() {
    avatarGraphic.classList.add("speaking");
    stateText.innerText = "Ruku is speaking...";
    let open = false;

    if (animFrameId) clearInterval(animFrameId);
    animFrameId = setInterval(() => {
        open = !open;
        if (rukuMouth) {
            rukuMouth.style.transform = open ? "scaleY(2.2) scaleX(1.15)" : "scaleY(0.7) scaleX(0.95)";
        }
    }, 140);
}

function setupLipSync() {
    startSimulatedLipSync();
    rukuAudio.onended = () => stopLipSync();
    rukuAudio.onerror = () => stopLipSync();
}

function stopLipSync() {
    if (animFrameId) {
        clearInterval(animFrameId);
        animFrameId = null;
    }
    if (rukuMouth) rukuMouth.style.transform = "scaleY(1) scaleX(1)";
    avatarGraphic.classList.remove("speaking");
    stateText.innerText = "Ruku is ready to listen";
}

// 5. Event Listeners & Modals
function setupEventListeners() {
    micBtn.addEventListener("click", () => {
        if (!recognition) return;
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.lang = getLanguageCode(currentLanguage);
            recognition.start();
        }
    });

    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = textInput.value.trim();
        if (text) {
            textInput.value = "";
            handleUserMessage(text);
        }
    });

    languageSelect.addEventListener("change", (e) => {
        currentLanguage = e.target.value;
        if (recognition) recognition.lang = getLanguageCode(currentLanguage);
        appendMessage("System", `Switched practice language to ${currentLanguage}.`, "ruku-message");
    });

    proModalBtn.addEventListener("click", () => paypalModal.classList.add("open"));
    closeModalBtn.addEventListener("click", () => paypalModal.classList.remove("open"));
    paypalModal.addEventListener("click", (e) => {
        if (e.target === paypalModal) paypalModal.classList.remove("open");
    });
}

// 6. PayPal Sandbox Smart Button Integration
function setupPayPal() {
    if (window.paypal) {
        window.paypal.Buttons({
            createOrder: function(data, actions) {
                return actions.order.create({
                    purchase_units: [{
                        description: "RukuTalk Pro - Monthly Subscription (Sandbox)",
                        amount: {
                            value: '4.99'
                        }
                    }]
                });
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(function(details) {
                    alert('🎉 Payment Successful! Welcome to RukuTalk Pro, ' + details.payer.name.given_name + '!');
                    paypalModal.classList.remove("open");
                    document.getElementById("streakCount").innerText = "Pro Member 🔥";
                });
            }
        }).render('#paypal-button-container');
    }
}
