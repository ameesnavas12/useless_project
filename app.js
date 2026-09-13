// Infinite Staring Contest vs Larry the Cat
// Pure Webcam Camera Eye Tracking Engine

class StaringGame {
  constructor() {
    this.state = 'IDLE';
    this.startTime = 0;
    this.elapsedMs = 0;
    this.timerFrameId = null;

    // Camera & Blink Tracking State
    this.webcamActive = false;
    this.camera = null;
    this.faceMesh = null;
    this.currentEAR = 0.28;
    this.smoothedEAR = 0.28;
    this.blinkThreshold = 0.19;
    this.consecutiveBlinkFrames = 0;
    this.requiredBlinkFrames = 2; // ~80-120ms verification
    this.faceLostFrames = 0;
    this.maxAllowedFaceLostFrames = 45; // ~1.5s grace period for face loss

    // Calibration
    this.calibrationFrames = 0;
    this.baselineEARSum = 0;
    this.isCalibrated = false;

    // Larry Cat AI State
    this.larryBlinkTimeout = null;
    this.isLarryBlinking = false;

    // DOM Elements
    this.initDOMElements();

    // Audio Engine
    this.initAudioContext();

    // Event Listeners
    this.bindEvents();

    // Leaderboard
    this.loadLeaderboard();

    // Initialize Larry Overlay Canvas
    this.setupLarryCanvas();

    // Auto-initialize Webcam on Load
    this.initWebcam();
  }

  initDOMElements() {
    this.startBtn = document.getElementById('startBtn');
    this.retryBtn = document.getElementById('retryBtn');
    this.toggleCamBtn = document.getElementById('toggleCamBtn');
    this.saveScoreBtn = document.getElementById('saveScoreBtn');
    this.clearLeaderboardBtn = document.getElementById('clearLeaderboardBtn');

    this.timerBox = document.getElementById('timerBox');
    this.timerDigits = document.getElementById('timerDigits');
    this.finalTimeResult = document.getElementById('finalTimeResult');

    this.staringArena = document.getElementById('staringArena');
    this.gameOverArena = document.getElementById('gameOverArena');
    this.gameOverTitle = document.getElementById('gameOverTitle');

    this.larryImg = document.getElementById('larryImg');
    this.larryCanvas = document.getElementById('larryCanvas');
    this.larryCtx = this.larryCanvas.getContext('2d');

    this.videoElement = document.getElementById('webcam');
    this.webcamOverlay = document.getElementById('webcamOverlay');
    this.webcamCtx = this.webcamOverlay.getContext('2d');
    this.camStatus = document.getElementById('camStatus');

    this.earValueDisplay = document.getElementById('earValueDisplay');
    this.earBarFill = document.getElementById('earBarFill');
    this.sensitivitySlider = document.getElementById('sensitivitySlider');

    this.playerNameInput = document.getElementById('playerNameInput');
    this.leaderboardBody = document.getElementById('leaderboardBody');
  }

  initAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioCtx();

