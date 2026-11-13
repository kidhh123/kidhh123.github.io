// 鏡頭 + 條碼辨識。
// 只辨識畫面上「框框」裡的範圍：用跟畫面相同的換算（object-fit: cover）把框對應回影片原始像素，
// 以原始解析度裁切後再辨識，所以框在哪裡、辨識的就是哪裡。
// 辨識器：有原生 BarcodeDetector（Android Chrome）就用它；沒有（iOS Safari）就載入 ZXing。

export const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

const MAX_CROP_WIDTH = 1000; // 裁切後最多縮到這個寬度再辨識，兼顧細節與速度
const FRAME_INTERVAL_MS = 90; // 約 10 fps

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('條碼辨識元件載入失敗（第一次開啟需要網路）'));
    document.head.append(s);
  });
}

async function createNativeDecoder() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats.includes('ean_13')) return null;
    const detector = new window.BarcodeDetector({ formats: ['ean_13'] });
    return {
      name: 'BarcodeDetector（原生）',
      async decode(canvas) {
        const results = await detector.detect(canvas);
        return results.map((r) => r.rawValue);
      },
    };
  } catch {
    return null;
  }
}

async function createZxingDecoder() {
  if (!window.ZXing) await loadScript(ZXING_URL);
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13]); // 不收 EAN-5 附加碼
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  let frame = 0;
  return {
    name: 'ZXing',
    async decode(canvas) {
      // 兩種二值化輪流用：Hybrid 抗光影不均，GlobalHistogram 對一維條碼常常比較好
      frame++;
      const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const binarizer = frame % 2 ? new Z.HybridBinarizer(source) : new Z.GlobalHistogramBinarizer(source);
      try {
        return [reader.decodeWithState(new Z.BinaryBitmap(binarizer)).getText()];
      } catch {
        return []; // NotFound / Checksum / Format：這一幀沒解到
      } finally {
        reader.reset();
      }
    },
  };
}

export class Scanner {
  /**
   * @param {HTMLVideoElement} video  object-fit: cover 填滿容器
   * @param {HTMLElement} box         畫面上的掃描框（與 video 同一個容器）
   * @param {(code: string) => void} onCode
   * @param {(info: object) => void} [onInfo]  DEBUG 用：辨識器、解析度、每幀耗時
   */
  constructor(video, box, onCode, onInfo) {
    this.video = video;
    this.box = box;
    this.onCode = onCode;
    this.onInfo = onInfo;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.decoder = null;
    this.stream = null;
    this.track = null;
    this.running = false;
    this.timer = 0;
    this.frames = 0;
  }

  get torchSupported() {
    try {
      return !!this.track?.getCapabilities?.().torch;
    } catch {
      return false;
    }
  }

  get caps() {
    try {
      return this.track?.getCapabilities?.() ?? {};
    } catch {
      return {};
    }
  }

  get label() {
    return this.track?.label ?? '';
  }

  get deviceId() {
    return this.track?.getSettings?.().deviceId ?? '';
  }

  /** 後鏡頭清單（要先拿到權限，label 才會有內容）。 */
  async backCameras() {
    const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const back = all.filter((d) => /back|rear|environment|後/i.test(d.label));
    return back.length ? back : all;
  }

