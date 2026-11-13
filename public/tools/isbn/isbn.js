// ISBN 掃描器：純邏輯（驗證、轉換、清單儲存、CSV），不碰 DOM、不碰鏡頭。

const STORAGE_KEY = 'isbn-scanner:v1';

// ===== ISBN 驗證與轉換 =====

/** 去掉連字號與空白，轉大寫（ISBN-10 的檢查碼可能是 X）。 */
export function normalize(raw) {
  return String(raw).replace(/[\s-]/g, '').toUpperCase();
}

/** 計算 ISBN-13 / EAN-13 的檢查碼（輸入前 12 碼）。 */
function ean13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/** 是否為合法 ISBN-13：13 位數字、978/979 開頭、檢查碼正確。 */
export function isValidIsbn13(code) {
  if (!/^97[89]\d{10}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code[12];
}

/** 是否為合法 ISBN-10：9 位數字 + 數字或 X、加權和可被 11 整除。 */
export function isValidIsbn10(code) {
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = code[i] === 'X' ? 10 : Number(code[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

/** ISBN-10 → ISBN-13（加 978 前綴、重算檢查碼）。 */
export function isbn10to13(code) {
  const first12 = `978${code.slice(0, 9)}`;
  return first12 + ean13CheckDigit(first12);
}

/**
 * 解析手動輸入。
 * @returns {{ ok: true, isbn: string } | { ok: false, error: string }}
 */
export function parseInput(raw) {
  const code = normalize(raw);
  if (!code) return { ok: false, error: '請輸入 ISBN' };
  if (code.length === 13) {
    if (!/^\d{13}$/.test(code)) return { ok: false, error: 'ISBN-13 只能是數字' };
    if (!/^97[89]/.test(code)) return { ok: false, error: 'ISBN-13 必須以 978 或 979 開頭' };
    if (!isValidIsbn13(code)) return { ok: false, error: '檢查碼錯誤，請再核對一次' };
    return { ok: true, isbn: code };
  }
  if (code.length === 10) {
    if (!/^\d{9}[\dX]$/.test(code)) return { ok: false, error: 'ISBN-10 格式錯誤' };
    if (!isValidIsbn10(code)) return { ok: false, error: '檢查碼錯誤，請再核對一次' };
    return { ok: true, isbn: isbn10to13(code) };
  }
  return { ok: false, error: `長度 ${code.length} 碼，ISBN 應為 10 或 13 碼` };
}

/** DEBUG 用：產生一組隨機但合法的 ISBN-13。 */
export function randomIsbn13() {
  let first12 = Math.random() < 0.8 ? '978' : '979';
  // 979 開頭的 979-0 是樂譜 ISMN，避開
  if (first12 === '979') first12 += String(1 + Math.floor(Math.random() * 9));
  while (first12.length < 12) first12 += String(Math.floor(Math.random() * 10));
  return first12 + ean13CheckDigit(first12);
}

// ===== 時間 =====

/** 本地時間的 ISO 8601（含時區位移），例：2026-11-13T18:30:00+08:00 */
export function isoLocal(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

// ===== 清單（localStorage，最新的在最前面） =====

export function loadList() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveList(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ===== 匯出 =====

const CSV_COLUMNS = ['isbn', 'scanned_at', 'source'];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 產生 CSV 文字（UTF-8 BOM + CRLF，Excel 開中文不亂碼）。匯出順序：舊 → 新。 */
export function toCsv(list) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const item of [...list].reverse()) {
    rows.push(CSV_COLUMNS.map((c) => csvCell(item[c])).join(','));
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}

/** 檔名：isbn-2026-11-13.csv */
export function csvFilename(date = new Date()) {
  return `isbn-${isoLocal(date).slice(0, 10)}.csv`;
}
