// Pong Game - Canvas-based implementation
(function() {
  'use strict';

  // Game constants
  const PADDLE_WIDTH = 15;
  const PADDLE_HEIGHT = 100;
  const BALL_RADIUS = 8;
  const PADDLE_SPEED = 8;
  const BALL_SPEED_BASE = 6;
  const BALL_SPEED_MAX = 12;
  const AI_SPEED_EASY = 4;
  const AI_SPEED_MEDIUM = 7;
  const AI_SPEED_HARD = 10;

  // Game state
  let canvas, ctx;
  let isRunning = false;
  let animationId = null;

  // Paddles
  let paddle1 = { x: 0, y: 0, targetY: 0, score: 0 };
  let paddle2 = { x: 0, y: 0, targetY: 0, score: 0 };

  // Ball
  let ball = { x: 0, y: 0, dx: 0, dy: 0, speed: BALL_SPEED_BASE };

  // Game mode
  let gameMode = 'local'; // 'local' or 'ai'
  let difficulty = 'easy'; // 'easy', 'medium', 'hard'
  let aiSpeed = AI_SPEED_EASY;

  // Input state
  let p1MovingUp = false;
  let p1MovingDown = false;
  let p2MovingUp = false;
  let p2MovingDown = false;

  // Mobile touch state
  let touchMode = false; // true on mobile
  let p1TouchActive = false;
  let p2TouchActive = false;

  // DOM elements
  let uiOverlay, scoreDisplay, p1ScoreEl, p2ScoreEl;
  let modeText, difficultyText;
  let startBtn, resetBtn;
  let gameMessage, instructions;

  // Initialize
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    uiOverlay = document.getElementById('ui-overlay');
    scoreDisplay = document.getElementById('score-display');
    p1ScoreEl = document.getElementById('p1-score');
    p2ScoreEl = document.getElementById('p2-score');
    modeText = document.getElementById('mode-text');
    difficultyText = document.getElementById('difficulty-text');
    startBtn = document.getElementById('start-btn');
    resetBtn = document.getElementById('reset-btn');
    gameMessage = document.getElementById('game-message');
    instructions = document.getElementById('desktop-instructions');

    handleResize();

    // Desktop event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Mobile touch listeners
    setupTouchListeners();

    // Start animation loop (will be suspended until game starts)
    animationLoop();
  }

  function handleResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Adjust paddles for different screen sizes
    if (canvas.width < 500) {
      PADDLE_WIDTH = 12;
      PADDLE_HEIGHT = 80;
      BALL_RADIUS = 6;
    } else if (canvas.width < 800) {
      PADDLE_WIDTH = 14;
      PADDLE_HEIGHT = 90;
      BALL_RADIUS = 7;
    }

    // Reset paddles to positions
    resetPaddlePosition(paddle1, canvas.width * 0.05);
    resetPaddlePosition(paddle2, canvas.width * 0.95);

    // Reset ball
    resetBall();

    // Reset net
    drawNet();
  }

  function resetPaddlePosition(paddle, targetX) {
    paddle.x = targetX;
    paddle.y = canvas.height / 2 - PADDLE_HEIGHT / 2;
    paddle.targetY = paddle.y;
  }

  function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speed = BALL_SPEED_BASE;

    // Random direction
    const direction = Math.random() < 0.5 ? -1 : 1;
    ball.dx = direction * ball.speed;
    ball.dy = (Math.random() * 4 - 2); // Slight vertical variation
  }

  function initGame() {
    paddle1.score = 0;
    paddle2.score = 0;
    updateScoreDisplay();

    resetPaddlePosition(paddle1, canvas.width * 0.05);
    resetPaddlePosition(paddle2, canvas.width * 0.95);
    resetBall();
  }

  function startGame() {
    if (!isRunning) {
      isRunning = true;
      gameMessage.classList.add('hidden');
      startBtn.textContent = 'Restart';
    }

    if (gameMessage.classList.contains('hidden')) {
      initGame();
    }

    animationId = requestAnimationFrame(animationLoop);
  }

  function stopGame() {
    isRunning = false;
    cancelAnimationFrame(animationId);
  }

  // Input handling
  function handleKeyDown(e) {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'ц': // Cyrillic Ц as alternative
        p1MovingUp = true;
        break;
      case 's':
      case 'ы': // Cyrillic ы as alternative
        p1MovingDown = true;
        break;
      case 'arrowup':
      case 'up':
        p2MovingUp = true;
        break;
      case 'arrowdown':
      case 'down':
        p2MovingDown = true;
        break;
    }
  }

  function handleKeyUp(e) {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'ц':
        p1MovingUp = false;
        break;
      case 's':
      case 'ы':
        p1MovingDown = false;
        break;
      case 'arrowup':
      case 'up':
        p2MovingUp = false;
        break;
      case 'arrowdown':
      case 'down':
        p2MovingDown = false;
        break;
    }
  }

  // Mobile touch handling
  function setupTouchListeners() {
    // Touch zone detection
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Button listeners for mobile
    const btnP1Up = document.querySelector('.touch-btn-p1');
    const btnP1Down = document.querySelector('.touch-btn-p1');
    const btnP2Up = document.querySelector('.touch-btn-up');
    const btnP2Down = document.querySelector('.touch-btn-down');

    if (btnP1Up) {
      btnP1Up.addEventListener('touchstart', (e) => { e.preventDefault(); p1MovingUp = true; });
      btnP1Up.addEventListener('touchend', (e) => { e.preventDefault(); p1MovingUp = false; });
    }
    if (btnP1Down) {
      btnP1Down.addEventListener('touchstart', (e) => { e.preventDefault(); p1MovingDown = true; });
      btnP1Down.addEventListener('touchend', (e) => { e.preventDefault(); p1MovingDown = false; });
    }
    if (btnP2Up) {
      btnP2Up.addEventListener('touchstart', (e) => { e.preventDefault(); p2MovingUp = true; });
      btnP2Up.addEventListener('touchend', (e) => { e.preventDefault(); p2MovingUp = false; });
    }
    if (btnP2Down) {
      btnP2Down.addEventListener('touchstart', (e) => { e.preventDefault(); p2MovingDown = true; });
      btnP2Down.addEventListener('touchend', (e) => { e.preventDefault(); p2MovingDown = false; });
    }
  }

  function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const y = touch.clientY - rect.top;

    if (y < canvas.height / 2) {
      p1TouchActive = true;
    } else {
      p2TouchActive = true;
    }

    canvas.classList.add('touch-active', `touch-${p1TouchActive ? 'p1' : 'p2'}`);
  }

  function handleTouchMove(e) {
    e.preventDefault();
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();

    for (const touch of e.changedTouches) {
      const y = touch.clientY - rect.top;
      if (y < canvas.height / 2) {
        p1TouchActive = false;
      } else {
        p2TouchActive = false;
      }
    }

    canvas.classList.remove('touch-p1', 'touch-p2');
  }

  // Main game loop
  function animationLoop() {
    if (!isRunning) return;

    update();
    draw();

    animationId = requestAnimationFrame(animationLoop);
  }

  function update() {
    // Update paddles
    updatePaddle(paddle1, PADDLE_SPEED, p1MovingUp, p1MovingDown);
    updatePaddle(paddle2, PADDLE_SPEED, p2MovingUp, p2MovingDown);

    // Update ball
    updateBall();

    // Update AI if in AI mode
    if (gameMode === 'ai') {
      updateAI();
    }

    // Check score
    checkScore();
  }

  function updatePaddle(paddle, speed, movingUp, movingDown) {
    paddle.targetY += (movingUp ? -speed : 0);
    paddle.targetY += (movingDown ? speed : 0);

    // Clamp to canvas
    paddle.y = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, paddle.targetY));
  }

  function updateBall() {
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collisions (left/right)
    if (ball.x - BALL_RADIUS < 0) {
      ball.x = BALL_RADIUS;
      ball.dx = Math.abs(ball.dx);
    } else if (ball.x + BALL_RADIUS > canvas.width) {
      ball.x = canvas.width - BALL_RADIUS;
      ball.dx = -Math.abs(ball.dx);
    }

    // Wall collisions (top/bottom)
    if (ball.y - BALL_RADIUS < 0) {
      ball.y = BALL_RADIUS;
      ball.dy = Math.abs(ball.dy);
    } else if (ball.y + BALL_RADIUS > canvas.height) {
      ball.y = canvas.height - BALL_RADIUS;
      ball.dy = -Math.abs(ball.dy);
    }
  }

  function updateAI() {
    // Simple AI: follow ball with speed limit
    const targetY = ball.y - PADDLE_HEIGHT / 2;
    const diff = targetY - paddle2.y;

    if (Math.abs(diff) < aiSpeed) {
      paddle2.y += diff;
    } else if (diff > 0) {
      paddle2.y += aiSpeed;
    } else {
      paddle2.y -= aiSpeed;
    }

    // Clamp
    paddle2.y = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, paddle2.y));
  }

  function checkScore() {
    // Left paddle miss (right side)
    if (ball.x < 0) {
      paddle2.score++;
      updateScoreDisplay();
      resetBall();
      return;
    }

    // Right paddle miss (left side)
    if (ball.x > canvas.width) {
      paddle1.score++;
      updateScoreDisplay();
      resetBall();
      return;
    }

    // Paddle collisions
    checkPaddleCollision(paddle1, -1); // -1 = ball moves right
    checkPaddleCollision(paddle2, 1); // +1 = ball moves left
  }

  function checkPaddleCollision(paddle, direction) {
    // Check if ball is at paddle x-position
    if (ball.x + BALL_RADIUS >= paddle.x && ball.x - BALL_RADIUS <= paddle.x + PADDLE_WIDTH) {
      // Check y overlap
      if (ball.y >= paddle.y && ball.y <= paddle.y + PADDLE_HEIGHT) {
        // Calculate hit position relative to paddle center
        const hitPos = (ball.y - (paddle.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);

        // Angle based on where it hit (center = 0, edges = +/- 1)
        const angle = hitPos * (Math.PI / 3); // Max 60 degrees

        // Increase speed slightly
        ball.speed = Math.min(ball.speed + 0.5, BALL_SPEED_MAX);

        // Update velocity
        ball.dx = direction * ball.speed * Math.cos(angle);
        ball.dy = ball.speed * Math.sin(angle);

        // Push ball out of paddle to avoid sticking
        if (direction === 1) {
          ball.x = paddle.x + PADDLE_WIDTH + BALL_RADIUS + 1;
        } else {
          ball.x = paddle.x - BALL_RADIUS - 1;
        }
      }
    }
  }

  function updateScoreDisplay() {
    p1ScoreEl.textContent = paddle1.score;
    p2ScoreEl.textContent = paddle2.score;
  }

  function resetBall() {
    resetBall();
  }

  // Drawing
  function draw() {
    // Clear canvas
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw net
    drawNet();

    // Draw paddles
    drawPaddle(paddle1);
    drawPaddle(paddle2);

    // Draw ball
    drawBall();
  }

  function drawNet() {
    const startX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const segmentHeight = 20;
    const numSegments = Math.floor(canvas.height / segmentHeight);

    for (let i = 0; i <= numSegments; i++) {
      const y = centerY - (numSegments * segmentHeight) / 2 + i * segmentHeight;
      ctx.fillRect(startX - 1, y, 2, 4);
    }
  }

  function drawPaddle(paddle) {
    ctx.fillStyle = 'var(--paddle-color)';
    ctx.fillRect(
      paddle.x,
      paddle.y,
      PADDLE_WIDTH,
      PADDLE_HEIGHT
    );

    // Add glow effect
    ctx.shadowColor = 'var(--paddle-color)';
    ctx.shadowBlur = 10;
    ctx.fillRect(
      paddle.x,
      paddle.y,
      PADDLE_WIDTH,
      PADDLE_HEIGHT
    );
    ctx.shadowBlur = 0;
  }

  function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--ball-color)';
    ctx.fill();
    ctx.closePath();
  }

  // Event handlers
  startBtn.addEventListener('click', startGame);
  resetBtn.addEventListener('click', () => {
    stopGame();
    isRunning = false;
    gameMessage.classList.remove('hidden');
    gameMessage.textContent = 'Score reset! Press Start to Play!';
    gameMessage.style.background = '#1a4d1a';
  });

  // Detect touch device
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    touchMode = true;
    gameMessage.classList.remove('hidden');
    gameMessage.textContent = 'Touch the top or bottom half of the screen to control your paddle!';
    instructions.classList.add('hidden');
    document.getElementById('touch-instructions').classList.remove('hidden');
  }

  // Initialize
  window.addEventListener('load', init);
})();
