// ISBN 掃描器：畫面與鏡頭。純邏輯在 isbn.js。
import {
  csvFilename,
  isoLocal,
  isValidIsbn13,
  loadList,
  normalize,
  parseInput,
  randomIsbn13,
  saveList,
  toCsv,
} from './isbn.js';
import { Scanner } from './scanner.js';

const COOLDOWN_MS = 2000; // F5：同一條碼 2 秒內不重複觸發

const $ = (id) => document.getElementById(id);
const el = {
  scan: $('btn-scan'),
  torch: $('btn-torch'),
  status: $('status'),
  placeholder: $('placeholder'),
  flash: $('flash'),
  list: $('list'),
  empty: $('empty'),
  count: $('count'),
  copy: $('btn-copy'),
  clear: $('btn-clear'),
  exportBtn: $('btn-export'),
  form: $('manual-form'),
  input: $('manual-input'),
  manualError: $('manual-error'),
  toast: $('toast'),
  toastText: $('toast-text'),
  toastAction: $('toast-action'),
};

let list = loadList();

// ===== 回饋：提示音、震動、畫面閃爍 =====

let audioCtx = null;
/** iOS 要在使用者手勢中建立 / 喚醒 AudioContext，之後才能自動出聲。 */
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function beep(freq, startAt, duration) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = audioCtx.currentTime + startAt;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function feedback(kind) {
  if (kind === 'ok') {
    beep(1320, 0, 0.09);
    navigator.vibrate?.(60);
  } else {
    beep(440, 0, 0.08);
    beep(440, 0.12, 0.08);
    navigator.vibrate?.([40, 60, 40]);
  }
  el.flash.className = 'flash';
  void el.flash.offsetWidth; // 重新觸發動畫
  el.flash.className = `flash ${kind}`;
}

// ===== Toast =====

let toastTimer = 0;
function toast(text, action) {
  el.toastText.textContent = text;
  if (action) {
    el.toastAction.textContent = action.label;
    el.toastAction.onclick = () => {
      hideToast();
      action.run();
    };
    el.toastAction.hidden = false;
  } else {
    el.toastAction.hidden = true;
    el.toastAction.onclick = null;
  }
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 4000 : 1800);
}
function hideToast() {
  el.toast.classList.remove('show');
}

// ===== 清單 =====

