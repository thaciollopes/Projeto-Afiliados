/** Datas sempre em ISO (UTC) no banco; formatacao pt-BR so na borda. */
export const nowIso = () => new Date().toISOString();

export function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isExpired(endsAt, reference = new Date()) {
  if (!endsAt) return false;
  const d = new Date(endsAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < reference.getTime();
}

export function isNotStarted(startsAt, reference = new Date()) {
  if (!startsAt) return false;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > reference.getTime();
}

export function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60000);
}

export function formatDateTimeBR(iso, timeZone = 'America/Sao_Paulo') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { timeZone });
}

/** "HH:MM" no fuso configurado */
export function localHHMM(date = new Date(), timeZone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

/** 0=domingo ... 6=sabado, no fuso configurado */
export function localWeekday(date = new Date(), timeZone = 'America/Sao_Paulo') {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** "YYYY-MM-DD" no fuso configurado */
export function localDay(date = new Date(), timeZone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** Compara "HH:MM" -> minutos desde meia-noite */
export function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
