// RukuTalk AI - Client Application Logic

let stagesData = [];
let currentStage = null;
let currentLanguage = "English";
let isRecording = false;
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
    await loadStages();
    setupEventListeners();
    setupPayPal();

    // Unlock audio context on the first user interaction anywhere
    const unlockOnFirstClick = () => {
        unlockAudio();
        document.removeEventListener("click", unlockOnFirstClick);
        document.removeEventListener("keydown", unlockOnFirstClick);
    };
    document.addEventListener("click", unlockOnFirstClick);
    document.addEventListener("keydown", unlockOnFirstClick);

    // Warm up speech synthesis voices
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
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

function getStageStorageKey(stageId) {
    return `ruku_conv_stage_${stageId}`;
}

function saveStageHistory(stageId) {
    if (!stageId) return;
    try {
        localStorage.setItem(getStageStorageKey(stageId), JSON.stringify(conversationHistory));
    } catch (e) {
        console.warn("Storage save notice:", e);
    }
}

function loadStageHistory(stageId) {
    if (!stageId) return null;
    try {
        const raw = localStorage.getItem(getStageStorageKey(stageId));
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

async function clearStageHistory(stageId) {
    if (!stageId) return;
    try {
        localStorage.removeItem(getStageStorageKey(stageId));
        await fetch(`/api/chat-history?stage_id=${stageId}`, { method: "DELETE" });
    } catch (e) {
        console.warn("Clear history error:", e);
    }
}

async function selectStage(stage, levelName) {
    currentStage = stage;
    document.querySelectorAll(".stage-item").forEach(el => el.classList.remove("active"));
    const activeBtn = document.getElementById(`stage-btn-${stage.id}`);
    if (activeBtn) activeBtn.classList.add("active");

    currentStageTitle.innerText = stage.title;
    currentStageGoal.innerText = stage.description;
    currentStageTag.innerText = `Stage ${stage.id}`;
    if (levelName) currentLevelBadge.innerText = levelName;

    // Clear chat display for stage switch
    chatMessages.innerHTML = "";

    // 100% Persistent Memory: Load previous conversation from Server first, fallback to localStorage
    let history = [];
    try {
        const res = await fetch(`/api/chat-history?stage_id=${stage.id}`);
        const data = await res.json();
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
            history = data.history;
        }
    } catch (e) {
        console.warn("Backend chat history load notice:", e);
    }

    if (!history || history.length === 0) {
        const saved = loadStageHistory(stage.id);
        if (saved && Array.isArray(saved) && saved.length > 0) {
            history = saved;
        }
    }

    if (history && history.length > 0) {
        conversationHistory = [];
        let latestTurn = null;

        history.forEach(item => {
            if (item.user) {
                // Backend turn format: { user, ruku, fluency_score, accuracy_score, has_mistake, correction, ... }
                appendMessage("You", item.user, "user-message", null, item);
                conversationHistory.push({
                    role: "user",
                    text: item.user,
                    has_mistake: item.has_mistake,
                    correction: item.correction
                });
                if (item.ruku) {
                    appendMessage("Ruku", item.ruku, "ruku-message", item.audio_url || null);
                    conversationHistory.push({ role: "ruku", text: item.ruku, audio_url: item.audio_url || null });
                    latestTurn = item;
                }
            } else {
                // Client format: { role, text, ... }
                const isRuku = item.role === "ruku" || item.sender === "Ruku";
                appendMessage(
                    isRuku ? "Ruku" : "You",
                    item.text || item.message || "",
                    isRuku ? "ruku-message" : "user-message",
                    item.audio_url || null,
                    item
                );
                conversationHistory.push(item);
                if (isRuku) latestTurn = item;
            }
        });

        if (latestTurn) {
            updateScores(latestTurn.fluency_score, latestTurn.accuracy_score);
            updateGrammarFeedback(latestTurn);
            if (latestTurn.vocabulary_tip) {
                vocabContent.innerText = latestTurn.vocabulary_tip;
            }
        }
        saveStageHistory(stage.id);
    } else {
        // Start fresh for this stage
        conversationHistory = [];
        grammarContent.innerHTML = `<p class="empty-state">Starting ${stage.title}. Speak with Ruku!</p>`;
        vocabContent.innerText = `Focus topics: ${stage.topics.join(", ")}`;
        
        // Add Ruku's greeting to chat and history
        if (stage.initial_ruku_message) {
            conversationHistory.push({ role: "ruku", text: stage.initial_ruku_message });
            appendMessage("Ruku", stage.initial_ruku_message, "ruku-message");
            saveStageHistory(stage.id);
            speakRukuText(stage.initial_ruku_message);
        }
    }
}

// 2. Hardware-Accelerated Audio Recording & Voice Activity Detection (VAD)
let mediaRecorder = null;
let audioChunks = [];
let micStream = null;
let vadAnimFrame = null;
let autoStopTimer = null;
let isSubmittingSpeech = false;
let isRukuSpeaking = false;
let postSpeechCooldownTimer = null;

// Adaptive Noise Calibration & Speech Tracking
let ambientNoiseFloor = 10;
let isCalibratingNoise = false;
let calibrationStartTime = 0;
let calibrationSamples = [];
let speechEverDetected = false;
let totalSpeechMs = 0;
let lastVADTimestamp = 0;
let silenceStartTimestamp = null;

function stopRukuSpeech() {
    if (postSpeechCooldownTimer) {
        clearTimeout(postSpeechCooldownTimer);
        postSpeechCooldownTimer = null;
    }
    if (rukuAudio) {
        try {
            rukuAudio.pause();
            rukuAudio.currentTime = 0;
        } catch (e) {}
    }
    if ('speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch (e) {}
    }
    isRukuSpeaking = false;
    stopLipSync();
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

async function startRecording() {
    if (isRecording || isSubmittingSpeech || isRukuSpeaking) return;

    unlockAudio();

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            micHint.innerHTML = `<span style="color:var(--danger);">Microphone not supported on this browser.</span>`;
            return;
        }

        const constraints = {
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        micStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (micErr) {
        console.warn("Microphone access error:", micErr);
        micHint.innerHTML = `<span style="color:var(--danger); font-weight:700;">⚠️ Microphone permission denied!</span> Please allow microphone access in your browser address bar.`;
        return;
    }

    // Determine optimal supported MediaRecorder mimeType
    let mimeType = 'audio/webm;codecs=opus';
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
    }

    try {
        mediaRecorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);
    } catch (e) {
        mediaRecorder = new MediaRecorder(micStream);
    }

    audioChunks = [];
    speechEverDetected = false;
    totalSpeechMs = 0;
    silenceStartTimestamp = null;
    isCalibratingNoise = true;
    calibrationStartTime = Date.now();
    calibrationSamples = [];
    lastVADTimestamp = Date.now();
    isRecording = true;

    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            audioChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = async () => {
        const mime = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: mime });
        audioChunks = [];
        if (audioBlob.size > 500) {
            await sendAudioToBackend(audioBlob);
        } else {
            isSubmittingSpeech = false;
            stateText.innerText = "Ruku is ready to listen";
            micHint.innerText = "Click the microphone to speak with Ruku";
        }
    };

    // Clean single-container recording without timeslice fragmentation
    mediaRecorder.start();

    // UI Updates
    micBtn.classList.add("recording");
    audioVisualizer.classList.add("active");
    micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Listening... (Calibrating room audio)</span>`;
    stateText.innerText = "Ruku is listening carefully...";

    // AudioContext strictly for VAD & Visualizer (no loopback to speakers!)
    try {
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        const source = audioContext.createMediaStreamSource(micStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const bars = audioVisualizer.querySelectorAll(".bar");

        function vadLoop() {
            if (!isRecording) return;
            analyser.getByteFrequencyData(dataArray);

            // Animate visualizer bars in real-time
            bars.forEach((bar, index) => {
                const val = dataArray[index % dataArray.length];
                const height = Math.max(4, (val / 255) * 28);
                bar.style.height = `${height}px`;
            });

            // Focus on human vocal formant frequency bins (bins 1 to 8, ~300Hz-3500Hz)
            let voiceSum = 0;
            let voiceBinsCount = 0;
            for (let i = 1; i <= 8 && i < dataArray.length; i++) {
                voiceSum += dataArray[i];
                voiceBinsCount++;
            }
            const voiceBandEnergy = voiceBinsCount > 0 ? (voiceSum / voiceBinsCount) : 0;

            const now = Date.now();
            const dt = Math.min(100, Math.max(1, now - lastVADTimestamp));
            lastVADTimestamp = now;

            // Phase 1: Calibrate ambient noise floor for first 300ms
            if (isCalibratingNoise) {
                calibrationSamples.push(voiceBandEnergy);
                if (now - calibrationStartTime >= 300) {
                    isCalibratingNoise = false;
                    const sum = calibrationSamples.reduce((a, b) => a + b, 0);
                    const measured = sum / (calibrationSamples.length || 1);
                    ambientNoiseFloor = Math.max(6, Math.min(26, measured));
                    micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Listening... (Speak freely, pauses auto-submit)</span>`;
                }
                vadAnimFrame = requestAnimationFrame(vadLoop);
                return;
            }

            // Phase 2: Dynamic threshold based on calibrated ambient room noise
            const voiceThreshold = Math.max(13, ambientNoiseFloor + 8);

            if (voiceBandEnergy > voiceThreshold) {
                totalSpeechMs += dt;
                if (totalSpeechMs >= 250) {
                    // Genuine sustained speech confirmed (avoids mic pop / click triggers)
                    speechEverDetected = true;
                }
                silenceStartTimestamp = null;
                micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Hearing you speak...</span>`;
            } else if (speechEverDetected) {
                if (!silenceStartTimestamp) {
                    silenceStartTimestamp = now;
                } else {
                    const silenceDuration = now - silenceStartTimestamp;
                    if (silenceDuration > 1300) {
                        // 1.3 seconds natural conversational pause detected -> submit!
                        micHint.innerHTML = `<span style="color:var(--accent); font-weight:600;">⚡ Answer finished! Generating reply...</span>`;
                        stopRecording(true);
                        return;
                    } else if (silenceDuration > 600) {
                        micHint.innerHTML = `<span style="color:var(--text-muted); font-weight:500;">🎙️ Pausing... (${Math.ceil((1300 - silenceDuration)/1000)}s)</span>`;
                    }
                }
            }

            vadAnimFrame = requestAnimationFrame(vadLoop);
        }
        vadAnimFrame = requestAnimationFrame(vadLoop);

        // Safety limit: 14 seconds auto stop
        if (autoStopTimer) clearTimeout(autoStopTimer);
        autoStopTimer = setTimeout(() => {
            if (isRecording) {
                stopRecording(true);
            }
        }, 14000);

    } catch (e) {
        console.warn("VAD init warning:", e);
    }
}

function stopRecording(shouldTranscribe = true) {
    if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
    }
    if (vadAnimFrame) {
        cancelAnimationFrame(vadAnimFrame);
        vadAnimFrame = null;
    }

    isRecording = false;
    micBtn.classList.remove("recording");
    audioVisualizer.classList.remove("active");

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
        } catch (e) {}
    }

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }

    if (!shouldTranscribe) {
        isSubmittingSpeech = false;
        stateText.innerText = "Ruku is ready to listen";
        return;
    }
}

async function sendAudioToBackend(audioBlob) {
    if (isSubmittingSpeech) return;
    isSubmittingSpeech = true;

    micHint.innerHTML = `<span style="color:var(--accent); font-weight:600;">⚡ Ruku is listening & thinking...</span>`;
    stateText.innerText = "Ruku is understanding & responding...";

    try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "user_voice.webm");
        formData.append("language", currentLanguage);
        formData.append("stage_json", JSON.stringify(currentStage || {}));
        formData.append("chat_history_json", JSON.stringify(conversationHistory || []));

        const res = await fetch("/api/voice-chat", {
            method: "POST",
            body: formData
        });
        const data = await res.json();

        if (data.success && data.user_text) {
            micHint.innerText = `Recognized: "${data.user_text}"`;

            // 1. Show user message in transcript & save history
            appendMessage("You", data.user_text, "user-message", null, data);
            conversationHistory.push({
                role: "user",
                text: data.user_text,
                has_mistake: data.has_mistake,
                correction: data.correction
            });

            // 2. Update real-time scores & grammar coaching
            updateScores(data.fluency_score, data.accuracy_score);
            updateGrammarFeedback(data);
            if (data.vocabulary_tip) {
                vocabContent.innerText = data.vocabulary_tip;
            }

            // 3. Output Ruku's response & persist stage memory
            conversationHistory.push({ role: "ruku", text: data.reply, audio_url: data.audio_url || null });
            appendMessage("Ruku", data.reply, "ruku-message", data.audio_url);
            if (currentStage) saveStageHistory(currentStage.id);

            // 4. Play spoken response
            if (data.audio_url) {
                playServerAudio(data.audio_url, data.reply);
            } else {
                speakRukuText(data.reply);
            }
        } else if (data && data.is_echo) {
            // Anti-Echo Protection: Microphone captured Ruku's own speaker output
            micHint.innerHTML = `<span style="color:var(--warning); font-weight:600;">⚠️ ${data.error || 'Echo filtered. Please speak your answer!'}</span>`;
            stateText.innerText = "Ruku is ready to listen";

            const handsFreeCheckbox = document.getElementById("handsFreeCheckbox");
            if (handsFreeCheckbox && handsFreeCheckbox.checked) {
                setTimeout(() => {
                    if (!isRecording && !isSubmittingSpeech && !isRukuSpeaking) {
                        startRecording();
                    }
                }, 1400);
            }
        } else {
            const errMsg = data.error || "Could not catch clear words. Please click mic and speak closer.";
            micHint.innerHTML = `<span style="color:var(--warning); font-weight:600;">⚠️ ${errMsg}</span>`;
            stateText.innerText = "Ruku is ready to listen";
            
            // Allow retry in hands-free mode after brief pause
            const handsFreeCheckbox = document.getElementById("handsFreeCheckbox");
            if (handsFreeCheckbox && handsFreeCheckbox.checked) {
                setTimeout(() => {
                    if (!isRecording && !isSubmittingSpeech && !isRukuSpeaking) {
                        startRecording();
                    }
                }, 2200);
            }
        }
    } catch (err) {
        console.error("Voice-chat connection error:", err);
        micHint.innerText = "Click the microphone to speak with Ruku";
        stateText.innerText = "Ruku is ready to listen";
    } finally {
        isSubmittingSpeech = false;
    }
}


// 3. User Message Handling & Server Communication
async function handleUserMessage(message) {
    if (!message || !message.trim()) {
        isSubmittingSpeech = false;
        return;
    }

    appendMessage("You", message, "user-message");
    conversationHistory.push({ role: "user", text: message });
    if (currentStage) saveStageHistory(currentStage.id);
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
        conversationHistory.push({ role: "ruku", text: data.reply, audio_url: data.audio_url || null });
        appendMessage("Ruku", data.reply, "ruku-message", data.audio_url);
        if (currentStage) saveStageHistory(currentStage.id);
        
        if (data.audio_url) {
            playServerAudio(data.audio_url, data.reply);
        } else {
            speakRukuText(data.reply);
        }
    } catch (err) {
        console.error("Chat error:", err);
        stateText.innerText = "Ruku is ready to listen";
    } finally {
        isSubmittingSpeech = false;
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

function appendMessage(sender, text, className, audioUrl = null, feedback = null) {
    const msg = document.createElement("div");
    msg.className = `message ${className}`;
    
    let btnHtml = "";
    if (sender === "Ruku" && text) {
        btnHtml = `<button class="msg-audio-btn" type="button" title="Click to listen to Ruku speak">🔊 Listen</button>`;
    }

    let correctionHtml = "";
    if (sender === "You" && feedback && feedback.has_mistake && feedback.correction) {
        correctionHtml = `
            <div class="msg-correction-pill">
                <span class="pill-icon">💡</span>
                <span><strong>Better:</strong> "${feedback.correction}"</span>
            </div>
        `;
    }

    msg.innerHTML = `<strong>${sender}:</strong> <span>${text}</span> ${btnHtml}${correctionHtml}`;
    
    if (sender === "Ruku" && text) {
        const audioBtn = msg.querySelector(".msg-audio-btn");
        if (audioBtn) {
            audioBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                unlockAudio();
                if (audioUrl) {
                    playServerAudio(audioUrl, text);
                } else {
                    speakRukuText(text);
                }
            });
        }
    }

    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 4. Voice Output & Talking Lip-Sync Animation
const SILENT_SOUND = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function unlockAudio() {
    try {
        if (rukuAudio && (!rukuAudio.src || rukuAudio.src === "" || rukuAudio.src === window.location.href)) {
            rukuAudio.src = SILENT_SOUND;
            rukuAudio.volume = 1.0;
            rukuAudio.play().then(() => {
                // Audio is now permanently unlocked for automatic unmuted playback
            }).catch(() => {});
        }
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    } catch (e) {}
}

function playServerAudio(url, fallbackText = null) {
    if (postSpeechCooldownTimer) {
        clearTimeout(postSpeechCooldownTimer);
        postSpeechCooldownTimer = null;
    }

    if (!url) {
        if (fallbackText) speakRukuText(fallbackText);
        return;
    }
    
    // Stop recording immediately if active to avoid capturing Ruku's voice
    if (isRecording) {
        stopRecording(false);
    }

    isRukuSpeaking = true;
    rukuAudio.src = url;
    rukuAudio.currentTime = 0;
    
    const playPromise = rukuAudio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            setupLipSync();
        }).catch(err => {
            console.warn("Server audio playback failed or blocked by browser, falling back to speech synthesis:", err);
            if (fallbackText) {
                speakRukuText(fallbackText);
            } else {
                isRukuSpeaking = false;
                stopLipSync();
            }
        });
    } else {
        setupLipSync();
    }
}

function speakRukuText(text) {
    if (!text || !('speechSynthesis' in window)) return;

    if (postSpeechCooldownTimer) {
        clearTimeout(postSpeechCooldownTimer);
        postSpeechCooldownTimer = null;
    }

    if (isRecording) {
        stopRecording(false);
    }

    isRukuSpeaking = true;

    try {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();
    } catch (e) {}

    setTimeout(() => {
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = getLanguageCode(currentLanguage);
            utterance.rate = 0.95;
            utterance.pitch = 1.05;
            utterance.volume = 1.0;
            
            // Find natural female voice if available
            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length > 0) {
                const langPrefix = utterance.lang.slice(0, 2).toLowerCase();
                const femaleVoice = voices.find(v => 
                    v.lang.toLowerCase().startsWith(langPrefix) && 
                    (v.name.includes("Female") || v.name.includes("Jenny") || v.name.includes("Zira") || v.name.includes("Google") || v.name.includes("Natural"))
                ) || voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
                if (femaleVoice) utterance.voice = femaleVoice;
            }

            utterance.onstart = () => startSimulatedLipSync();
            utterance.onend = () => {
                isRukuSpeaking = false;
                stopLipSync();
                handlePostSpeechAutoListen();
            };
            utterance.onerror = (e) => {
                console.warn("SpeechSynthesis error:", e);
                isRukuSpeaking = false;
                stopLipSync();
            };

            window.speechSynthesis.speak(utterance);

            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
        } catch (err) {
            console.warn("speakRukuText exception:", err);
            isRukuSpeaking = false;
            stopLipSync();
        }
    }, 60);
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
    rukuAudio.onended = () => {
        isRukuSpeaking = false;
        stopLipSync();
        handlePostSpeechAutoListen();
    };
    rukuAudio.onerror = () => {
        isRukuSpeaking = false;
        stopLipSync();
    };
}

function handlePostSpeechAutoListen() {
    if (postSpeechCooldownTimer) {
        clearTimeout(postSpeechCooldownTimer);
        postSpeechCooldownTimer = null;
    }

    const handsFreeCheckbox = document.getElementById("handsFreeCheckbox");
    if (handsFreeCheckbox && handsFreeCheckbox.checked && !isRecording && !isSubmittingSpeech && !isRukuSpeaking) {
        stateText.innerText = "Ruku finished speaking. Waiting to listen...";
        micHint.innerHTML = `<span style="color:var(--text-muted); font-size:12px;">Cooling down speakers...</span>`;

        // 1000ms acoustic dissipation cooldown to completely silence speaker reverberation
        postSpeechCooldownTimer = setTimeout(() => {
            postSpeechCooldownTimer = null;
            if (!isRecording && !isSubmittingSpeech && !isRukuSpeaking) {
                stateText.innerText = "Ruku is listening for your answer...";
                micHint.innerHTML = `<span style="color:var(--primary); font-weight:600;">🎙️ Your turn to speak! (Auto-listening...)</span>`;
                startRecording();
            }
        }, 1000);
    }
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
        unlockAudio();
        // Barge-in: if Ruku is speaking, clicking mic interrupts her immediately
        if (isRukuSpeaking) {
            stopRukuSpeech();
            await startRecording();
            return;
        }
        if (isRecording) {
            stopRecording(true);
        } else {
            await startRecording();
        }
    });

    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        unlockAudio();
        const text = textInput.value.trim();
        if (text) {
            textInput.value = "";
            handleUserMessage(text);
        }
    });

    languageSelect.addEventListener("change", (e) => {
        currentLanguage = e.target.value;
        appendMessage("System", `Switched practice language to ${currentLanguage}.`, "ruku-message");
    });

    proModalBtn.addEventListener("click", () => paypalModal.classList.add("open"));
    closeModalBtn.addEventListener("click", () => paypalModal.classList.remove("open"));
    paypalModal.addEventListener("click", (e) => {
        if (e.target === paypalModal) paypalModal.classList.remove("open");
    });

    // Clear transcript and reset stage memory
    const clearChatBtn = document.getElementById("clearChatBtn");
    if (clearChatBtn) {
        clearChatBtn.addEventListener("click", () => {
            if (currentStage && confirm("Are you sure you want to clear memory and restart this stage?")) {
                clearStageHistory(currentStage.id);
                selectStage(currentStage);
            }
        });
    }

    // Clicking Ruku's avatar replays her latest message
    avatarGraphic.addEventListener("click", () => {
        unlockAudio();
        const lastRukuMsg = [...conversationHistory].reverse().find(m => m.role === "ruku");
        if (lastRukuMsg && lastRukuMsg.text) {
            speakRukuText(lastRukuMsg.text);
        }
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
