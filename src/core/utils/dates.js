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

/**
 * Meia-noite de HOJE no fuso configurado, em ISO UTC. "Enviadas hoje" era
 * contado a partir de `${dia}T00:00Z` — que no Brasil é 21:00 da véspera:
 * o que saía das 21h à meia-noite contava no limite do dia seguinte.
 */
export function inicioDoDiaIso(reference = new Date(), timeZone = 'America/Sao_Paulo') {
  const [ano, mes, dia] = localDay(reference, timeZone).split('-').map(Number);
  const meiaNoiteUtc = Date.UTC(ano, mes - 1, dia);
  // Diferença do fuso naquele instante (horário de verão incluso).
  const noFuso = new Date(new Date(meiaNoiteUtc).toLocaleString('en-US', { timeZone }));
  const emUtc = new Date(new Date(meiaNoiteUtc).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(meiaNoiteUtc - (noFuso - emUtc)).toISOString();
}

/** Agora está entre "HH:MM" e "HH:MM" no fuso? Janela que vira a meia-noite vale (22:00–02:00). */
export function dentroDoHorario(inicio, fim, reference = new Date(), timeZone = 'America/Sao_Paulo') {
  const agora = hhmmToMinutes(localHHMM(reference, timeZone));
  const de = hhmmToMinutes(inicio || '00:00');
  const ate = hhmmToMinutes(fim || '23:59');
  if (de === null || ate === null || agora === null) return true;
  return de <= ate ? (agora >= de && agora <= ate) : (agora >= de || agora <= ate);
}