function persist() {
  if (!saveList(list)) toast('⚠ 無法寫入本機儲存空間（可能是私密瀏覽模式）');
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function render() {
  el.count.textContent = String(list.length);
  el.empty.hidden = list.length > 0;
  el.copy.disabled = list.length === 0;
  el.clear.disabled = list.length === 0;
  el.exportBtn.disabled = list.length === 0;

  const frag = document.createDocumentFragment();
  for (const item of list) {
    const li = document.createElement('li');
    li.dataset.isbn = item.isbn;

    const info = document.createElement('div');
    info.className = 'info';
    const isbn = document.createElement('div');
    isbn.className = 'isbn';
    isbn.textContent = item.isbn;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const tag = document.createElement('span');
    tag.className = `tag ${item.source}`;
    tag.textContent = item.source === 'manual' ? '手動' : '掃描';
    meta.append(tag, formatTime(item.scanned_at));
    info.append(isbn, meta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.textContent = '✕';
    del.setAttribute('aria-label', `刪除 ${item.isbn}`);
    del.addEventListener('click', () => removeItem(item.isbn));

    li.append(info, del);
    frag.append(li);
  }
  el.list.replaceChildren(frag);
}

function highlight(isbn) {
  const li = el.list.querySelector(`li[data-isbn="${isbn}"]`);
  if (!li) return;
  li.classList.remove('hit');
  void li.offsetWidth;
  li.classList.add('hit');
  li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** 加入清單（F12 以 ISBN 去重）。回傳是否真的加入。 */
function addIsbn(isbn, source) {
  if (list.some((i) => i.isbn === isbn)) {
    feedback('dup');
    toast(`已存在：${isbn}`);
    highlight(isbn);
    return false;
  }
  list.unshift({ isbn, scanned_at: isoLocal(), source });
  persist();
  render();
  feedback('ok');
  toast(`已加入：${isbn}`);
  return true;
}

function removeItem(isbn) {
  const index = list.findIndex((i) => i.isbn === isbn);
  if (index < 0) return;
  const [removed] = list.splice(index, 1);
  persist();
  render();
  toast(`已刪除 ${isbn}`, {
    label: '復原',
    run: () => {
      if (list.some((i) => i.isbn === removed.isbn)) return;
      list.splice(Math.min(index, list.length), 0, removed);
      persist();
      render();
    },
  });
}

// ===== 掃描結果處理（鏡頭與 DEBUG 按鈕共用同一個入口） =====

let last = { code: '', at: 0 };
let lastRejectAt = 0;
let lastAdded = list[0]?.isbn ?? '';

function onDetected(text) {
  const code = normalize(text);
  const now = Date.now();

  // F2：只收 978/979 開頭且檢查碼正確的 13 碼，其餘忽略
  if (!isValidIsbn13(code)) {
    if (now - lastRejectAt > COOLDOWN_MS) {
      lastRejectAt = now;
      setStatus(`略過非書籍條碼 ${code}`);
    }
    return;
  }

  // F5：同一條碼持續對著鏡頭時，只在離開 2 秒以上後才會再觸發
  if (code === last.code && now - last.at < COOLDOWN_MS) {
    last.at = now;
    return;
  }
  last = { code, at: now };

  addIsbn(code, 'scan');
  lastAdded = code;
  setStatus(`最後掃到 <span class="last">${code}</span>`, false, true);
}

function setStatus(text, isError = false, html = false) {
  el.status.classList.toggle('error', isError);
  if (html) el.status.innerHTML = text;
  else el.status.textContent = text;
}

// ===== 鏡頭 =====

const dbgInfo = $('dbg-info');
const scanner = new Scanner($('video'), $('scan-box'), onDetected, (info) => {
  if (!dbgInfo) return;
  dbgInfo.textContent = `${info.decoder}｜影像 ${info.video}｜框內 ${info.crop}｜${info.ms}ms/幀｜第 ${info.frames} 幀`;
});
let scanning = false;
let busy = false;
let torchOn = false;

function showCamera(on) {
  $('video').hidden = !on;
  $('scan-box').hidden = !on;
  el.placeholder.hidden = on;
}

async function startScan() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setStatus('鏡頭需要 HTTPS 才能使用。仍可用下方手動輸入。', true);
    return;
  }
  setStatus('啟動鏡頭中…');
  showCamera(true);
  try {
    await scanner.start();
  } catch (err) {
    showCamera(false);
    throw err;
  }

  scanning = true;
  el.scan.textContent = '停止掃描';
  el.scan.classList.remove('primary');
  setStatus('把條碼放進框內、紅線橫過條碼，距離約 10–20 公分');
  torchOn = false;
  el.torch.hidden = !scanner.torchSupported;
  el.torch.textContent = '🔦 手電筒';
  el.torch.setAttribute('aria-pressed', 'false');
}

async function stopScan() {
  if (!scanning) return;
  scanner.stop();
  scanning = false;
  torchOn = false;
  el.torch.hidden = true;
  showCamera(false);
  el.scan.textContent = '開始掃描';
  el.scan.classList.add('primary');
  setStatus('');
  if (dbgInfo) dbgInfo.textContent = '鏡頭未啟動';
}

async function setTorch(on) {
  if (!scanner.torchSupported) return;
  try {
    await scanner.setTorch(on);
    torchOn = on;
    el.torch.setAttribute('aria-pressed', String(on));
    el.torch.textContent = on ? '🔦 關燈' : '🔦 手電筒';
  } catch {
    toast('手電筒切換失敗');
  }
}

function describeCameraError(err) {
  const name = err?.name ?? '';
  const msg = String(err?.message ?? err ?? '');
  if (name === 'NotAllowedError' || /permission|denied|not allowed/i.test(msg)) {
    return '鏡頭權限被拒絕。請到瀏覽器設定允許此網站使用相機；也可以先用下方手動輸入。';
  }
  if (name === 'NotFoundError' || /not ?found|no camera|requested device/i.test(msg)) {
    return '找不到可用的鏡頭。可以用下方手動輸入。';
  }
  if (name === 'NotReadableError' || /in use|could not start/i.test(msg)) {
    return '鏡頭被其他 App 佔用，關掉後再試一次。';
  }
  return `鏡頭啟動失敗：${msg || name}`;
}

el.scan.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  el.scan.disabled = true;
  unlockAudio();
  try {
    if (scanning) await stopScan();
    else await startScan();
  } catch (err) {
    scanning = false;
    setStatus(describeCameraError(err), true);
  } finally {
    busy = false;
    el.scan.disabled = false;
  }
});