  async openStream(deviceId) {
    const video = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: 'environment' } };
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...video, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    this.track = this.stream.getVideoTracks()[0];
  }

  closeStream() {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.track = null;
  }

  /**
   * @param {string} [deviceId] 指定鏡頭；沒指定時用預設後鏡頭，
   *   但 Android 多鏡頭手機常預設到不能近拍對焦的超廣角，所以有主鏡頭（camera2 0）就改用它。
   */
  async start(deviceId) {
    // 先開鏡頭再載辨識器：權限對話框越早跳越好
    try {
      await this.openStream(deviceId);
    } catch (err) {
      if (!deviceId) throw err;
      await this.openStream(); // 記住的鏡頭不見了：退回預設
    }
    if (!deviceId) {
      try {
        const main = (await this.backCameras()).find((d) => /camera2 0\b/.test(d.label));
        if (main && main.deviceId !== this.deviceId) {
          this.closeStream();
          await this.openStream(main.deviceId);
        }
      } catch {
        /* 換不了就用原本的 */
      }
    }
    await this.applyFocus('continuous');

    const v = this.video;
    v.setAttribute('playsinline', '');
    v.muted = true;
    v.srcObject = this.stream;
    await v.play();

    try {
      this.decoder ??= (await createNativeDecoder()) ?? (await createZxingDecoder());
    } catch (err) {
      this.stop();
      throw err;
    }

    this.running = true;
    this.frames = 0;
    this.tick();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.closeStream();
    this.video.srcObject = null;
  }

  async applyFocus(mode) {
    try {
      if (this.caps.focusMode?.includes(mode)) {
        await this.track.applyConstraints({ advanced: [{ focusMode: mode }] });
        return true;
      }
    } catch {
      /* 不支援 */
    }
    return false;
  }

  /** 點畫面對焦：x、y 為 0–1 的相對位置。先單次對焦再切回連續對焦。 */
  async focusAt(x, y) {
    try {
      const c = this.caps;
      if (!c.focusMode?.length) return false;
      // 不支援 pointsOfInterest 的瀏覽器會直接忽略這個欄位
      const adv = { pointsOfInterest: [{ x, y }] };
      if (c.focusMode.includes('single-shot')) adv.focusMode = 'single-shot';
      else if (c.focusMode.includes('continuous')) adv.focusMode = 'continuous';
      await this.track.applyConstraints({ advanced: [adv] });
      if (adv.focusMode === 'single-shot') {
        setTimeout(() => this.applyFocus('continuous'), 1500);
      }
      return true;
    } catch {
      return false;
    }
  }

  get zoomRange() {
    const z = this.caps.zoom;
    return z && z.max > z.min ? z : null;
  }

  async setZoom(value) {
    await this.track?.applyConstraints({ advanced: [{ zoom: value }] });
  }

  async setTorch(on) {
    await this.track?.applyConstraints({ advanced: [{ torch: on }] });
  }

  /** 把畫面上的框換算成影片原始像素座標（object-fit: cover：等比放大後置中裁切）。 */
  cropRect() {
    const v = this.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const vr = v.getBoundingClientRect();
    const br = this.box.getBoundingClientRect();
    const scale = Math.max(vr.width / vw, vr.height / vh);
    const ox = vr.left + (vr.width - vw * scale) / 2;
    const oy = vr.top + (vr.height - vh * scale) / 2;
    const sx = Math.max(0, (br.left - ox) / scale);
    const sy = Math.max(0, (br.top - oy) / scale);
    const sw = Math.min(vw - sx, br.width / scale);
    const sh = Math.min(vh - sy, br.height / scale);
    return { sx, sy, sw, sh, vw, vh };
  }

  async tick() {
    if (!this.running) return;
    const t0 = performance.now();
    let codes = [];
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth > 0) {
      const { sx, sy, sw, sh, vw, vh } = this.cropRect();
      const k = Math.min(1, MAX_CROP_WIDTH / sw);
      const cw = Math.round(sw * k);
      const ch = Math.round(sh * k);
      if (this.canvas.width !== cw) this.canvas.width = cw;
      if (this.canvas.height !== ch) this.canvas.height = ch;
      this.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch);
      try {
        codes = await this.decoder.decode(this.canvas);
      } catch {
        codes = [];
      }
      this.frames++;
      this.onInfo?.({
        decoder: this.decoder.name,
        camera: this.label,
        focus: (this.caps.focusMode ?? []).join('/') || '無',
        zoom: this.track?.getSettings?.().zoom,
        video: `${vw}×${vh}`,
        crop: `${cw}×${ch}`,
        ms: Math.round(performance.now() - t0),
        frames: this.frames,
      });
    }
    if (!this.running) return;
    for (const code of codes) this.onCode(code);
    const spent = performance.now() - t0;
    this.timer = setTimeout(() => this.tick(), Math.max(16, FRAME_INTERVAL_MS - spent));
  }
}
