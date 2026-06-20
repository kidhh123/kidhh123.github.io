// Tetris clone — 重構版
// 主要改動：全域狀態收進 class、消除重複的顏色 switch（改查表）、
//          魔術數字抽成常數、keyCode → event.code、修掉 shuffle 的隱式全域。
// 遊戲玩法維持不變。

(() => {
  'use strict';

  // ===== 常數 =====
  const VERSION = '0.4.0';
  const CELL = 25; // 每格像素
  const COLS = 12; // 盤面總寬（含左右邊界各 1）
  const ROWS = 22; // 盤面總高（含底部邊界）
  const PLAY_LEFT = 1; // 可下子區域：x 1..10
  const PLAY_RIGHT = 10;
  const SPAWN = { X: 4, Y: 0 }; // 出生位置

  // 重力：自動下落間隔(ms)。0 = 關閉（手動測試模式）。
  // 想測自動下落就把這個數字調大，例如 500。
  const DROP_SPEED = 0;

  // 方塊定義：每個方塊 4 個旋轉狀態，用 16-bit 表示 4x4（1=實心、0=空）。
  // 例：O 的 0b0000011001100000 = 0000 / 0110 / 0110 / 0000。
  // 順序：T I O S Z L J
  const PIECES = [
    [0b0000111001000000, 0b0100110001000000, 0b0100111000000000, 0b0100011001000000], // T
    [0b0100010001000100, 0b0000111100000000, 0b0010001000100010, 0b0000000011110000], // I
    [0b0000011001100000, 0b0000011001100000, 0b0000011001100000, 0b0000011001100000], // O
    [0b0110110000000000, 0b0100011000100000, 0b0000011011000000, 0b1000110001000000], // S
    [0b1100011000000000, 0b0010011001000000, 0b0000110001100000, 0b0100110010000000], // Z
    [0b0100010001100000, 0b0000111010000000, 0b1100010001000000, 0b0010111000000000], // L
    [0b0100010011000000, 0b1000111000000000, 0b0110010001000000, 0b0000111000100000], // J
  ];

  // 顏色查表：index = 格子值 (type + 1)，[外層深色, 內層淺色]。
  // 取代原本在 4 個繪圖函式裡各複製一份的 switch。
  const COLORS = [
    null, // 0：空
    ['mediumpurple', 'purple'], // 1 T
    ['darkcyan', 'cyan'], // 2 I
    ['goldenrod', 'gold'], // 3 O
    ['green', 'lawngreen'], // 4 S
    ['darkred', 'red'], // 5 Z
    ['darkorange', 'orange'], // 6 L
    ['darkblue', 'blue'], // 7 J
  ];

  const HANDLED_KEYS = [
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Space',
    'KeyZ',
    'KeyX',
    'KeyC',
  ];

  // ===== 純函式工具 =====
  function createMatrix(w, h) {
    const m = [];
    for (let i = 0; i < h; i++) m.push(new Array(w).fill(0));
    return m;
  }

  // 把 16-bit 遮罩展開成 4x4，實心格填入 (type + 1) 當顏色索引
  function makeShape(mask, type) {
    const shape = [];
    for (let y = 0; y < 4; y++) {
      const row = [];
      for (let x = 0; x < 4; x++) {
        const bit = (mask >> (15 - (y * 4 + x))) & 1;
        row.push(bit * (type + 1));
      }
      shape.push(row);
    }
    return shape;
  }

  // Fisher–Yates 洗牌（原地）
  function shuffle(arr) {
    for (let i = 0; i < arr.length; i++) {
      const g = Math.floor(Math.random() * arr.length);
      const t = arr[i];
      arr[i] = arr[g];
      arr[g] = t;
    }
    return arr;
  }

  // 畫一個方塊格（雙層描邊效果）
  function fillPiece(ctx, x, y, outer, inner) {
    ctx.fillStyle = outer;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = inner;
    ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
  }

  // 依格子值查顏色並畫出來（空格不畫）
  function drawCell(ctx, x, y, value) {
    const color = COLORS[value];
    if (color) fillPiece(ctx, x, y, color[0], color[1]);
  }

  // ===== 方塊 =====
  class Piece {
    constructor(pos, type, rotate) {
      this.pos = { X: pos.X, Y: pos.Y }; // 複製，避免共用參考
      this.type = type;
      this.rotate = rotate;
      this.shape = makeShape(PIECES[type][rotate], type);
      this.hPos = null; // hard drop（落點）位置
    }

    rotateP(direction) {
      if (direction === 'clockwise') this.rotate = (this.rotate + 1) % 4;
      else if (direction === 'counterclockwise') this.rotate = (this.rotate + 3) % 4;
      this.shape = makeShape(PIECES[this.type][this.rotate], this.type);
    }
  }

  // ===== 遊戲本體 =====
  class Tetris {
    constructor(canvas, queueCanvas, holdCanvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctxQueue = queueCanvas.getContext('2d');
      this.ctxHold = holdCanvas.getContext('2d');

      this.score = 0;
      this.world = null;
      this.player = null;
      this.hold = null;
      this.pieceQueue = [];
      this.pieceCounter = [0, 0, 0, 0, 0, 0, 0];
      this.dropCounter = 0;
      this.lastTime = 0;

      this.createWorld();
      this.nextPiece();
      this.bindInput();
    }

    start() {
      this.update();
    }

    // --- 盤面 ---
    createWorld() {
      this.world = createMatrix(COLS, ROWS);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (x === 0 || x === COLS - 1 || y === ROWS - 1) this.world[y][x] = -1;
        }
      }
    }

    // --- 碰撞 ---
    willCollide(piece) {
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (piece.shape[y][x] !== 0 && this.world[piece.pos.Y + y][piece.pos.X + x] !== 0) {
            return true;
          }
        }
      }
      return false;
    }

    // --- 消行 ---
    isRowFull(y) {
      if (y < 1 || y > ROWS - 2) return false;
      for (let x = PLAY_LEFT; x <= PLAY_RIGHT; x++) {
        if (this.world[y][x] === 0) return false;
      }
      return true;
    }

    clearRow(y) {
      for (let my = y; my > 1; my--) {
        for (let x = PLAY_LEFT; x <= PLAY_RIGHT; x++) {
          this.world[my][x] = this.world[my - 1][x];
        }
      }
      for (let x = PLAY_LEFT; x <= PLAY_RIGHT; x++) this.world[1][x] = 0;
    }

    // --- 方塊流程 ---
    refillQueue() {
      const bag = shuffle([0, 1, 2, 3, 4, 5, 6]);
      for (const type of bag) {
        this.pieceQueue.push([type, Math.floor(Math.random() * 3)]);
      }
    }

    nextPiece() {
      if (this.pieceQueue.length < 6) this.refillQueue();

      const [type, rotate] = this.pieceQueue.shift();
      this.player = new Piece(SPAWN, type, rotate);
      this.player.hPos = this.harddropPos();

      if (this.willCollide(this.player)) {
        console.log(`game over! score: ${this.score}`);
        // reset
        this.score = 0;
        this.pieceQueue = [];
        this.pieceCounter = [0, 0, 0, 0, 0, 0, 0];
        this.hold = null;
        this.createWorld(); // 先清盤面，再生新方塊（修正原本的順序問題）
        this.nextPiece();
      }
    }

    harddropPos() {
      const ghost = new Piece(this.player.pos, this.player.type, this.player.rotate);
      while (!this.willCollide(ghost)) ghost.pos.Y++;
      ghost.pos.Y--;
      return ghost.pos;
    }

    placePiece() {
      let lines = 0;
      this.player.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            this.world[this.player.pos.Y + y][this.player.pos.X + x] = value;
          }
        });
        if (this.isRowFull(this.player.pos.Y + y)) {
          lines++;
          this.clearRow(this.player.pos.Y + y);
        }
      });

      if (lines > 0) {
        const labels = { 1: 'single!', 2: 'double!', 3: 'triple!', 4: 'tetris!' };
        const gained = lines === 4 ? 6 : lines; // tetris 加成
        this.score += gained;
        console.log(labels[lines] ?? '');
        console.log(`row clear! get score:${gained} total score:${this.score}`);
      }

      this.pieceCounter[this.player.type]++;
    }

    // 自動下落
    slowDrop(time) {
      if (DROP_SPEED === 0) return;
      const delta = time - this.lastTime;
      this.lastTime = time;
      this.dropCounter += delta;
      if (this.dropCounter >= DROP_SPEED) this.dropPiece();
    }

    // 下落一格，碰到底就鎖定並換下一顆
    dropPiece() {
      const test = new Piece(
        { X: this.player.pos.X, Y: this.player.pos.Y + 1 },
        this.player.type,
        this.player.rotate,
      );
      if (!this.willCollide(test)) {
        this.player.pos.Y++;
        this.dropCounter = 0;
      } else {
        this.placePiece();
        this.nextPiece();
      }
    }

    // 踢牆：旋轉受阻時嘗試平移
    wallKick(piece) {
      const xOffsets = [1, -1, 2, -2];
      const yOffsets = [0, 1, 2];
      for (const dy of yOffsets) {
        for (const dx of xOffsets) {
          const test = new Piece(
            { X: piece.pos.X + dx, Y: piece.pos.Y + dy },
            piece.type,
            piece.rotate,
          );
          if (!this.willCollide(test)) return { X: dx, Y: dy };
        }
      }
      return false;
    }

    // 旋轉（含踢牆）的共用流程
    tryRotate(direction) {
      const test = new Piece(this.player.pos, this.player.type, this.player.rotate);
      test.rotateP(direction);

      if (!this.willCollide(test)) {
        this.player.rotateP(direction);
        this.player.hPos = this.harddropPos();
        return;
      }
      const offset = this.wallKick(test);
      if (offset) {
        this.player.rotateP(direction);
        this.player.pos.X += offset.X;
        this.player.pos.Y += offset.Y;
        this.player.hPos = this.harddropPos();
      }
    }

    // 水平移動
    tryMove(dx) {
      const test = new Piece(this.player.pos, this.player.type, this.player.rotate);
      test.pos.X += dx;
      if (!this.willCollide(test)) {
        this.player.pos.X += dx;
        this.player.hPos = this.harddropPos();
      }
    }

    hardDrop() {
      this.player.pos = this.player.hPos;
      this.placePiece();
      this.nextPiece();
    }

    holdPiece() {
      if (this.hold === null) {
        this.hold = new Piece(SPAWN, this.player.type, this.player.rotate);
        this.nextPiece();
      } else {
        const prevType = this.player.type;
        const prevRotate = this.player.rotate;
        this.player = new Piece(this.hold.pos, this.hold.type, this.hold.rotate);
        this.hold = new Piece(SPAWN, prevType, prevRotate);
        this.player.hPos = this.harddropPos();
      }
    }

    // --- 輸入 ---
    bindInput() {
      document.addEventListener('keydown', (event) => {
        if (HANDLED_KEYS.includes(event.code)) event.preventDefault();

        switch (event.code) {
          case 'ArrowLeft':
            this.tryMove(-1);
            break;
          case 'ArrowRight':
            this.tryMove(1);
            break;
          case 'ArrowUp':
          case 'KeyX':
            this.tryRotate('clockwise');
            break;
          case 'KeyZ':
            this.tryRotate('counterclockwise');
            break;
          case 'ArrowDown':
            this.dropPiece();
            break;
          case 'Space':
            this.hardDrop();
            break;
          case 'KeyC':
            this.holdPiece();
            break;
        }
      });
    }

    // --- 主迴圈 ---
    update(time = 0) {
      this.slowDrop(time);

      this.ctx.fillStyle = '#FFF';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.drawWorld();
      this.drawPlayer();
      this.drawQueue();
      this.drawHold();

      requestAnimationFrame((t) => this.update(t));
    }

    // --- 繪圖 ---
    drawPlayer() {
      // 落點預覽（ghost）
      this.player.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = 'white';
            this.ctx.strokeRect(
              CELL * (x + this.player.hPos.X) + 4,
              CELL * (y + this.player.hPos.Y) + 4,
              16,
              16,
            );
          }
        });
      });
      // 方塊本體
      this.player.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          drawCell(this.ctx, this.player.pos.X + x, this.player.pos.Y + y, value);
        });
      });
    }

    drawWorld() {
      this.world.forEach((row, y) => {
        row.forEach((value, x) => {
          if (x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1) {
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          } else if (value !== 0) {
            drawCell(this.ctx, x, y, value);
          } else {
            this.ctx.fillStyle = 'dimgrey';
            this.ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          }
        });
      });
      // 格線
      this.world.forEach((row, y) => {
        row.forEach((value, x) => {
          if (x !== 0 && x !== COLS - 1 && y !== 0 && y !== ROWS - 1) {
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = 'grey';
            this.ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
          }
        });
      });
    }

    drawQueue() {
      for (let i = 0; i < 5; i++) {
        this.ctxQueue.fillStyle = 'black';
        this.ctxQueue.fillRect(0, i * CELL * 6, CELL * 5, CELL * 6);

        const [type, rotate] = this.pieceQueue[i];
        const piece = new Piece({ X: 0, Y: 0 }, type, rotate);
        piece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
            drawCell(this.ctxQueue, x + 1, 1 + y + i * 4, value);
          });
        });
      }
    }

    drawHold() {
      this.ctxHold.fillStyle = 'black';
      this.ctxHold.fillRect(0, 0, CELL * 6, CELL * 6);
      this.ctxHold.strokeStyle = 'darkgrey';
      this.ctxHold.lineWidth = 4;
      this.ctxHold.strokeRect(0, 0, CELL * 6, CELL * 6);

      if (this.hold !== null) {
        this.hold.shape.forEach((row, y) => {
          row.forEach((value, x) => {
            drawCell(this.ctxHold, x + 1, y + 1, value);
          });
        });
      }
    }
  }

  // ===== 啟動 =====
  window.addEventListener('DOMContentLoaded', () => {
    document.title = `Tetris clone v${VERSION}`;
    const game = new Tetris(
      document.getElementById('tetris'),
      document.getElementById('queueCanvas'),
      document.getElementById('holdCanvas'),
    );
    game.start();
  });
})();
