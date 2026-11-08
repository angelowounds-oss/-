// Errors the game survived (PERF-03): the frame catches what one stage or one NPC/car throws, logs it here and goes on.
// The log is what "오류 복사" puts on the clipboard, so a player can send it.

export const errors = [];   // the most recent 20, oldest first
const MAX = 20;

// log one caught error; the same message from the same place only counts up, so a throw every frame does not push everything else out
export function noteError(stage, e, time = 0) {
  const msg = String((e && e.message) || e);
  const same = errors.find((x) => x.stage === stage && x.msg === msg);
  if (same) { same.n++; same.last = +time.toFixed(1); return false; }
  console.error(`[${stage}]`, e);
  errors.push({ stage, msg, n: 1, first: +time.toFixed(1), last: +time.toFixed(1), stack: String((e && e.stack) || '').split('\n').slice(0, 6).join('\n') });
  if (errors.length > MAX) errors.shift();
  return true;
}

// the report as text: when, which browser, where the player was, and the log
export function errorReport(extra = {}) {
  return JSON.stringify({ at: new Date().toISOString(), page: location.pathname + location.search, ua: navigator.userAgent, ...extra, errors }, null, 1);
}

// put the report on the clipboard; the async clipboard API is refused outside a secure context or without focus, so fall back to a hidden textarea
export async function copyReport(extra) {
  const text = errorReport(extra);
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
  try {
    const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}