    // Preload Uploaded Audio Voice Files
    this.startAudio = new Audio('assets/game_start_voice.mp3');
    this.loseAudio = new Audio('assets/game_over_screaming.mp3');
  }

  playSound(type) {
    if (type === 'start') {
      if (this.loseAudio) {
        this.loseAudio.pause();
        this.loseAudio.currentTime = 0;
      }
      if (this.startAudio) {
        this.startAudio.currentTime = 0;
        this.startAudio.play().catch(err => console.log('Start voice playback prevented:', err));
      }
    } else if (type === 'lose') {
      if (this.startAudio) {
        this.startAudio.pause();
        this.startAudio.currentTime = 0;
      }
      if (this.loseAudio) {
        this.loseAudio.currentTime = 0;
        this.loseAudio.play().catch(err => console.log('Lose voice playback prevented:', err));
      }
    } else if (type === 'blink_cat') {
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'win') {
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, index) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.1);
        gain.gain.setValueAtTime(0.25, now + index * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + index * 0.1);
        osc.stop(now + index * 0.1 + 0.25);
      });
    }
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => this.startContest());
    this.retryBtn.addEventListener('click', () => this.resetToArena());

    this.toggleCamBtn.addEventListener('click', () => {
      if (this.webcamActive) {
        this.stopWebcam();
      } else {
        this.initWebcam();
      }
    });

    this.sensitivitySlider.addEventListener('input', (e) => {
      this.blinkThreshold = parseFloat(e.target.value);
    });

    this.saveScoreBtn.addEventListener('click', () => this.saveCurrentScore());
    this.clearLeaderboardBtn.addEventListener('click', () => this.clearLeaderboard());
  }

  setupLarryCanvas() {
    const resizeLarryCanvas = () => {
      this.larryCanvas.width = this.larryImg.clientWidth || 450;
      this.larryCanvas.height = this.larryImg.clientHeight || 450;
    };
    if (this.larryImg.complete) {
      resizeLarryCanvas();
    } else {
      this.larryImg.onload = resizeLarryCanvas;
    }
    window.addEventListener('resize', resizeLarryCanvas);
  }

  // Draw Larry's Eyelids Closing over eyes
  drawLarryEyelids(closedRatio) {
    const w = this.larryCanvas.width;
    const h = this.larryCanvas.height;
    this.larryCtx.clearRect(0, 0, w, h);

    if (closedRatio <= 0) return;

    const leftEye = { x: w * 0.43, y: h * 0.18, rx: w * 0.08, ry: h * 0.07 };
    const rightEye = { x: w * 0.72, y: h * 0.20, rx: w * 0.08, ry: h * 0.07 };

    this.larryCtx.fillStyle = '#100a14';

    [leftEye, rightEye].forEach(eye => {
      this.larryCtx.beginPath();
      const topHeight = eye.ry * 2 * closedRatio;
      this.larryCtx.ellipse(
        eye.x, 
        eye.y - eye.ry + (topHeight / 2), 
        eye.rx, 
        Math.max(1, topHeight / 2), 
        0, 0, Math.PI * 2
      );
      this.larryCtx.fill();
    });
  }

  scheduleLarryBlink() {
    if (this.state !== 'PLAYING') return;

    const delay = Math.random() * 5000 + 4000;
    this.larryBlinkTimeout = setTimeout(() => {
      if (this.state !== 'PLAYING') return;

      const larryGivesUp = Math.random() < 0.12;

      this.isLarryBlinking = true;
      this.playSound('blink_cat');

      let startTime = performance.now();
      const blinkDuration = 280;

      const animateBlink = (now) => {
        const progress = (now - startTime) / blinkDuration;
        if (progress < 1) {
          const ratio = Math.sin(progress * Math.PI);
          this.drawLarryEyelids(ratio);
          requestAnimationFrame(animateBlink);
        } else {
          this.drawLarryEyelids(0);
          this.isLarryBlinking = false;

          if (larryGivesUp && this.state === 'PLAYING') {
            this.endGame('LARRY BLINKED FIRST! YOU WON PRIDE!', true);
          } else if (this.state === 'PLAYING') {
            this.scheduleLarryBlink();
          }
        }
      };
      requestAnimationFrame(animateBlink);

    }, delay);
  }

  // --- WEBCAM & MEDIAPIPE OPTIMIZED FACE TRACKING ---
  initWebcam() {
    if (typeof FaceMesh === 'undefined') {
      this.camStatus.textContent = 'MediaPipe Loading...';
      setTimeout(() => this.initWebcam(), 1000);
      return;
    }

    this.camStatus.textContent = 'Requesting Camera Access...';

    this.faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.faceMesh.onResults((results) => this.onFaceMeshResults(results));

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 60 } } })
        .then((stream) => {
          this.videoElement.srcObject = stream;
          this.webcamActive = true;
          this.toggleCamBtn.textContent = 'Cam On';
          this.camStatus.textContent = 'Align Face to Camera';

          this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
              if (this.webcamActive && this.faceMesh) {
                await this.faceMesh.send({ image: this.videoElement });
              }
            },
            width: 640,
            height: 480
          });
          this.camera.start();
        })
        .catch((err) => {
          console.warn('Webcam error:', err);
          this.camStatus.textContent = 'Camera Access Denied';
          this.webcamActive = false;
          this.toggleCamBtn.textContent = 'Cam Off';
        });
    }
  }

  stopWebcam() {
    if (this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
    this.webcamActive = false;
    this.toggleCamBtn.textContent = 'Cam Off';
    this.camStatus.textContent = 'Camera Off';
  }

  // Eye Aspect Ratio (EAR) Formula
  calculateEAR(landmarks, eyeIndices) {
    const p1 = landmarks[eyeIndices[0]];
    const p4 = landmarks[eyeIndices[1]];
    const p2 = landmarks[eyeIndices[2]];
    const p3 = landmarks[eyeIndices[3]];
    const p6 = landmarks[eyeIndices[4]];
    const p5 = landmarks[eyeIndices[5]];

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    const vertical1 = dist(p2, p6);
    const vertical2 = dist(p3, p5);
    const horizontal = dist(p1, p4);

    return (vertical1 + vertical2) / (2.0 * horizontal);
  }

  onFaceMeshResults(results) {
    const w = this.webcamOverlay.width = this.videoElement.videoWidth || 320;
    const h = this.webcamOverlay.height = this.videoElement.videoHeight || 240;
    this.webcamCtx.clearRect(0, 0, w, h);

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this.faceLostFrames++;
      this.camStatus.textContent = '⚠️ Align Face with Camera';
      
      if (this.state === 'PLAYING' && this.faceLostFrames > this.maxAllowedFaceLostFrames) {
        this.endGame('FACE LOST! STAY IN CAMERA VIEW');
      }
      return;
    }

    this.faceLostFrames = 0;
    const landmarks = results.multiFaceLandmarks[0];

    // Landmark Indices
    const leftEyeIdx = [33, 133, 160, 158, 144, 153];
    const rightEyeIdx = [362, 263, 385, 387, 380, 373];

    const leftEAR = this.calculateEAR(landmarks, leftEyeIdx);
    const rightEAR = this.calculateEAR(landmarks, rightEyeIdx);
    const rawEAR = (leftEAR + rightEAR) / 2.0;

    // Exponential Moving Average (EMA) smoothing for stability
    this.smoothedEAR = (0.65 * rawEAR) + (0.35 * this.smoothedEAR);
    this.currentEAR = this.smoothedEAR;

    // Auto-calibration baseline
    if (!this.isCalibrated && this.calibrationFrames < 30) {
      this.calibrationFrames++;
      this.baselineEARSum += this.currentEAR;
      if (this.calibrationFrames === 30) {
        const baseline = this.baselineEARSum / 30;
        this.blinkThreshold = Math.min(0.24, Math.max(0.14, baseline * 0.68));
        this.sensitivitySlider.value = this.blinkThreshold.toFixed(2);
        this.isCalibrated = true;
      }
    }

    const isBlinkingNow = this.currentEAR < this.blinkThreshold;

    // Render Crisp Eye Landmarks on Camera Viewport
    this.webcamCtx.strokeStyle = isBlinkingNow ? '#ff0055' : '#00f5d4';
    this.webcamCtx.lineWidth = 2.5;

    [leftEyeIdx, rightEyeIdx].forEach(eye => {
      this.webcamCtx.beginPath();
      eye.forEach((idx, i) => {
        const pt = landmarks[idx];
        if (i === 0) this.webcamCtx.moveTo(pt.x * w, pt.y * h);
        else this.webcamCtx.lineTo(pt.x * w, pt.y * h);
      });
      this.webcamCtx.closePath();
      this.webcamCtx.stroke();
    });

    // Update Status Pill on Cam
    if (isBlinkingNow) {
      this.camStatus.textContent = '🙈 BLINK DETECTED!';
      this.camStatus.style.color = '#ff0055';
    } else {
      this.camStatus.textContent = '👁️ Eyes Open & Tracking';
      this.camStatus.style.color = '#00f5d4';
    }

    // Update EAR GUI
    this.earValueDisplay.textContent = this.currentEAR.toFixed(2);
    const percentage = Math.min(100, Math.max(0, (this.currentEAR / 0.38) * 100));
    this.earBarFill.style.width = `${percentage}%`;

    if (isBlinkingNow) {
      this.earBarFill.style.background = '#ff0055';
    } else {
      this.earBarFill.style.background = 'linear-gradient(90deg, #ff0055 0%, #ffbe0b 40%, #38b000 100%)';
    }

    // Strict Blink Verification Engine
    if (this.state === 'PLAYING') {
      if (isBlinkingNow) {
        this.consecutiveBlinkFrames++;
        if (this.consecutiveBlinkFrames >= this.requiredBlinkFrames) {
          this.endGame('YOU BLINKED! (CAMERA DETECTED)');
        }
      } else {
        this.consecutiveBlinkFrames = 0;
      }
    }
  }

  // --- GAME CONTROLS & TIMERS ---
  startContest() {
    if (this.state === 'PLAYING') return;

    if (!this.webcamActive) {
      this.initWebcam();
    }

    this.playSound('start');
    this.state = 'PLAYING';
    this.startTime = performance.now();
    this.consecutiveBlinkFrames = 0;
    this.faceLostFrames = 0;

    this.startBtn.style.display = 'none';
    this.timerBox.classList.add('active-timer');

    this.updateTimer();
    this.scheduleLarryBlink();
  }

  updateTimer() {
    if (this.state !== 'PLAYING') return;

    const now = performance.now();
    this.elapsedMs = now - this.startTime;

    const totalSecs = Math.floor(this.elapsedMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const ms = Math.floor((this.elapsedMs % 1000) / 10);

    const pad = (num) => String(num).padStart(2, '0');
    this.timerDigits.textContent = `${pad(mins)}:${pad(secs)}.${pad(ms)}`;

    this.timerFrameId = requestAnimationFrame(() => this.updateTimer());
  }

  endGame(reason = 'YOU BLINKED!', userWon = false) {
    if (this.state === 'GAMEOVER') return;

    this.state = 'GAMEOVER';
    cancelAnimationFrame(this.timerFrameId);
    clearTimeout(this.larryBlinkTimeout);

    this.timerBox.classList.remove('active-timer');
    this.playSound(userWon ? 'win' : 'lose');

    const timeInSeconds = (this.elapsedMs / 1000).toFixed(2);
    this.finalTimeResult.textContent = `${timeInSeconds}s`;

    this.gameOverTitle.textContent = userWon ? 'LARRY BLINKED! YOU WON PRIDE!' : reason;
    this.staringArena.style.display = 'none';
    this.gameOverArena.style.display = 'flex';
  }

  resetToArena() {
    this.state = 'IDLE';
    this.timerDigits.textContent = '00:00.00';
    this.staringArena.style.display = 'flex';
    this.gameOverArena.style.display = 'none';
    this.startBtn.style.display = 'inline-flex';
    this.drawLarryEyelids(0);
  }

  // --- LEADERBOARD ---
  loadLeaderboard() {
    const defaultScores = [
      { name: 'GigaChad Starer', time: 42.50, outcome: 'Larry Blinked', date: '2026-09-12' },
      { name: 'Blink Master 3000', time: 24.15, outcome: 'Blinked', date: '2026-09-11' },
      { name: 'Cat Whispers', time: 18.80, outcome: 'Blinked', date: '2026-09-10' },
      { name: 'Larry The Cat 🐱', time: 999.99, outcome: 'Infinite Stare', date: '2026-01-01' }
    ];

    const stored = localStorage.getItem('staring_contest_leaderboard');
    this.leaderboard = stored ? JSON.parse(stored) : defaultScores;
    this.renderLeaderboard();
  }

  renderLeaderboard() {
    this.leaderboard.sort((a, b) => b.time - a.time);
    this.leaderboardBody.innerHTML = '';

    this.leaderboard.slice(0, 10).forEach((entry, idx) => {
      const tr = document.createElement('tr');
      const rankMedal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;

      tr.innerHTML = `
        <td>${rankMedal}</td>
        <td><strong>${this.escapeHtml(entry.name)}</strong></td>
        <td>${entry.time.toFixed(2)}s</td>
        <td><span class="outcome-badge">${this.escapeHtml(entry.outcome)}</span></td>
      `;
      this.leaderboardBody.appendChild(tr);
    });
  }

  saveCurrentScore() {
    const name = this.playerNameInput.value.trim() || 'Anonymous Starer';
    const time = parseFloat((this.elapsedMs / 1000).toFixed(2));
    const outcome = this.gameOverTitle.textContent.includes('WON') ? 'Larry Blinked' : 'Camera Blinked';

    this.leaderboard.push({
      name: name,
      time: time,
      outcome: outcome,
      date: new Date().toISOString().split('T')[0]
    });

    localStorage.setItem('staring_contest_leaderboard', JSON.stringify(this.leaderboard));
    this.renderLeaderboard();

    this.saveScoreBtn.disabled = true;
    this.saveScoreBtn.textContent = 'SAVED! ✅';
    setTimeout(() => {
      this.saveScoreBtn.disabled = false;
      this.saveScoreBtn.textContent = 'SAVE SCORE';
    }, 2000);
  }

  clearLeaderboard() {
    if (confirm('Reset Leaderboard high scores?')) {
      localStorage.removeItem('staring_contest_leaderboard');
      this.loadLeaderboard();
    }
  }

  escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.game = new StaringGame();
});