el.torch.addEventListener('click', () => setTorch(!torchOn));

// 切到背景時關鏡頭（iOS 本來就會斷掉，乾脆主動停，回來再按一次）
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scanning) stopScan();
});

// ===== 手動輸入 =====

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  unlockAudio();
  const result = parseInput(el.input.value);
  if (!result.ok) {
    el.manualError.textContent = result.error;
    return;
  }
  el.manualError.textContent = '';
  if (addIsbn(result.isbn, 'manual')) {
    el.input.value = '';
    lastAdded = result.isbn;
  }
});
el.input.addEventListener('input', () => {
  el.manualError.textContent = '';
});

// ===== 匯出 / 複製 / 清空 =====

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

el.exportBtn.addEventListener('click', async () => {
  if (list.length === 0) return;
  const filename = csvFilename();
  const blob = new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' });

  // F18：手機上優先用系統分享；電腦直接下載比較符合預期
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const file = new File([blob], filename, { type: 'text/csv' });
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // 使用者自己取消
    }
  }
  download(blob, filename);
  toast(`已下載 ${filename}`);
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

el.copy.addEventListener('click', async () => {
  const text = [...list]
    .reverse()
    .map((i) => i.isbn)
    .join('\n');
  const ok = await copyText(text);
  toast(ok ? `已複製 ${list.length} 筆 ISBN` : '複製失敗');
});

el.clear.addEventListener('click', () => {
  if (list.length === 0) return;
  // F14：二次確認
  if (!confirm(`確定要清空全部 ${list.length} 筆嗎？\n清空後無法復原，建議先匯出 CSV。`)) return;
  list = [];
  lastAdded = '';
  persist();
  render();
  toast('已清空');
});

// ===== DEBUG：假裝鏡頭掃到東西，走跟真的掃描完全一樣的流程 =====

const params = new URLSearchParams(location.search);
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (isLocal || params.has('debug')) {
  $('debug').hidden = false;
  $('dbg-random').addEventListener('click', () => {
    unlockAudio();
    last = { code: '', at: 0 }; // 讓 DEBUG 不受 2 秒冷卻影響
    onDetected(randomIsbn13());
  });
  $('dbg-repeat').addEventListener('click', () => {
    unlockAudio();
    if (!lastAdded) return toast('清單是空的，先模擬掃一本');
    last = { code: '', at: 0 };
    onDetected(lastAdded);
  });
  $('dbg-nonbook').addEventListener('click', () => {
    lastRejectAt = 0;
    onDetected('4710088412345'); // 471 開頭：台灣一般商品條碼
  });
}

// ===== PWA：離線可開啟（localhost 不註冊，避免開發時吃到舊快取；要測可加 ?sw=1） =====

if ('serviceWorker' in navigator && (!isLocal || params.has('sw'))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
