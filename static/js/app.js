// RukuTalk AI - Client Application Logic

let stagesData = [];
let currentStage = null;
let currentLanguage = "English";
let isRecording = false;
let recognition = null;
let audioContext = null;
let analyser = null;
let animFrameId = null;
let conversationHistory = [];

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

    // Reset feedback and conversation history for new stage
    conversationHistory = [];
    grammarContent.innerHTML = `<p class="empty-state">Starting ${stage.title}. Speak with Ruku!</p>`;
    vocabContent.innerText = `Focus topics: ${stage.topics.join(", ")}`;
    
    // Add Ruku's greeting to chat and history
    if (stage.initial_ruku_message) {
        conversationHistory.push({ role: "ruku", text: stage.initial_ruku_message });
    }
    appendMessage("Ruku", stage.initial_ruku_message, "ruku-message");
    speakRukuText(stage.initial_ruku_message);
}

// 2. Speech & Audio Recording Setup
let micStream = null;
let wavAudioContext = null;
let scriptProcessor = null;
let micSource = null;
let recordedBuffers = [];
let recordingSampleRate = 16000;
let isAudioRecording = false;
let autoStopTimer = null;
let isSubmittingSpeech = false;
let hasVoiceSpoken = false;
let silenceStartTimestamp = null;

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        try {
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;
            recognition.lang = getLanguageCode(currentLanguage);

            recognition.onstart = () => {
                isRecording = true;
                micBtn.classList.add("recording");
                audioVisualizer.classList.add("active");
                micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Listening... Click mic again when done!</span>`;
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
                    if (!isSubmittingSpeech) {
                        isSubmittingSpeech = true;
                        micHint.innerText = `Recognized: "${finalTranscript.trim()}"`;
                        stopRecording(false);
                        handleUserMessage(finalTranscript.trim());
                    }
                }
            };

            recognition.onerror = (event) => {
                console.warn("Browser SpeechRecognition warning:", event.error);
                // In Brave/Firefox, webkitSpeechRecognition often fails with 'network' or 'not-allowed'.
                // We do NOT stop recording here because our universal backend audio recorder will handle it seamlessly!
                if (event.error === 'not-allowed') {
                    micHint.innerHTML = `<span style="color:var(--danger); font-weight:700;">⚠️ Mic Blocked!</span> Click the 🔒 lock icon in the URL bar to allow microphone.`;
                }
            };

            recognition.onend = () => {
                // If speech recognition ended but audio recorder is still active, audio recorder handles transcription
            };
        } catch (e) {
            console.warn("SpeechRecognition init exception:", e);
        }
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

function startWavRecording(stream) {
    recordedBuffers = [];
    isAudioRecording = true;
    hasVoiceSpoken = false;
    silenceStartTimestamp = null;
    isSubmittingSpeech = false;

    try {
        if (!wavAudioContext || wavAudioContext.state === 'closed') {
            wavAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (wavAudioContext.state === 'suspended') {
            wavAudioContext.resume();
        }
        recordingSampleRate = wavAudioContext.sampleRate;
        micSource = wavAudioContext.createMediaStreamSource(stream);
        
        analyser = wavAudioContext.createAnalyser();
        analyser.fftSize = 64;
        micSource.connect(analyser);

        // Process audio in 4096-sample chunks
        scriptProcessor = wavAudioContext.createScriptProcessor(4096, 1, 1);
        const SILENCE_TIMEOUT_MS = 1300; // 1.3 seconds of pause ends speech automatically
        const VOICE_VOLUME_THRESHOLD = 0.016;

        scriptProcessor.onaudioprocess = (e) => {
            if (!isAudioRecording) return;
            const inputData = e.inputBuffer.getChannelData(0);
            recordedBuffers.push(new Float32Array(inputData));

            // Calculate RMS volume for Voice Activity Detection (VAD)
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);

            if (rms > VOICE_VOLUME_THRESHOLD) {
                hasVoiceSpoken = true;
                silenceStartTimestamp = null;
                micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Hearing you speak...</span>`;
            } else if (hasVoiceSpoken) {
                const now = performance.now();
                if (!silenceStartTimestamp) {
                    silenceStartTimestamp = now;
                } else if (now - silenceStartTimestamp > SILENCE_TIMEOUT_MS) {
                    // Automatically stop & send audio immediately without waiting 12s!
                    isAudioRecording = false;
                    micHint.innerHTML = `<span style="color:var(--accent); font-weight:600;">✨ Pause detected, processing speech...</span>`;
                    stopRecording(true);
                }
            }
        };

        micSource.connect(scriptProcessor);
        scriptProcessor.connect(wavAudioContext.destination);

        // Animate visualizer bars in real-time
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const bars = audioVisualizer.querySelectorAll(".bar");

        function updateVisualizer() {
            if (!isAudioRecording) return;
            analyser.getByteFrequencyData(dataArray);
            bars.forEach((bar, index) => {
                const val = dataArray[index % dataArray.length];
                const height = Math.max(4, (val / 255) * 28);
                bar.style.height = `${height}px`;
            });
            requestAnimationFrame(updateVisualizer);
        }
        updateVisualizer();

        // Safety limit: auto stop after 10 seconds of continuous speech
        if (autoStopTimer) clearTimeout(autoStopTimer);
        autoStopTimer = setTimeout(() => {
            if (isRecording || isAudioRecording) {
                stopRecording(true);
            }
        }, 10000);
    } catch (e) {
        console.warn("WAV recorder init error:", e);
    }
}

