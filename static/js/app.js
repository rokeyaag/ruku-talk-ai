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

// 2. Speech Recognition Setup (Web Speech API + MediaDevices)
let micStream = null;

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = getLanguageCode(currentLanguage);

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add("recording");
            audioVisualizer.classList.add("active");
            micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Listening... Speak now in ${currentLanguage}</span>`;
            stateText.innerText = "Ruku is listening carefully...";
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (interimTranscript) {
                micHint.innerHTML = `<span style="color:var(--accent); font-weight:500;">Hearing: "${interimTranscript}"...</span>`;
            }

            if (finalTranscript && finalTranscript.trim()) {
                micHint.innerText = `Recognized: "${finalTranscript.trim()}"`;
                handleUserMessage(finalTranscript.trim());
            }
        };

        recognition.onerror = (event) => {
            console.warn("SpeechRecognition error:", event.error);
            stopRecording();

            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                micHint.innerHTML = `<span style="color:var(--danger); font-weight:700;">⚠️ Mic Blocked!</span> Click the 🔒 lock icon in the address bar & allow Microphone.`;
            } else if (event.error === 'network') {
                micHint.innerHTML = `<span style="color:var(--warning); font-weight:700;">⚠️ Voice Service blocked.</span> In Brave Browser, enable Google Speech Services in settings (or type your message below).`;
            } else if (event.error === 'no-speech') {
                micHint.innerText = "No voice detected. Click the mic again and speak clearly!";
            } else {
                micHint.innerText = `Voice error (${event.error}). You can also type below!`;
            }
        };

        recognition.onend = () => {
            stopRecording();
        };
    } else {
        micHint.innerHTML = `<span style="color:var(--warning);">Speech API not supported in this browser. Use text input below.</span>`;
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

function setupMicrophoneVisualizer(stream) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const bars = audioVisualizer.querySelectorAll(".bar");

        function updateVisualizer() {
            if (!isRecording) return;
            analyser.getByteFrequencyData(dataArray);
            bars.forEach((bar, index) => {
                const val = dataArray[index % dataArray.length];
                const height = Math.max(4, (val / 255) * 28);
                bar.style.height = `${height}px`;
            });
            requestAnimationFrame(updateVisualizer);
        }
        updateVisualizer();
    } catch (e) {
        console.warn("Audio visualizer error:", e);
    }
}

function stopRecording() {
    isRecording = false;
    micBtn.classList.remove("recording");
    audioVisualizer.classList.remove("active");
    if (!micHint.innerHTML.includes("⚠️") && !micHint.innerHTML.includes("Hearing:")) {
        micHint.innerText = "Click the microphone to speak with Ruku";
    }
    stateText.innerText = "Ruku is ready to listen";
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
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
    micBtn.addEventListener("click", async () => {
        if (isRecording) {
            if (recognition) recognition.stop();
            stopRecording();
            return;
        }

        // 1. Explicitly prompt user for Microphone permission using getUserMedia
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setupMicrophoneVisualizer(micStream);
            }
        } catch (micErr) {
            console.warn("Microphone access error:", micErr);
            micHint.innerHTML = `<span style="color:var(--danger); font-weight:700;">⚠️ Microphone permission denied!</span> Please allow microphone access in your browser address bar.`;
            return;
        }

        // 2. Start Speech Recognition
        if (recognition) {
            try {
                recognition.lang = getLanguageCode(currentLanguage);
                recognition.start();
            } catch (err) {
                console.warn("Could not start recognition directly:", err);
                try {
                    recognition.abort();
                    setTimeout(() => {
                        recognition.lang = getLanguageCode(currentLanguage);
                        recognition.start();
                    }, 200);
                } catch (e2) {
                    console.error("Failed to restart speech recognition:", e2);
                }
            }
        } else {
            micHint.innerHTML = `<span style="color:var(--warning);">Speech recognition unavailable in this browser. Please use the text input below.</span>`;
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