async function stopRecording(shouldTranscribe = true) {
    if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
    }

    const wasAudioRecording = isAudioRecording;
    isAudioRecording = false;
    isRecording = false;

    micBtn.classList.remove("recording");
    audioVisualizer.classList.remove("active");

    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }

    if (scriptProcessor && micSource) {
        try {
            scriptProcessor.disconnect();
            micSource.disconnect();
        } catch (e) {}
    }

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }

    if (!shouldTranscribe) {
        stateText.innerText = "Ruku is ready to listen";
        return;
    }

    // Process & transcribe recorded audio if we have audio samples
    if (wasAudioRecording && recordedBuffers.length > 3) {
        const wavBlob = exportWavBlob(recordedBuffers, recordingSampleRate);
        recordedBuffers = [];
        await sendAudioToBackendSTT(wavBlob);
    } else {
        recordedBuffers = [];
        stateText.innerText = "Ruku is ready to listen";
        if (!micHint.innerHTML.includes("⚠️")) {
            micHint.innerText = "Click the microphone to speak with Ruku";
        }
    }
}

async function sendAudioToBackendSTT(wavBlob) {
    if (isSubmittingSpeech) return;
    isSubmittingSpeech = true;

    micHint.innerHTML = `<span style="color:var(--accent); font-weight:600;">⏳ Transcribing your speech...</span>`;
    stateText.innerText = "Ruku is processing your voice...";

    try {
        const formData = new FormData();
        formData.append("audio", wavBlob, "user_voice.wav");
        formData.append("language", currentLanguage);

        const res = await fetch("/api/speech-to-text", {
            method: "POST",
            body: formData
        });
        const data = await res.json();

        if (data.success && data.text && data.text.trim()) {
            micHint.innerText = `Recognized: "${data.text.trim()}"`;
            handleUserMessage(data.text.trim());
        } else {
            const errMsg = data.error || "Could not hear clearly. Please click mic and try speaking closer.";
            micHint.innerHTML = `<span style="color:var(--warning);">${errMsg}</span>`;
            stateText.innerText = "Ruku is ready to listen";
        }
    } catch (err) {
        console.error("Backend STT error:", err);
        micHint.innerText = "Click the microphone to speak with Ruku";
        stateText.innerText = "Ruku is ready to listen";
    } finally {
        isSubmittingSpeech = false;
    }
}

function exportWavBlob(buffers, sampleRate) {
    let totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
    let merged = new Float32Array(totalLength);
    let offset = 0;
    for (let b of buffers) {
        merged.set(b, offset);
        offset += b.length;
    }

    let buffer = new ArrayBuffer(44 + merged.length * 2);
    let view = new DataView(buffer);

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + merged.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, merged.length * 2, true);

    let index = 44;
    for (let i = 0; i < merged.length; i++) {
        let s = Math.max(-1, Math.min(1, merged[i]));
        view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        index += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}


// 3. User Message Handling & Server Communication
async function handleUserMessage(message) {
    if (!message || !message.trim()) return;

    appendMessage("You", message, "user-message");
    conversationHistory.push({ role: "user", text: message });
    stateText.innerText = "Ruku is thinking...";

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: message,
                stage: currentStage || {},
                language: currentLanguage,
                chat_history: conversationHistory
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
        conversationHistory.push({ role: "ruku", text: data.reply });
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
        // If already recording, clicking mic again finishes and transcribes
        if (isRecording || isAudioRecording) {
            await stopRecording(true);
            return;
        }

        // 1. Explicitly prompt user for Microphone permission with DSP audio filtering
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const constraints = {
                    audio: {
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                };
                micStream = await navigator.mediaDevices.getUserMedia(constraints);
            } else {
                micHint.innerHTML = `<span style="color:var(--danger);">Microphone not supported on this browser.</span>`;
                return;
            }
        } catch (micErr) {
            console.warn("Microphone access error:", micErr);
            micHint.innerHTML = `<span style="color:var(--danger); font-weight:700;">⚠️ Microphone permission denied!</span> Please allow microphone access in your browser address bar.`;
            return;
        }

        // 2. Start Audio WAV Recorder + Visualizer
        isRecording = true;
        micBtn.classList.add("recording");
        audioVisualizer.classList.add("active");
        micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Listening... (Speak freely, auto-submits on pause)</span>`;
        stateText.innerText = "Ruku is listening carefully...";

        startWavRecording(micStream);

        // 3. Optional live interim preview via browser SpeechRecognition if supported
        if (recognition) {
            try {
                recognition.lang = getLanguageCode(currentLanguage);
                recognition.start();
            } catch (err) {
                console.warn("SpeechRecognition start notice:", err);
            }
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
