import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import SpotlightCard from './reactbits/SpotlightCard.jsx'
import CountUp from './reactbits/CountUp.jsx'
import FadeContent from './reactbits/FadeContent.jsx'

/* ---------- constants ---------- */
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const LEVELS = ['A0', 'A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C1+', 'C2']
const DURATIONS = [30, 45, 60, 90]
const COLORS = ['#4E79A7', '#B3623F', '#5F9E6E', '#8B6BB1', '#C2903A', '#3E8F8F', '#B15B7D', '#7A8450']
const STORAGE_KEY = 'tutor-crm-students-v2'

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/* Часовой пояс расписания: по умолчанию — устройства, можно выбрать вручную
   (настройка внизу страницы). nowDate() отдаёт «сейчас» в выбранном поясе. */
let APP_TZ = ''
try { APP_TZ = localStorage.getItem('atc-tz') || '' } catch { /* приватный режим */ }
const deviceTz = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' }
})()
const nowDate = () => {
  if (!APP_TZ) return new Date()
  try { return new Date(new Date().toLocaleString('en-US', { timeZone: APP_TZ })) } catch { return new Date() }
}

/* Пояс, в котором ВЕДЁТСЯ расписание (время уроков хранится в нём).
   По умолчанию Варшава; хранится в данных (_settings) — общий для всех устройств.
   На экране время пересчитывается в местный пояс (устройство или выбранный). */
let SCHED_TZ = 'Europe/Warsaw'
const localTz = () => APP_TZ || deviceTz || 'UTC'
const schedNow = () => {
  try { return new Date(new Date().toLocaleString('en-US', { timeZone: SCHED_TZ })) } catch { return new Date() }
}
const tzParts = (ms, tz) => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms))
  const g = t => Number(p.find(x => x.type === t).value)
  return { y: g('year'), m: g('month'), d: g('day'), hh: g('hour') % 24, mm: g('minute') }
}
const tzOffsetMin = (ms, tz) => {
  const q = tzParts(ms, tz)
  return Math.round((Date.UTC(q.y, q.m - 1, q.d, q.hh, q.mm) - Math.floor(ms / 60000) * 60000) / 60000)
}
/* «дата+время на часах пояса tz» → абсолютный момент (мс) */
const zonedToUtc = (date, time, tz) => {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const base = Date.UTC(y, m - 1, d, hh, mm)
  let ms = base
  for (let i = 0; i < 2; i++) { try { ms = base - tzOffsetMin(ms, tz) * 60000 } catch { return base } }
  return ms
}
const hm = min => { const t = ((min % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') }
/* время урока (в поясе расписания) → местное: {date, time, min, same} */
const toLocal = (date, time) => {
  const same = { date, time, min: toMin(time), same: true }
  if (!SCHED_TZ || SCHED_TZ === localTz()) return same
  try {
    const q = tzParts(zonedToUtc(date, time, SCHED_TZ), localTz())
    const ld = `${q.y}-${String(q.m).padStart(2, '0')}-${String(q.d).padStart(2, '0')}`
    const lt = hm(q.hh * 60 + q.mm)
    return { date: ld, time: lt, min: q.hh * 60 + q.mm, same: ld === date && lt === time }
  } catch { return same }
}
const TZ_CITY = {
  'Europe/Warsaw': 'Варшава', 'Asia/Tbilisi': 'Тбилиси', 'Europe/Kyiv': 'Киев', 'Europe/Kiev': 'Киев',
  'Europe/Berlin': 'Берлин', 'Europe/London': 'Лондон', 'Europe/Istanbul': 'Стамбул', 'Asia/Yerevan': 'Ереван',
}
const tzCity = tz => TZ_CITY[tz] || (tz || '').split('/').pop().replace(/_/g, ' ')

/* Страны с флагами, в чьих поясах показывать время урока (настройка внизу) */
const TZ_FLAGS = [
  ['Europe/Warsaw', '🇵🇱', 'Польша'], ['Europe/Kyiv', '🇺🇦', 'Украина'], ['Asia/Tbilisi', '🇬🇪', 'Грузия'],
  ['Europe/Berlin', '🇩🇪', 'Германия'], ['Europe/London', '🇬🇧', 'Британия'], ['Europe/Istanbul', '🇹🇷', 'Турция'],
  ['Asia/Yerevan', '🇦🇲', 'Армения'], ['Europe/Prague', '🇨🇿', 'Чехия'], ['Europe/Vilnius', '🇱🇹', 'Литва'],
  ['Europe/Madrid', '🇪🇸', 'Испания'], ['Europe/Rome', '🇮🇹', 'Италия'], ['Europe/Paris', '🇫🇷', 'Франция'],
  ['Asia/Jerusalem', '🇮🇱', 'Израиль'], ['Asia/Dubai', '🇦🇪', 'ОАЭ'], ['America/New_York', '🇺🇸', 'США'],
  ['Europe/Lisbon', '🇵🇹', 'Португалия'], ['Europe/Chisinau', '🇲🇩', 'Молдова'],
]
const flagOf = tz => (TZ_FLAGS.find(f => f[0] === tz) || [tz, '🕐', tzCity(tz)])[1]
let SHOW_TZ = ['Europe/Warsaw', 'Europe/Kyiv']
/* время урока в выбранных поясах — только те, что отличаются от местного */
const zoneTimes = (date, start) => {
  const out = []
  const loc = toLocal(date, start)
  let ms
  try { ms = zonedToUtc(date, start, SCHED_TZ) } catch { return out }
  for (const tz of SHOW_TZ) {
    try {
      const q = tzParts(ms, tz)
      const t = hm(q.hh * 60 + q.mm)
      if (t !== loc.time) out.push({ tz, flag: flagOf(tz), time: t })
    } catch { /* неизвестный пояс — пропускаем */ }
  }
  return out
}
const zoneText = (date, start) => zoneTimes(date, start).map(z => `${z.flag} ${z.time}`).join(' · ')

const todayIdx = () => (schedNow().getDay() + 6) % 7 // 0 = Пн, день недели в поясе расписания
const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m }
const fmtMoney = n => (n || 0).toLocaleString('uk-UA') + ' ₴'
const fmtDate = iso => (iso ? new Date(iso + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—')
const endTime = (start, dur) => {
  const m = toMin(start) + dur
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}
const iso = d => {
  const z = new Date(d)
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset())
  return z.toISOString().slice(0, 10)
}
const mondayOf = d => {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c }
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const yearsWord = n => {
  const a = n % 100, b = n % 10
  if (a >= 11 && a <= 14) return 'лет'
  if (b === 1) return 'год'
  if (b >= 2 && b <= 4) return 'года'
  return 'лет'
}
const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
// подпись «возраст · класс» — показываем то, что заполнено
const ageLabel = s => {
  const parts = []
  if (s.age) parts.push(`${s.age} ${yearsWord(Number(s.age))}`)
  if (s.grade) parts.push(`${s.grade} кл.`)
  return parts.join(' · ')
}
const lessonKey = l => l.date + '|' + l.start
/* Актуальная закладка = запись «где остановились» из самого свежего урока */
const currentBookmark = s => {
  const e = (s.log || []).filter(x => x.book)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).pop()
  return e ? e.book : (s.bookmark || '')
}

/* Бухгалтерия: баланс не хранится как «плюс-минус», а всегда пересчитывается
   из записей — база (adjust) + все оплаты − все списания за уроки. Любая
   галочка добавляет/убирает запись, значения сходятся из реального статуса. */
const sumPayments = s => (s.payments || []).reduce((a, p) => a + (p.amount || 0), 0)
/* Запись урока — списание со счёта? (единый критерий для суммы и выписки) */
const isCharge = (e, s) => e.charged !== false && (
  e.paidBy === 'balance' || e.paidBy == null ||
  // ранние записи «оплачен галочкой»: считаются списанием, если по ним
  // была записана авто-оплата (взаимно гасятся — счёт сходится)
  (e.paidBy === 'mark' && (s.payments || []).some(p => p.auto && p.lesson === e.date + '|' + e.start))
)
const chargeAmount = (e, s) => (e.amount != null ? e.amount : (s.rate || 0))
const sumCharges = s => (s.log || []).filter(e => isCharge(e, s))
  .reduce((a, e) => a + chargeAmount(e, s), 0)

/* Выписка по счёту: все движения в хронологии с остатком после каждого */
const statementRows = s => {
  const rows = []
  ;(s.payments || []).forEach(p => {
    const t = p.lesson ? p.lesson.split('|')[1] : '00:00'
    rows.push({
      k: p.date + '|' + t + '|0', date: p.date, delta: p.amount || 0,
      label: p.use ? `Урок со счёта · ${t}` : p.auto ? `Оплата за урок · ${t}` : 'Оплата',
    })
  })
  ;(s.log || []).filter(e => isCharge(e, s)).forEach(e => rows.push({
    k: e.date + '|' + e.start + '|1', date: e.date, delta: -chargeAmount(e, s),
    label: (e.kind === 'cancelled' ? 'Отмена со списанием' : 'Урок проведён') + ` · ${e.start}–${endTime(e.start, e.dur)}`,
  }))
  rows.sort((a, b) => a.k.localeCompare(b.k))
  let run = s.adjust || 0
  return rows.map(r => { run += r.delta; return { ...r, run } })
}
const withLedger = s => {
  const adjust = s.adjust != null ? s.adjust : (s.balance || 0) - sumPayments(s) + sumCharges(s)
  return { ...s, adjust, balance: adjust + sumPayments(s) - sumCharges(s) }
}

/* Неоплаченные из проведённых: при долге не оплачены ровно последние
   ceil(долг/ставка) списанных уроков; без долга — все проведённые оплачены */
function unpaidDoneKeys(s) {
  const rate = s.rate || 0
  let n = rate > 0 ? Math.ceil(Math.max(0, -(s.balance || 0)) / rate) : 0
  const keys = new Set()
  if (n <= 0) return keys
  const entries = (s.log || [])
    .filter(e => e.charged !== false && (e.paidBy === 'balance' || e.paidBy == null))
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
  for (const e of entries) {
    if (n <= 0) break
    keys.add(e.date + '|' + e.start)
    n--
  }
  return keys
}

/* Будущие уроки, покрытые предоплатой на счету: первые floor(баланс/ставка)
   предстоящих занятий (без проведённых/отменённых и оплаченных вручную) */
function autoPaidKeys(s) {
  const rate = s.rate || 0
  // деньги, зачисленные галочкой за ещё не проведённые уроки, зарезервированы
  // за этими уроками — они не покрывают другие занятия
  const reserved = Object.keys(s.marks || {}).filter(k =>
    (s.payments || []).some(p => p.auto && p.lesson === k) &&
    !(s.log || []).some(e => e.date + '|' + e.start === k)
  ).length
  let n = rate > 0 ? Math.floor((s.balance || 0) / rate) - reserved : 0
  const keys = new Set()
  if (n <= 0) return keys
  const logged = new Set((s.log || []).map(e => e.date + '|' + e.start))
  const moves = s.moves || {}
  const occ = []
  for (let d = 0; d < 56; d++) {
    const day = addDays(schedNow(), d)
    const dIso = iso(day)
    const wd = (day.getDay() + 6) % 7
    for (const sl of (s.slots || [])) {
      if (sl.day === wd && !moves[dIso + '|' + sl.start]) occ.push({ date: dIso, start: sl.start })
    }
    for (const ex of (s.extra || [])) if (ex.date === dIso) occ.push({ date: dIso, start: ex.start })
  }
  for (const mv of Object.values(moves)) if (mv.date >= iso(schedNow())) occ.push({ date: mv.date, start: mv.start })
  occ.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  for (const o of occ) {
    if (n <= 0) break
    const key = o.date + '|' + o.start
    if (logged.has(key) || (s.marks || {})[key]) continue
    keys.add(key)
    n--
  }
  return keys
}

/* Статус оплаты — от счёта И от уроков. Долг есть только если
   проведённый урок не оплачен (счёт ушёл в минус); будущие уроки
   долгом не считаются — при нуле без долга ученик «рассчитан». */
function payStatus(s) {
  const b = s.balance || 0
  const rate = s.rate || 0
  if (b < 0) {
    const cnt = rate > 0 ? Math.ceil(-b / rate) : 0
    return { k: 'debt', label: 'Долг ' + fmtMoney(-b) + (cnt ? ` · ${cnt} ур.` : '') }
  }
  if (rate > 0 && b >= rate) return { k: 'paid', label: `Наперёд · ${Math.floor(b / rate)} ур.` }
  const next = nextLessonInfo(s)
  const nextPaid = next && (s.marks || {})[next.date + '|' + next.sl.start]
  if (nextPaid) return { k: 'paid', label: 'Оплачено ✓' }
  if (b > 0) return { k: 'due', label: 'Мало на счету' }
  return { k: 'paid', label: 'Всё оплачено' }
}

/* Ближайший урок ученика (слот + конкретная дата) */
function nextLessonInfo(s) {
  if (!s.slots || !s.slots.length) return null
  const now = schedNow() // сравниваем в поясе расписания
  const nowDay = todayIdx()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  let best = null
  for (const sl of s.slots) {
    let delta = (sl.day - nowDay + 7) % 7
    if (delta === 0 && toMin(sl.start) <= nowMin) delta = 7
    const score = delta * 1440 + toMin(sl.start)
    if (!best || score < best.score) best = { score, sl, delta }
  }
  return { ...best, date: iso(addDays(now, best.delta)) }
}

/* подпись «сегодня/завтра в HH:MM» — по местному времени */
function nextLesson(s) {
  const n = nextLessonInfo(s)
  if (!n) return null
  const loc = toLocal(n.date, n.sl.start)
  const today = iso(nowDate())
  const tomorrow = iso(addDays(nowDate(), 1))
  const when = loc.date === today ? 'сегодня' : loc.date === tomorrow ? 'завтра'
    : DAYS[(new Date(loc.date + 'T00:00').getDay() + 6) % 7]
  const z = zoneText(n.date, n.sl.start)
  return `${when} в ${loc.time}${z ? ` (${z})` : ''}`
}

/* ---------- API (сервер, когда рядом лежит api.php) ---------- */
async function api(action, body) {
  const r = await fetch('api.php?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(j.error || 'api_error')
    e.code = j.error
    e.status = r.status
    throw e
  }
  return j
}

/* ---------- storage (localStorage) ---------- */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      // тестовые ученики из ранних версий удаляются при загрузке
      for (const k of Object.keys(d)) if (d[k] && d[k].demo) delete d[k]
      return d
    }
  } catch { /* повреждённые данные — начинаем с пустого списка */ }
  return {}
}
function persist(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* нет места — работаем в памяти */ }
}

/* ---------- small bits ---------- */
function Pill({ student }) {
  const st = payStatus(student)
  return <span className={'pill ' + st.k}>{st.label}</span>
}

const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

function Ava({ student, size = 30 }) {
  return (
    <span className="ava" aria-hidden="true"
      style={{ background: COLORS[student.colorIdx % COLORS.length], width: size, height: size, fontSize: Math.round(size * 0.37) }}>
      {initials(student.name)}
    </span>
  )
}

/* Логотип: «A» с зелёной отметкой */
const Logo = ({ size = 38 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }} className="logo">
    <rect width="64" height="64" rx="14" fill="#2563EB" />
    <path d="M16 44 28 16 40 44" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 34h14" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    <circle cx="47" cy="47" r="12" fill="#16A34A" />
    <path d="M42 47l4 4 8-8" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* Приписка с флагами: время урока в других поясах, если оно отличается */
function LocalNote({ date, start, bare }) {
  const z = zoneText(date, start)
  if (!z) return null
  return <span className="localnote">{bare ? z : ' · ' + z}</span>
}

/* Иконки нижней навигации (мобильная версия) */
const IcoUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const IcoCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)
const IcoPay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
  </svg>
)
const IcoSun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)
const IcoMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)
const IcoRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)
const IcoOut = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

/* Тип урока: обычный (пусто) или пробный */
function TypeOptions() {
  return (
    <>
      <option value="">Обычный</option>
      <option value="Пробный">Пробный</option>
    </>
  )
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

/* ---------- student form ---------- */
function StudentForm({ initial, onSave, onClose, onDelete }) {
  const [f, setF] = useState(() => initial || {
    name: '', level: 'B1', age: '', grade: '', rate: 500, contact: '', notes: '', bookmark: '', balance: 0,
    slots: [{ day: 0, start: '16:00', dur: 60 }],
    payments: [], colorIdx: 0, paidTick: false,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const setSlot = (i, k, v) => setF(p => ({ ...p, slots: p.slots.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }))

  const submit = e => {
    e.preventDefault()
    if (!f.name.trim()) return
    onSave({ ...f, name: f.name.trim(), rate: Number(f.rate) || 0, balance: Number(f.balance) || 0 })
  }

  return (
    <Modal title={initial ? 'Редактировать ученика' : 'Новый ученик'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="f-name">Имя</label>
          <input id="f-name" value={f.name} onChange={e => set('name', e.target.value)} autoFocus required placeholder="Имя и фамилия" />
        </div>
        <div className="frow">
          <div className="field">
            <label htmlFor="f-level">Уровень (CEFR)</label>
            <select id="f-level" value={f.level} onChange={e => set('level', e.target.value)}>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-age">Возраст</label>
            <input id="f-age" type="number" min="3" max="99" value={f.age || ''} placeholder="—"
              onChange={e => set('age', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-grade">Класс школы</label>
            <select id="f-grade" value={f.grade || ''} onChange={e => set('grade', e.target.value)}>
              <option value="">— (не школьник)</option>
              {GRADES.map(g => <option key={g} value={g}>{g} класс</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-rate">Ставка, ₴ / урок</label>
            <input id="f-rate" type="number" min="0" step="50" value={f.rate} onChange={e => set('rate', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-bal">На счету, ₴</label>
            <input id="f-bal" type="number" step="50" value={f.balance} onChange={e => set('balance', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="f-contact">Контакт</label>
          <input id="f-contact" value={f.contact} onChange={e => set('contact', e.target.value)} placeholder="Телефон, Telegram…" />
        </div>
        <div className="field">
          <label htmlFor="f-bookmark">Где остановились</label>
          <input id="f-bookmark" value={f.bookmark || ''} onChange={e => set('bookmark', e.target.value)} placeholder="Учебник, страница или юнит…" />
        </div>
        <div className="field">
          <label>Расписание</label>
          {f.slots.map((s, i) => (
            <div className="slot-edit" key={i}>
              <select className="day" value={s.day} aria-label="День недели" onChange={e => setSlot(i, 'day', Number(e.target.value))}>
                {DAYS.map((d, j) => <option key={j} value={j}>{d}</option>)}
              </select>
              <input className="time" type="time" value={s.start} aria-label="Время начала" onChange={e => setSlot(i, 'start', e.target.value)} />
              <select className="dur" value={s.dur} aria-label="Длительность" onChange={e => setSlot(i, 'dur', Number(e.target.value))}>
                {DURATIONS.map(d => <option key={d} value={d}>{d} мин</option>)}
              </select>
              <select className="ltype-sel" value={s.type || ''} aria-label="Тип урока" onChange={e => setSlot(i, 'type', e.target.value)}>
                <TypeOptions />
              </select>
              <button type="button" className="btn ghost sm" aria-label="Убрать слот"
                onClick={() => setF(p => ({ ...p, slots: p.slots.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn sm"
            onClick={() => setF(p => ({ ...p, slots: [...p.slots, { day: 0, start: '16:00', dur: 60 }] }))}>
            + слот
          </button>
        </div>
        <div className="field">
          <label htmlFor="f-notes">Заметки (видны только вам)</label>
          <textarea id="f-notes" value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Цели, слабые места…" />
        </div>
        <div className="mfoot">
          {onDelete && <button type="button" className="btn danger left" onClick={onDelete}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">Сохранить</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------- payment form ---------- */
function PaymentForm({ student, onSave, onClose }) {
  const [amount, setAmount] = useState((student.rate || 0) * 4)
  const [date, setDate] = useState(iso(nowDate()))
  const submit = e => {
    e.preventDefault()
    const a = Number(amount) || 0
    if (a <= 0 || !date) return
    onSave({ date, amount: a })
  }
  const lessons = student.rate > 0 ? Math.floor((Number(amount) || 0) / student.rate) : 0
  return (
    <Modal title={'Оплата — ' + student.name} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="frow">
          <div className="field">
            <label htmlFor="p-amount">Сумма, ₴</label>
            <input id="p-amount" type="number" min="50" step="50" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="p-date">Дата оплаты</label>
            <input id="p-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        {lessons > 0 && <p className="hint">≈ {lessons} ур. по ставке {fmtMoney(student.rate)}</p>}
        <div className="mfoot">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">Записать оплату</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------- lesson form (новый урок из сетки недели) ---------- */
function LessonForm({ students, defaultDate, onSave, onClose }) {
  const [f, setF] = useState({
    studentId: students[0]?.id || '',
    date: defaultDate || iso(nowDate()),
    start: '16:00', dur: 60, weekly: true, type: '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const submit = e => {
    e.preventDefault()
    if (!f.studentId || !f.date) return
    onSave(f)
  }
  const dayName = f.date ? DAYS[(new Date(f.date + 'T00:00').getDay() + 6) % 7] : ''
  return (
    <Modal title="Новый урок" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="l-stu">Ученик</label>
          <select id="l-stu" value={f.studentId} onChange={e => set('studentId', e.target.value)} autoFocus>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="frow">
          <div className="field">
            <label htmlFor="l-date">Дата</label>
            <input id="l-date" type="date" value={f.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="l-start">Начало</label>
            <input id="l-start" type="time" value={f.start} onChange={e => set('start', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="l-dur">Длительность</label>
            <select id="l-dur" value={f.dur} onChange={e => set('dur', Number(e.target.value))}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} мин</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="l-type">Тип урока</label>
            <select id="l-type" value={f.type}
              onChange={e => {
                const v = e.target.value
                setF(p => ({ ...p, type: v, weekly: v === 'Пробный' ? false : p.weekly }))
              }}>
              <TypeOptions />
            </select>
          </div>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={f.weekly} onChange={e => set('weekly', e.target.checked)} />
          <span>Повторять каждую неделю{dayName ? ` (${dayName})` : ''}</span>
        </label>
        <p className="hint">
          {f.weekly
            ? 'Урок добавится в еженедельное расписание ученика.'
            : 'Разовый урок — появится только на выбранной дате.'}
        </p>
        <div className="mfoot">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">Добавить урок</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------- students view ---------- */
function StudentsView({ students, onOpen, onAdd }) {
  if (!students.length) return (
    <div className="empty">
      <h3>Пока нет учеников</h3>
      <p>Добавьте первого — с профилем, расписанием и счётом в гривнах.</p>
      <button className="btn primary" onClick={onAdd}>+ Добавить ученика</button>
    </div>
  )
  return (
    <div className="cards">
      {students.map(s => {
        const next = nextLesson(s)
        return (
          <SpotlightCard key={s.id} className="stu-card" spotlightColor="var(--spot)">
            <div role="button" tabIndex={0} style={{ display: 'contents' }}
              onClick={() => onOpen(s.id)}
              onKeyDown={e => { if (e.key === 'Enter') onOpen(s.id) }}>
              <div className="name-row">
                <Ava student={s} />
                <h3>{s.name}</h3>
                <span className="lvl">{s.level}{ageLabel(s) ? ` · ${ageLabel(s)}` : ''}</span>
              </div>
              <div className="meta">
                <span>{next ? 'Следующий урок: ' + next : 'Расписание не задано'}</span>
                {s.bookmark && <span className="bookmark">📖 {s.bookmark}</span>}
                <span>{fmtMoney(s.rate)} / урок · на счету {fmtMoney(s.balance)}</span>
              </div>
              <div className="foot">
                <Pill student={s} />
              </div>
            </div>
          </SpotlightCard>
        )
      })}
    </div>
  )
}

/* ---------- profile view ---------- */
function InviteLink({ join }) {
  const [copied, setCopied] = useState(false)
  const url = location.origin + location.pathname + '#join=' + join
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { prompt('Скопируйте ссылку:', url) }
  }
  return (
    <div className="invite">
      <input readOnly value={url} onFocus={e => e.target.select()} aria-label="Ссылка для ученика" />
      <button className="btn sm" onClick={copy}>{copied ? 'Скопировано ✓' : 'Копировать'}</button>
      <p className="hint">Отправьте ссылку ученику — по ней он создаст свой пароль и увидит домашку, расписание и статус оплаты. В админку по ней попасть нельзя.</p>
    </div>
  )
}

function ProfileView({ student: s, onBack, onEdit, onPay, onRemoveExtra, onRemoveMove, serverMode, onMakeJoin, onToggleHw, onDeleteHw }) {
  const stmt = statementRows(s)
  const lessonsLeft = s.rate > 0 && s.balance > 0 ? Math.floor(s.balance / s.rate) : 0
  return (
    <div className="profile">
      <div className="phead">
        <Ava student={s} size={44} />
        <div>
          <h2>{s.name}</h2>
          <span className="sub">Уровень {s.level}{ageLabel(s) ? ` · ${ageLabel(s)}` : ''} · {fmtMoney(s.rate)} / урок</span>
        </div>
        <div className="actions">
          <button className="btn" onClick={onBack}>← Ко всем</button>
          <button className="btn" onClick={onEdit}>Редактировать</button>
          <button className="btn primary" onClick={onPay}>+ Оплата</button>
        </div>
      </div>
      <div className="pbody">
        <div className="pcol">
          <h4>Расписание</h4>
          {(s.slots || []).length
            ? s.slots.slice().sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start)).map((sl, i) => (
                <div className="slot-line" key={i}>
                  <span className="d">{DAYS[sl.day]}</span>
                  <span>{sl.start}–{endTime(sl.start, sl.dur)}<LocalNote date={iso(schedNow())} start={sl.start} /></span>
                  {sl.type && <span className="lvl">{sl.type}</span>}
                  <span className="t">{sl.dur} мин</span>
                </div>
              ))
            : <p style={{ color: 'var(--muted)', margin: 0 }}>Слоты не заданы — добавьте в редактировании.</p>}
          {Object.keys(s.moves || {}).length > 0 && (
            <>
              <h4>Переносы</h4>
              {Object.entries(s.moves).sort((a, b) => a[1].date.localeCompare(b[1].date)).map(([orig, mv]) => (
                <div className="slot-line" key={orig}>
                  <span className="d" style={{ width: 64 }}>{fmtDate(mv.date)}</span>
                  <span>{mv.start}–{endTime(mv.start, mv.dur || 60)}<LocalNote date={mv.date} start={mv.start} /></span>
                  <span className="t">вместо {fmtDate(orig.split('|')[0])} {orig.split('|')[1]}</span>
                  <button className="btn ghost sm" aria-label="Отменить перенос"
                    onClick={() => onRemoveMove(orig)}>✕</button>
                </div>
              ))}
            </>
          )}
          {(s.extra || []).length > 0 && (
            <>
              <h4>Разовые уроки</h4>
              {s.extra.map((ex, i) => ({ ...ex, i }))
                .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
                .map(ex => (
                  <div className="slot-line" key={ex.i}>
                    <span className="d" style={{ width: 64 }}>{fmtDate(ex.date)}</span>
                    <span>{ex.start}–{endTime(ex.start, ex.dur)}<LocalNote date={ex.date} start={ex.start} /></span>
                    {ex.type && <span className="lvl">{ex.type}</span>}
                    <span className="t">{ex.dur} мин</span>
                    <button className="btn ghost sm" aria-label="Удалить разовый урок"
                      onClick={() => onRemoveExtra(ex.i)}>✕</button>
                  </div>
                ))}
            </>
          )}
          <h4>Домашние задания</h4>
          {(s.homeworks || []).length
            ? s.homeworks.slice().reverse().map(h => (
                <div className="hwrow" key={h.id}>
                  <button className={'tick' + (h.done ? ' on' : '')}
                    title={h.done ? 'Сделано — снять отметку' : 'Отметить: сделано'}
                    aria-label={'ДЗ ' + (h.done ? 'сделано' : 'не сделано')}
                    aria-pressed={!!h.done}
                    onClick={() => onToggleHw(h.id)}>✓</button>
                  <div className="hwbody">
                    <span className="hwdate">{fmtDate(h.date)}{h.done ? ' · сделано' : ''}</span>
                    <p>{h.text}</p>
                  </div>
                  <button className="btn ghost sm" aria-label="Удалить ДЗ" onClick={() => onDeleteHw(h.id)}>✕</button>
                </div>
              ))
            : s.homework
              ? <p className="notes-p" style={{ marginTop: 0 }}>{s.homework}</p>
              : <p style={{ color: 'var(--muted)', margin: 0 }}>Задавайте ДЗ в окне урока в календаре — они появятся здесь со статусом.</p>}
          <h4>Где остановились</h4>
          <p style={{ margin: 0 }}>{s.bookmark || '—'}</p>
          {serverMode && (
            <>
              <h4>Кабинет ученика</h4>
              {s.join
                ? <InviteLink join={s.join} />
                : <button className="btn sm" onClick={onMakeJoin}>Создать ссылку-приглашение</button>}
            </>
          )}
          <h4>Контакты и заметки</h4>
          <dl className="kv">
            <dt>Контакт</dt><dd>{s.contact || '—'}</dd>
          </dl>
          {s.notes ? <p className="notes-p">{s.notes}</p> : null}
        </div>
        <div className="pcol">
          <h4>Оплата</h4>
          <div className="balance-big">
            <b>{fmtMoney(s.balance)}</b>
            <span>{lessonsLeft > 0 ? `≈ ${lessonsLeft} ур. наперёд` : 'на счету'}</span>
          </div>
          <Pill student={s} />
          <h4>Движения по счёту</h4>
          {stmt.length
            ? (
              <div className="stmt">
                <div className="stmt-row stmt-head">
                  <span>Дата</span><span>Операция</span><span>Сумма</span><span>Остаток</span>
                </div>
                {stmt.slice().reverse().map(r => (
                  <div className="stmt-row" key={r.k}>
                    <span className="stmt-date">{fmtDate(r.date)}</span>
                    <span className="stmt-label">{r.label}</span>
                    <span className={'stmt-delta' + (r.delta >= 0 ? ' plus' : ' minus')}>
                      {r.delta >= 0 ? '+' : '−'}{fmtMoney(Math.abs(r.delta))}
                    </span>
                    <span className="stmt-run">{fmtMoney(r.run)}</span>
                  </div>
                ))}
                {s.adjust ? (
                  <div className="stmt-row stmt-base">
                    <span className="stmt-date">—</span>
                    <span className="stmt-label">Начальный остаток (без записей)</span>
                    <span className="stmt-delta">{fmtMoney(s.adjust)}</span>
                    <span className="stmt-run">{fmtMoney(s.adjust)}</span>
                  </div>
                ) : null}
              </div>
            )
            : <p style={{ color: 'var(--muted)', margin: 0 }}>Движений ещё не было — внесите оплату или отметьте урок в календаре.</p>}
          <h4>Журнал уроков</h4>
          {(s.log || []).length
            ? s.log.slice().reverse().map((e, i) => (
                <div className={'logcard' + (e.kind === 'cancelled' ? ' cancel' : '')} key={i}>
                  <div className="logtop">
                    <b>{fmtDate(e.date)}</b>
                    <span>{e.start}–{endTime(e.start, e.dur)} · {e.dur} мин{e.type ? ' · ' + e.type : ''}</span>
                  </div>
                  {e.kind === 'cancelled' && (
                    <p className="loghw">Отменён · {e.charged !== false ? 'со списанием' : 'без списания'}</p>
                  )}
                  {e.book && <p className="loghw">📖 Остановились: {e.book}</p>}
                  {e.hw && <p className="loghw">ДЗ: {e.hw}</p>}
                </div>
              ))
            : <p style={{ color: 'var(--muted)', margin: 0 }}>Отмечайте уроки проведёнными в календаре — история появится здесь.</p>}
        </div>
      </div>
    </div>
  )
}

/* ---------- week view ---------- */
const PX_PER_HOUR = 54
const DAY_START = 7  // календарь всегда показывает 7:00–21:00 целиком
const DAY_END = 21

function layoutLanes(items) {
  const sorted = items.slice().sort((a, b) => a.startMin - b.startMin)
  const laneEnds = []
  sorted.forEach(it => {
    let li = laneEnds.findIndex(end => end <= it.startMin)
    if (li === -1) { li = laneEnds.length; laneEnds.push(0) }
    laneEnds[li] = it.startMin + it.dur
    it.lane = li
  })
  sorted.forEach(it => { it.lanes = laneEnds.length })
  return sorted
}

function WeekView({ students, dates, onLessonClick, onAddLesson, onToggleMark, onToggleDone }) {
  const todayIso = iso(nowDate())
  // на телефоне показываем только диапазон часов, где есть уроки
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  // линия «сейчас» — обновляется раз в минуту, живёт в выбранном часовом поясе
  const [, tickNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tickNow(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])
  const nowM = nowDate().getHours() * 60 + nowDate().getMinutes()

  const autoPaid = useMemo(() => {
    const m = new Map()
    students.forEach(s => m.set(s.id, autoPaidKeys(s)))
    return m
  }, [students])

  const unpaidDone = useMemo(() => {
    const m = new Map()
    students.forEach(s => m.set(s.id, unpaidDoneKeys(s)))
    return m
  }, [students])

  const lessons = useMemo(() => {
    const items = []
    // уроки заданы в поясе расписания; на экране — местное время, поэтому
    // сканируем ±1 день и кладём урок в колонку его МЕСТНОЙ даты
    const visible = new Map(dates.map((d, i) => [iso(d), i]))
    const place = base => {
      const loc = toLocal(base.date, base.start)
      const di = visible.get(loc.date)
      if (di == null) return
      items.push({ ...base, day: di, startMin: loc.min, lstart: loc.time, ldate: loc.date, same: loc.same })
    }
    for (let k = -1; k <= dates.length; k++) {
      const d = addDays(dates[0], k)
      const dIso = iso(d)
      const wd = (d.getDay() + 6) % 7
      students.forEach(s => {
        const moves = s.moves || {}
        ;(s.slots || []).forEach(sl => {
          if (sl.day !== wd || moves[dIso + '|' + sl.start]) return
          place({ ...sl, date: dIso, student: s })
        })
        ;(s.extra || []).forEach(ex => {
          if (ex.date === dIso) place({ ...ex, student: s, once: true })
        })
        Object.entries(moves).forEach(([orig, mv]) => {
          if (mv.date === dIso) place({ date: dIso, start: mv.start, dur: mv.dur || 60, student: s, moved: true, origKey: orig })
        })
      })
    }
    return items.map(l => {
      const key = lessonKey(l)
      const entry = (l.student.log || []).find(e => e.date === l.date && e.start === l.start)
      const paid = !!((l.student.marks || {})[key])
      const done = !!entry && entry.kind !== 'cancelled'
      const cancelled = !!entry && entry.kind === 'cancelled'
      return {
        ...l, key, paid, done, cancelled,
        // проведённый урок оплачен, если он не в числе неоплаченных (долговых)
        covered: done && (entry.paidBy === 'balance' || entry.paidBy == null) && entry.charged !== false
          && !unpaidDone.get(l.student.id).has(key),
        autoPaid: !paid && !done && !cancelled && autoPaid.get(l.student.id).has(key),
      }
    })
  }, [students, dates, autoPaid, unpaidDone])

  // десктоп: фиксированно 7:00–21:00 (расширяется при уроках вне);
  // телефон: только диапазон, где есть уроки — блоки крупнее
  const [minH, maxH] = useMemo(() => {
    if (compact && lessons.length) {
      let lo = 24, hi = 0
      for (const l of lessons) {
        lo = Math.min(lo, Math.floor(l.startMin / 60))
        hi = Math.max(hi, Math.ceil((l.startMin + l.dur) / 60))
      }
      return [Math.max(0, lo), Math.min(24, Math.max(hi, lo + 3))]
    }
    let lo = DAY_START, hi = DAY_END
    for (const l of lessons) {
      lo = Math.min(lo, Math.floor(l.startMin / 60))
      hi = Math.max(hi, Math.ceil((l.startMin + l.dur) / 60))
    }
    return [Math.max(0, lo), Math.min(24, hi)]
  }, [lessons, compact])

  const hours = []
  for (let h = minH; h <= maxH; h++) hours.push(h)
  // на телефоне час выше — в блок урока влезает вся информация,
  // а сам календарь скроллится по вертикали
  const pxh = compact ? 112 : PX_PER_HOUR
  const colH = (maxH - minH) * pxh

  if (!lessons.length) return (
    <div className="empty">
      <h3>{dates.length === 1 ? 'В этот день уроков нет' : 'На этой неделе уроков нет'}</h3>
      <p>Добавьте урок или перелистните стрелками выше.</p>
      {students.length > 0 && <button className="btn primary" onClick={onAddLesson}>+ Урок</button>}
    </div>
  )

  // режим «День»: детальный список — кто, бюджет, где остановились, домашка, отметки
  if (dates.length === 1) {
    const day = lessons.slice().sort((a, b) => a.startMin - b.startMin)
    return (
      <>
        <div className="agenda">
          {day.map(l => {
            const s = l.student
            const lastHw = (s.homeworks || []).slice(-1)[0]
            const book = currentBookmark(s)
            return (
              <div className={'agcard' + (l.done ? ' isdone' : '') + (l.cancelled ? ' iscancel' : '')}
                key={l.key + s.id} role="button" tabIndex={0}
                onClick={() => onLessonClick(l)}
                onKeyDown={e => { if (e.key === 'Enter') onLessonClick(l) }}>
                <div className="agtime">
                  <b>{l.lstart}</b>
                  <span>{hm(l.startMin + l.dur)}</span>
                  <span className="agdur">{l.dur} мин</span>
                </div>
                <div className="agbody">
                  <div className="agname">
                    <Ava student={s} size={28} />
                    <b>{s.name}</b>
                    <span className="lvl">{s.level}{ageLabel(s) ? ` · ${ageLabel(s)}` : ''}</span>
                    {l.type && <span className="lvl">{l.type}</span>}
                    {l.moved && <span className="lvl">перенесён</span>}
                    {l.once && <span className="lvl">разовый</span>}
                    {l.cancelled && <span className="lvl">отменён</span>}
                  </div>
                  <div className="agmoney">
                    <Pill student={s} />
                    <span>на счету {fmtMoney(s.balance)} · {fmtMoney(s.rate)} / урок</span>
                  </div>
                  {zoneText(l.date, l.start) && (
                    <div className="agline"><LocalNote date={l.date} start={l.start} bare /></div>
                  )}
                  <div className="agline">📖 {book ? `Остановились: ${book}` : 'Прогресс ещё не отмечали'}</div>
                  {lastHw && <div className="agline">ДЗ: {lastHw.text}{lastHw.done ? ' · сделано ✓' : ''}</div>}
                </div>
                <div className="agticks" onClick={e => e.stopPropagation()}>
                  <button type="button" className={'agtick blue' + (l.done ? ' on' : '')}
                    onClick={() => onToggleDone(s, l)}>✓ Проведён</button>
                  <button type="button" className={'agtick green' + (l.paid || l.autoPaid || l.covered ? ' on' : '')}
                    disabled={(l.autoPaid || l.covered) && !l.paid}
                    title={l.autoPaid ? 'Покрыт предоплатой со счёта' : ''}
                    onClick={() => onToggleMark(s, l.key)}>✓ Оплачен</button>
                </div>
              </div>
            )
          })}
        </div>
        <p className="weeknote">Нажмите на карточку — окно урока (отмена, домашка, прогресс, перенос). Время местное.</p>
      </>
    )
  }

  return (
    <>
      <div className="week-wrap">
        <div className="week" style={{
          gridTemplateColumns: `48px repeat(${dates.length}, 1fr)`,
          minWidth: dates.length === 1 ? 0 : undefined,
        }}>
          <div className="wh" aria-hidden="true"></div>
          {dates.map((d, i) => (
            <div className={'wh' + (iso(d) === todayIso ? ' today' : '')} key={i}>
              {DAYS[(d.getDay() + 6) % 7]}<span className="dnum">{d.getDate()}</span>
            </div>
          ))}
          <div className="timecol" style={{ height: colH }}>
            {hours.map(h => (
              <span className="hr" key={h} style={{ top: (h - minH) * pxh }}>{h}:00</span>
            ))}
          </div>
          {dates.map((_, di) => {
            const dayItems = layoutLanes(lessons.filter(l => l.day === di))
            return (
              <div className={'daycol' + (iso(dates[di]) === todayIso ? ' today' : '')} key={di} style={{ height: colH }}>
                {hours.slice(1).map(h => (
                  <div className="hline" key={h} style={{ top: (h - minH) * pxh }} />
                ))}
                {iso(dates[di]) === todayIso && nowM >= minH * 60 && nowM <= maxH * 60 && (
                  <div className="nowline" style={{ top: (nowM - minH * 60) / 60 * pxh }} />
                )}
                {dayItems.map(l => (
                  <div className={'lesson' + (l.type === 'Пробный' ? ' trial' : '') + (l.done ? ' isdone' : '') + (l.cancelled ? ' iscancel' : '') + (l.dur < 45 ? ' shortl' : '')} key={l.key + l.student.id}
                    role="button" tabIndex={0}
                    onClick={() => onLessonClick(l)}
                    onKeyDown={e => { if (e.key === 'Enter') onLessonClick(l) }}
                    style={{
                      top: (l.startMin - minH * 60) / 60 * pxh + 1,
                      height: Math.max(l.dur / 60 * pxh - 3, compact ? 52 : 36),
                      left: `calc(${(100 / l.lanes) * l.lane}% + 3px)`,
                      width: `calc(${100 / l.lanes}% - 6px)`,
                      '--stu': COLORS[l.student.colorIdx % COLORS.length],
                    }}>
                    <b>{l.cancelled ? '✕ ' : ''}{l.student.name}</b>
                    <span>{l.lstart}–{hm(l.startMin + l.dur)}<LocalNote date={l.date} start={l.start} />{l.type ? ' · ' + l.type : ''}{l.once ? ' · разовый' : ''}{l.moved ? ' · перенесён' : ''}</span>
                    <span className="lticks">
                      <button
                        className={'ltick blue' + (l.done ? ' on' : '')}
                        title={l.done ? 'Урок проведён — снять (вернёт списание)' : 'Урок проведён (спишет ставку)'}
                        aria-label={'Урок проведён: ' + (l.done ? 'да' : 'нет')}
                        aria-pressed={l.done}
                        onClick={e => { e.stopPropagation(); onToggleDone(l.student, l) }}
                      >✓</button>
                      <button
                        className={'ltick green' + (l.paid || l.autoPaid || l.covered ? ' on' : '')}
                        disabled={(l.autoPaid || l.covered) && !l.paid}
                        title={l.covered
                          ? 'Оплачен предоплатой со счёта (урок проведён)'
                          : l.autoPaid
                            ? 'Оплачено предоплатой с баланса — спишется при проведении'
                            : l.paid
                              ? 'Урок оплачен — снять отметку (вернёт движение по счёту)'
                              : (l.student.balance || 0) >= (l.student.rate || 0) && l.student.rate > 0
                                ? 'Урок оплачен — спишет ставку со счёта'
                                : 'Урок оплачен (+ставка на счёт)'}
                        aria-label={'Урок оплачен: ' + (l.paid || l.autoPaid || l.covered ? 'да' : 'нет')}
                        aria-pressed={l.paid || l.autoPaid || l.covered}
                        onClick={e => { e.stopPropagation(); onToggleMark(l.student, l.key) }}
                      >✓</button>
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <p className="weeknote">
        Синяя галочка — урок проведён (списывает ставку), зелёная — урок оплачен (зачисляет на счёт).
        Клик по уроку — отмена, домашка, прогресс. Время местное — вашего устройства.
      </p>
    </>
  )
}

/* ---------- окно урока в календаре ---------- */
function LessonDialog({ student: s, lesson, onSave, onOpenProfile, onToggleMark, onToggleHw, onMove, onUnmove, onClose }) {
  const [mvDate, setMvDate] = useState(lesson.date)
  const [mvStart, setMvStart] = useState(lesson.start)
  const prevEntry = (s.log || []).find(e => e.date === lesson.date && e.start === lesson.start)
  const initialStatus = prevEntry ? (prevEntry.kind === 'cancelled' ? 'cancelled' : 'done') : 'none'
  // правило 24 часов: отмена меньше чем за сутки — со списанием (можно поменять вручную)
  const under24 = zonedToUtc(lesson.date, lesson.start, SCHED_TZ) - Date.now() < 24 * 3600 * 1000
  const loc = toLocal(lesson.date, lesson.start)
  const [status, setStatus] = useState(initialStatus)
  const [charge, setCharge] = useState(
    prevEntry && prevEntry.kind === 'cancelled' ? prevEntry.charged !== false : under24
  )
  // домашка, заданная именно на этом уроке (если окно открыли повторно)
  const ownHw = (s.homeworks || []).find(h => h.date === lesson.date)
  const [hw, setHw] = useState(ownHw ? ownHw.text : '')
  // прогресс: у каждого урока своя запись — для нового урока поле пустое
  const [bm, setBm] = useState(prevEntry && prevEntry.book != null ? prevEntry.book : '')
  // где остановились в прошлый раз (уроки до этого)
  const lastBook = (s.log || [])
    .filter(e => e.book && (e.date + e.start) < (lesson.date + lesson.start))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).pop()
  // последняя домашка с прошлых уроков — проверить «сделано»
  const prevHw = (s.homeworks || []).filter(h => h.date !== lesson.date).slice(-1)[0]
  const paid = !!((s.marks || {})[lesson.key])

  const submit = e => {
    e.preventDefault()
    onSave({ lesson, status, prevEntry, hw, charge, bm })
  }

  return (
    <Modal title={s.name} onClose={onClose}>
      <p className="hint" style={{ marginTop: -10 }}>
        {DAYS[(new Date(loc.date + 'T00:00').getDay() + 6) % 7]}, {fmtDate(loc.date)} · {loc.time}–{hm(loc.min + lesson.dur)} · {lesson.dur} мин
        {lesson.type ? ' · ' + lesson.type : ''} · местное время
        <LocalNote date={lesson.date} start={lesson.start} />
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label>Статус урока</label>
          <div className="seg" role="radiogroup" aria-label="Статус урока">
            <button type="button" className={status === 'none' ? 'on' : ''} onClick={() => setStatus('none')}>Запланирован</button>
            <button type="button" className={status === 'done' ? 'on' : ''} onClick={() => setStatus('done')}>Проведён ✓</button>
            <button type="button" className={status === 'cancelled' ? 'on' : ''} onClick={() => setStatus('cancelled')}>Отменён ✕</button>
          </div>
        </div>
        {status === 'done' && initialStatus !== 'done' && (
          <p className="hint">
            Со счёта спишется {fmtMoney(s.rate)}.{paid ? ' Урок оплачен — зачисление уже на счету, итог по нулям.' : ''}
          </p>
        )}
        {status === 'cancelled' && (
          <>
            <label className="check-line">
              <input type="checkbox" checked={charge} onChange={e => setCharge(e.target.checked)} />
              <span>Списать оплату за отмену</span>
            </label>
            <p className="hint">
              {under24
                ? 'До урока меньше 24 часов — по правилу оплата списывается. Галочку можно снять вручную.'
                : 'Отмена больше чем за 24 часа — по правилу без списания. При необходимости можно списать.'}
            </p>
          </>
        )}
        {status === 'none' && initialStatus !== 'none' && (
          <p className="hint">Отметка снимется, списание (если было) вернётся на счёт.</p>
        )}
        <button type="button" className={'paybtn' + (paid ? ' on' : '')}
          onClick={() => onToggleMark(s, lesson.key)}>
          {paid
            ? '✓ Урок оплачен'
            : (s.balance || 0) >= (s.rate || 0) && s.rate > 0
              ? `Отметить: урок оплачен (−${fmtMoney(s.rate)} со счёта)`
              : `Отметить: урок оплачен (+${fmtMoney(s.rate)})`}
        </button>
        {lesson.autoPaid && !paid && <p className="hint">Покрыт предоплатой с баланса — спишется при проведении.</p>}
        {prevHw && (
          <div className="prevhw">
            <label className="check-line" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!prevHw.done} onChange={() => onToggleHw(s, prevHw.id)} />
              <span>Прошлое ДЗ сделано</span>
            </label>
            <p className="hint">{fmtDate(prevHw.date)}: {prevHw.text}</p>
          </div>
        )}
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="ld-bm">Где остановились на этом уроке</label>
          <input id="ld-bm" value={bm} onChange={e => setBm(e.target.value)}
            placeholder="Учебник, страница или юнит…" />
          {lastBook && <p className="hint">Прошлый раз ({fmtDate(lastBook.date)}): {lastBook.book}</p>}
        </div>
        <div className="field">
          <label htmlFor="ld-hw">Домашнее задание на следующий урок</label>
          <textarea id="ld-hw" value={hw} onChange={e => setHw(e.target.value)}
            placeholder="Ученик увидит это в своём кабинете" />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Перенос урока (только эта дата, расписание не меняется)</label>
          <div className="slot-edit" style={{ marginBottom: 0 }}>
            <input type="date" value={mvDate} aria-label="Новая дата" onChange={e => setMvDate(e.target.value)} />
            <input className="time" type="time" value={mvStart} aria-label="Новое время" onChange={e => setMvStart(e.target.value)} />
            <button type="button" className="btn sm"
              disabled={mvDate === lesson.date && mvStart === lesson.start}
              onClick={() => onMove(s, lesson, mvDate, mvStart)}>Перенести</button>
            {lesson.moved && (
              <button type="button" className="btn ghost sm" onClick={() => onUnmove(s, lesson)}>Вернуть на место</button>
            )}
          </div>
        </div>
        <div className="mfoot">
          <button type="button" className="btn ghost left" onClick={onOpenProfile}>Профиль ученика →</button>
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">Сохранить</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------- график-столбики (SVG) ---------- */
function BarChart({ data, money }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const compact = v => (money && v >= 1000 ? Math.round(v / 100) / 10 + 'к' : String(v))
  const w = data.length * 48
  return (
    <svg viewBox={`0 0 ${w} 150`} className="chart" role="img" preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const h = Math.max(3, Math.round((d.value / max) * 96))
        return (
          <g key={i} transform={`translate(${i * 48},0)`}>
            <rect className="bar" x="9" y={122 - h} width="30" height={h} rx="6" />
            <text className="cval" x="24" y={114 - h} textAnchor="middle">{d.value ? compact(d.value) : ''}</text>
            <text className="clab" x="24" y="140" textAnchor="middle">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

/* ---------- payments view ---------- */
function PaymentsView({ students, onOpen, onPay }) {
  const waiting = students.filter(s => payStatus(s).k !== 'paid')
  const lessonsWeek = students.reduce((n, s) => n + (s.slots || []).length, 0)
  const thisMonth = nowDate().toISOString().slice(0, 7)
  const monthIncome = students.reduce((sum, s) =>
    sum + (s.payments || []).filter(p => !p.use && p.date && p.date.slice(0, 7) === thisMonth)
      .reduce((a, p) => a + (p.amount || 0), 0), 0)

  const sorted = students.slice().sort((a, b) => (a.balance || 0) - (b.balance || 0))

  // последние 6 месяцев: доход и проведённые уроки
  const months = [...Array(6)].map((_, i) => {
    const d = nowDate()
    d.setDate(1)
    d.setMonth(d.getMonth() - 5 + i)
    return { ym: iso(d).slice(0, 7), label: MONTHS[d.getMonth()] }
  })
  const incomeData = months.map(m => ({
    label: m.label,
    value: students.reduce((sum, s) =>
      sum + (s.payments || []).filter(p => !p.use && p.date && p.date.slice(0, 7) === m.ym)
        .reduce((a, p) => a + (p.amount || 0), 0), 0),
  }))
  const lessonsData = months.map(m => ({
    label: m.label,
    value: students.reduce((n, s) =>
      n + (s.log || []).filter(e => e.kind !== 'cancelled' && e.date && e.date.slice(0, 7) === m.ym).length, 0),
  }))

  return (
    <>
      <div className="stats">
        <div className="stat">
          <span>Учеников</span>
          <b><CountUp to={students.length} duration={0.8} /></b>
        </div>
        <div className="stat">
          <span>Уроков в неделю</span>
          <b><CountUp to={lessonsWeek} duration={0.8} /></b>
        </div>
        <div className={'stat' + (waiting.length ? ' alert' : '')}>
          <span>Ждут оплаты</span>
          <b><CountUp to={waiting.length} duration={0.8} /></b>
        </div>
        <div className="stat money">
          <span>Получено в этом месяце</span>
          <b><CountUp to={monthIncome} duration={1} separator=" " /> ₴</b>
        </div>
      </div>
      <div className="charts">
        <div className="chartcard">
          <h4>Доход по месяцам, ₴</h4>
          <BarChart data={incomeData} money />
        </div>
        <div className="chartcard">
          <h4>Проведено уроков</h4>
          <BarChart data={lessonsData} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="pay">
          <thead>
            <tr>
              <th>Ученик</th><th>Статус</th><th className="num">На счету</th>
              <th className="num">Ставка</th><th>Последняя оплата</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const incoming = (s.payments || []).filter(p => !p.use)
              const last = incoming[incoming.length - 1]
              return (
                <tr key={s.id} className="rowlink" onClick={() => onOpen(s.id)}>
                  <td>
                    <span className="stu-cell">
                      <Ava student={s} size={28} />
                      <span className="stu-name">{s.name}<small>{s.level}{ageLabel(s) ? ` · ${ageLabel(s)}` : ''} · {fmtMoney(s.rate)}/ур.</small></span>
                    </span>
                  </td>
                  <td><Pill student={s} /></td>
                  <td className="num strong">{fmtMoney(s.balance)}</td>
                  <td className="num">{fmtMoney(s.rate)}</td>
                  <td className="mutedcell">{last ? fmtDate(last.date) + ' · ' + fmtMoney(last.amount) : '—'}</td>
                  <td className="num" onClick={e => e.stopPropagation()}>
                    <button className="btn sm" onClick={() => onPay(s.id)}>+ Оплата</button>
                  </td>
                </tr>
              )
            })}
            {!sorted.length && (
              <tr><td colSpan="6" style={{ color: 'var(--muted)', textAlign: 'center', padding: 28 }}>
                Добавьте учеников — статусы оплат появятся здесь.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------- вход по паролю ---------- */
const PASS_KEY = 'tutor-crm-pass'
const AUTH_KEY = 'tutor-crm-auth'

async function hashPass(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // crypto.subtle недоступен (http без localhost) — запасной хэш
    let h = 5381
    for (const c of text) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0
    return 'djb2-' + h.toString(16)
  }
}

function AuthGate({ onAuth }) {
  const [hasPass] = useState(() => { try { return !!localStorage.getItem(PASS_KEY) } catch { return false } })
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')

  const submit = async e => {
    e.preventDefault()
    if (!hasPass) {
      if (p1.length < 4) return setErr('Пароль слишком короткий — минимум 4 символа.')
      if (p1 !== p2) return setErr('Пароли не совпадают.')
      try {
        localStorage.setItem(PASS_KEY, await hashPass(p1))
        localStorage.setItem(AUTH_KEY, '1')
      } catch { /* приватный режим */ }
      onAuth()
    } else {
      let stored = null
      try { stored = localStorage.getItem(PASS_KEY) } catch { /* приватный режим */ }
      if (await hashPass(p1) === stored) {
        try { localStorage.setItem(AUTH_KEY, '1') } catch { /* приватный режим */ }
        onAuth()
      } else setErr('Неверный пароль.')
    }
  }

  const reset = () => {
    if (!confirm('Сбросить пароль? Данные учеников останутся, нужно будет задать новый пароль.')) return
    try { localStorage.removeItem(PASS_KEY) } catch { /* приватный режим */ }
    location.reload()
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <span className="wordmark"><Logo /> A-teacher <em>CRM</em></span>
        <h2>{hasPass ? 'Вход' : 'Установите пароль'}</h2>
        <p className="hint" style={{ margin: 0 }}>
          {hasPass
            ? 'Введите пароль, чтобы открыть кабинет.'
            : 'Пароль будет запрашиваться при каждом входе на этом устройстве.'}
        </p>
        <div className="field">
          <label htmlFor="a-p1">Пароль</label>
          <input id="a-p1" type="password" value={p1} autoFocus autoComplete={hasPass ? 'current-password' : 'new-password'}
            onChange={e => { setP1(e.target.value); setErr('') }} />
        </div>
        {!hasPass && (
          <div className="field">
            <label htmlFor="a-p2">Пароль ещё раз</label>
            <input id="a-p2" type="password" value={p2} autoComplete="new-password"
              onChange={e => { setP2(e.target.value); setErr('') }} />
          </div>
        )}
        {err && <p className="login-err">{err}</p>}
        <button type="submit" className="btn primary" style={{ width: '100%' }}>
          {hasPass ? 'Войти' : 'Сохранить и войти'}
        </button>
        {hasPass && (
          <button type="button" className="btn ghost sm" onClick={reset}>Забыли пароль? Сбросить</button>
        )}
      </form>
    </div>
  )
}

/* ---------- theme toggle ---------- */
function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'system')
  const toggle = () => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && systemDark)
    const next = isDark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('tutor-crm-theme', next) } catch { /* приватный режим */ }
    setTheme(next)
  }
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && systemDark)
  return { isDark, toggle }
}

/* ---------- app ---------- */
function Crm({ mode, token, onLogout, onAuthFail }) {
  const [data, setData] = useState(() => (mode === 'server' ? null : loadData()))
  const [tab, setTab] = useState('students')
  const [openId, setOpenId] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | studentId
  const [payingId, setPayingId] = useState(null)
  const [addingLesson, setAddingLesson] = useState(false)
  const [lessonDlg, setLessonDlg] = useState(null) // { studentId, lesson }
  const [weekStart, setWeekStart] = useState(() => mondayOf(nowDate()))
  const [weekFilter, setWeekFilter] = useState('') // '' = все ученики
  // часовой пояс: смена пересчитывает «сегодня», подсветку и правило 24 ч
  const [tz, setTzState] = useState(APP_TZ)
  // пояс, в котором ведётся расписание — общий, живёт в данных
  const schedTz = (data && data._settings && data._settings.schedTz) || 'Europe/Warsaw'
  SCHED_TZ = schedTz
  const changeSchedTz = v => setData(d => ({ ...d, _settings: { ...((d && d._settings) || {}), schedTz: v } }))
  const showTz = (data && data._settings && data._settings.showTz) || ['Europe/Warsaw', 'Europe/Kyiv']
  SHOW_TZ = showTz
  const toggleShowTz = tz => setData(d => {
    const cur = (d && d._settings && d._settings.showTz) || ['Europe/Warsaw', 'Europe/Kyiv']
    const next = cur.includes(tz) ? cur.filter(x => x !== tz) : [...cur, tz]
    return { ...d, _settings: { ...((d && d._settings) || {}), showTz: next } }
  })
  const tzZones = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return [] }
  }, [])
  const changeTz = v => {
    APP_TZ = v
    try { v ? localStorage.setItem('atc-tz', v) : localStorage.removeItem('atc-tz') } catch { /* приватный режим */ }
    setTzState(v)
    setDayDate(iso(nowDate()))
    setWeekStart(mondayOf(nowDate()))
  }
  // «День» по умолчанию на телефоне — одна широкая колонка с галочками
  const [calScope, setCalScope] = useState(() =>
    (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'day' : 'week'))
  const [dayDate, setDayDate] = useState(() => iso(nowDate()))
  const calDates = calScope === 'day'
    ? [new Date(dayDate + 'T00:00')]
    : DAYS.map((_, i) => addDays(weekStart, i))
  const calShift = n => {
    if (calScope === 'day') setDayDate(iso(addDays(new Date(dayDate + 'T00:00'), n)))
    else setWeekStart(w => addDays(w, 7 * n))
  }
  // «Сегодня» — сразу детальный вид сегодняшнего дня
  const calToday = () => { setDayDate(iso(nowDate())); setWeekStart(mondayOf(nowDate())); setCalScope('day') }
  const calPick = v => {
    if (!v) return
    setDayDate(v)
    setWeekStart(mondayOf(new Date(v + 'T00:00')))
  }
  const { isDark, toggle } = useTheme()

  // серверный режим: загрузка при входе, сохранение с задержкой после изменений
  const skipNextSave = useRef(true)
  const dataRef = useRef(null)
  const dirtyRef = useRef(false)
  useEffect(() => {
    if (mode !== 'server') return
    api('get', { token })
      .then(r => { skipNextSave.current = true; setData(r.data && typeof r.data === 'object' ? r.data : {}) })
      .catch(e => { if (e.status === 401) onAuthFail() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (data === null) return
    dataRef.current = data
    if (mode !== 'server') { persist(data); return }
    if (skipNextSave.current) { skipNextSave.current = false; return }
    // каждое изменение отправляется на сервер сразу
    dirtyRef.current = true
    api('save', { token, data })
      .then(() => { dirtyRef.current = false })
      .catch(e => { if (e.status === 401) onAuthFail() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // авто-обновление: раз в минуту подтягиваем свежие данные (если нет своих правок)
  useEffect(() => {
    if (mode !== 'server') return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || dirtyRef.current) return
      api('get', { token })
        .then(r => { skipNextSave.current = true; setData(r.data && typeof r.data === 'object' ? r.data : {}) })
        .catch(() => {})
    }, 60000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // при сворачивании/закрытии — мгновенно дослать несохранённое;
  // при возврате на вкладку — подтянуть свежие данные с сервера
  useEffect(() => {
    if (mode !== 'server') return
    const flush = () => {
      if (!dirtyRef.current || !dataRef.current) return
      try {
        navigator.sendBeacon('api.php?action=save',
          new Blob([JSON.stringify({ token, data: dataRef.current })], { type: 'application/json' }))
        dirtyRef.current = false
      } catch { /* нет поддержки — сработает обычное сохранение */ }
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') { flush(); return }
      if (dirtyRef.current) return // свои несохранённые правки важнее
      api('get', { token })
        .then(r => { skipNextSave.current = true; setData(r.data && typeof r.data === 'object' ? r.data : {}) })
        .catch(() => {})
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const students = useMemo(() =>
    Object.entries(data || {}).filter(([id]) => !id.startsWith('_')).map(([id, s]) => ({ ...withLedger(s), id }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')),
    [data])

  const byId = id => students.find(s => s.id === id)
  const open = byId(openId)
  const paying = byId(payingId)

  const save = useCallback((id, s) => {
    const { id: _drop, ...body } = s
    setData(d => ({ ...d, [id]: body }))
  }, [])

  const handleFormSave = form => {
    // «На счету» из формы задаёт базу: adjust подбирается так, чтобы
    // пересчёт (база + оплаты − списания) дал ровно введённую сумму
    const applyBase = merged => {
      const withAdjust = { ...merged, adjust: 0 }
      withAdjust.adjust = (Number(form.balance) || 0) - sumPayments(withAdjust) + sumCharges(withAdjust)
      return withLedger(withAdjust)
    }
    if (editing === 'new') {
      const id = uid()
      const used = students.map(s => s.colorIdx % COLORS.length)
      let colorIdx = 0
      while (used.includes(colorIdx) && colorIdx < COLORS.length) colorIdx++
      save(id, applyBase({ ...form, colorIdx: colorIdx % COLORS.length, createdAt: nowDate().toISOString() }))
      setOpenId(id)
    } else {
      save(editing, applyBase({ ...byId(editing), ...form }))
    }
    setEditing(null)
  }

  const handleDelete = () => {
    if (!confirm('Удалить ученика вместе с историей оплат?')) return
    setData(d => { const c = { ...d }; delete c[editing]; return c })
    setEditing(null)
    setOpenId(null)
  }

  // сохранение из окна урока: статус (проведён/отменён, правило 24 ч) + домашка
  const handleLessonDialogSave = ({ lesson, status, prevEntry, hw, charge, bm }) => {
    const s = byId(lessonDlg.studentId)
    if (!s) { setLessonDlg(null); return }
    const next = { ...s }
    const isEntry = e => e.date === lesson.date && e.start === lesson.start

    // старая запись убирается — её списание уйдёт из пересчёта само
    next.log = (s.log || []).filter(e => !isEntry(e))
    if (prevEntry && prevEntry.charged !== false && prevEntry.paidBy === 'tick') next.paidTick = true

    // домашка этого урока — отдельной записью со статусом «сделано/нет»
    const text = (hw || '').trim()
    const hws = (s.homeworks || []).slice()
    const hwIdx = hws.findIndex(h => h.date === lesson.date)
    if (text) {
      if (hwIdx >= 0) hws[hwIdx] = { ...hws[hwIdx], text }
      else hws.push({ id: uid(), date: lesson.date, text, done: false })
    } else if (hwIdx >= 0) hws.splice(hwIdx, 1)
    next.homeworks = hws

    // новая запись: проведён — со списанием (если урок не оплачен со счёта
    // галочкой раньше); отменён — по галочке
    if (status !== 'none') {
      const consumed = (s.payments || []).some(p => p.use && p.lesson === lessonKey(lesson))
      const willCharge = (status === 'done' ? true : !!charge) && !consumed
      next.log = [...next.log, {
        date: lesson.date, start: lesson.start, dur: lesson.dur, type: lesson.type,
        kind: status, charged: willCharge,
        paidBy: willCharge ? 'balance' : undefined,
        amount: willCharge ? (next.rate || 0) : undefined,
        hw: text || undefined,
        book: (bm || '').trim() || undefined,
      }]
    }

    // общая закладка профиля/кабинета = запись из самого свежего урока
    next.bookmark = currentBookmark(next)
    save(s.id, withLedger(next))
    setLessonDlg(null)
  }

  const handleToggleHw = (s, id) =>
    save(s.id, { ...s, homeworks: (s.homeworks || []).map(h => (h.id === id ? { ...h, done: !h.done } : h)) })

  const handleDeleteHw = (s, id) =>
    save(s.id, { ...s, homeworks: (s.homeworks || []).filter(h => h.id !== id) })

  const handlePaySave = p => {
    const s = paying
    save(s.id, withLedger({ ...s, payments: [...(s.payments || []), p] }))
    setPayingId(null)
  }

  const handleLessonAdd = f => {
    const s = byId(f.studentId)
    if (s) {
      const type = f.type || undefined
      if (f.weekly) {
        const day = (new Date(f.date + 'T00:00').getDay() + 6) % 7
        save(s.id, { ...s, slots: [...(s.slots || []), { day, start: f.start, dur: f.dur, type }] })
      } else {
        save(s.id, { ...s, extra: [...(s.extra || []), { date: f.date, start: f.start, dur: f.dur, type }] })
      }
      setWeekStart(mondayOf(new Date(f.date + 'T00:00')))
      setDayDate(f.date)
    }
    setAddingLesson(false)
  }

  // зелёная галочка «урок оплачен»: +ставка на счёт и запись в историю оплат;
  // снятие галочки убирает зачисление (только если оно было сделано этой галочкой)
  const handleToggleMark = (s, key) => {
    const marks = { ...(s.marks || {}) }
    const next = { ...s, marks }
    const rate = s.rate || 0
    if (marks[key]) {
      delete marks[key]
      next.payments = (s.payments || []).filter(p => !((p.auto || p.use) && p.lesson === key))
    } else {
      marks[key] = true
      if (rate > 0 && (s.balance || 0) >= rate) {
        // есть предоплата — урок оплачивается СО СЧЁТА: списание с записью в истории
        next.payments = [...(s.payments || []), { date: key.split('|')[0], amount: -rate, lesson: key, use: true }]
      } else {
        // денег на счету нет — галочка означает свежую оплату за урок
        next.payments = [...(s.payments || []), { date: key.split('|')[0], amount: rate, lesson: key, auto: true }]
      }
    }
    save(s.id, withLedger(next))
  }

  // синяя галочка «урок проведён»: −ставка со счёта; повторное нажатие возвращает
  const handleToggleDone = (s, lesson) => {
    const isEntry = e => e.date === lesson.date && e.start === lesson.start
    const entry = (s.log || []).find(isEntry)
    const next = { ...s }
    if (entry) {
      if (entry.kind === 'cancelled') return // отменённый урок — через окно урока
      next.log = (s.log || []).filter(e => !isEntry(e))
      if (entry.charged !== false && entry.paidBy === 'tick') next.paidTick = true
    } else {
      // урок, уже оплаченный со счёта галочкой, повторно не списывается
      const consumed = (s.payments || []).some(p => p.use && p.lesson === lessonKey(lesson))
      next.log = [...(s.log || []), {
        date: lesson.date, start: lesson.start, dur: lesson.dur, type: lesson.type,
        kind: 'done', charged: !consumed,
        paidBy: consumed ? undefined : 'balance',
        amount: consumed ? undefined : (next.rate || 0),
      }]
    }
    save(s.id, withLedger(next))
  }

  const handleRemoveExtra = (s, i) =>
    save(s.id, { ...s, extra: (s.extra || []).filter((_, j) => j !== i) })

  // перенос: разовый урок правится на месте, у слота появляется move на конкретную дату
  const handleMove = (s, lesson, date, start) => {
    if (!date || !start) return
    const next = { ...s }
    if (lesson.once) {
      next.extra = (s.extra || []).map(e =>
        e.date === lesson.date && e.start === lesson.start ? { ...e, date, start } : e)
    } else {
      const origKey = lesson.moved ? lesson.origKey : lessonKey(lesson)
      next.moves = { ...(s.moves || {}), [origKey]: { date, start, dur: lesson.dur } }
    }
    save(s.id, next)
    setWeekStart(mondayOf(new Date(date + 'T00:00')))
    setDayDate(date)
    setLessonDlg(null)
  }

  const handleUnmove = (s, lesson) => {
    const moves = { ...(s.moves || {}) }
    delete moves[lesson.origKey]
    save(s.id, { ...s, moves })
    setLessonDlg(null)
  }

  const handleRemoveMove = (s, origKey) => {
    const moves = { ...(s.moves || {}) }
    delete moves[origKey]
    save(s.id, { ...s, moves })
  }

  const handleMakeJoin = s => save(s.id, { ...s, join: uid() + uid() })

  const showTab = t => { setTab(t); setOpenId(null) }

  if (data === null) {
    return <div className="app"><p style={{ color: 'var(--muted)' }}>Загрузка…</p></div>
  }

  return (
    <div className="app">
      <header className="top">
        <span className="wordmark"><Logo /> A-teacher <em>CRM</em></span>
        <nav className="tabs" aria-label="Разделы">
          <button className={tab === 'students' ? 'on' : ''} onClick={() => showTab('students')}>Ученики</button>
          <button className={tab === 'week' ? 'on' : ''} onClick={() => showTab('week')}>Неделя</button>
          <button className={tab === 'pay' ? 'on' : ''} onClick={() => showTab('pay')}>Оплаты</button>
        </nav>
        <div className="hdr-actions">
          <button className="theme-btn" onClick={() => location.reload()} title="Обновить данные" aria-label="Обновить страницу и данные">
            <IcoRefresh />
          </button>
          <button className="theme-btn" onClick={toggle} title="Переключить тему" aria-label="Переключить светлую/тёмную тему">
            {isDark ? <IcoSun /> : <IcoMoon />}
          </button>
          <button className="theme-btn" onClick={onLogout} title="Выйти" aria-label="Выйти">
            <IcoOut />
          </button>
        </div>
      </header>

      {tab === 'students' && !open && (
        <FadeContent duration={400} threshold={0}>
          <div className="viewhead">
            <h2>Ученики</h2>
            <span className="sub">{students.length ? students.length + ' чел.' : ''}</span>
            <span className="spacer" />
            <button className="btn primary" onClick={() => setEditing('new')}>+ Ученик</button>
          </div>
          <StudentsView students={students} onOpen={setOpenId} onAdd={() => setEditing('new')} />
        </FadeContent>
      )}

      {tab === 'students' && open && (
        <ProfileView
          student={open}
          onBack={() => setOpenId(null)}
          onEdit={() => setEditing(open.id)}
          onPay={() => setPayingId(open.id)}
          onRemoveExtra={i => handleRemoveExtra(open, i)}
          onRemoveMove={k => handleRemoveMove(open, k)}
          serverMode={mode === 'server'}
          onMakeJoin={() => handleMakeJoin(open)}
          onToggleHw={id => handleToggleHw(open, id)}
          onDeleteHw={id => handleDeleteHw(open, id)}
        />
      )}

      {tab === 'week' && (
        <FadeContent duration={400} threshold={0}>
          <div className="viewhead">
            <h2>Расписание</h2>
            <span className="sub">
              {calScope === 'day'
                ? `${DAYS[(calDates[0].getDay() + 6) % 7]}, ${calDates[0].getDate()} ${MONTHS[calDates[0].getMonth()]} ${calDates[0].getFullYear()}`
                : `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} — ${addDays(weekStart, 6).getDate()} ${MONTHS[addDays(weekStart, 6).getMonth()]} ${addDays(weekStart, 6).getFullYear()}`}
            </span>
            <span className="spacer" />
            <div className="weeknav">
              <div className="seg scopeseg" role="radiogroup" aria-label="Режим календаря">
                <button type="button" className={calScope === 'day' ? 'on' : ''} onClick={() => setCalScope('day')}>День</button>
                <button type="button" className={calScope === 'week' ? 'on' : ''} onClick={() => setCalScope('week')}>Неделя</button>
              </div>
              <button className="btn sm" onClick={() => calShift(-1)} aria-label={calScope === 'day' ? 'Предыдущий день' : 'Предыдущая неделя'}>←</button>
              <button className="btn sm" onClick={calToday}>Сегодня</button>
              <button className="btn sm" onClick={() => calShift(1)} aria-label={calScope === 'day' ? 'Следующий день' : 'Следующая неделя'}>→</button>
              <input type="date" className="weekpick" value={calScope === 'day' ? dayDate : iso(weekStart)}
                onChange={e => calPick(e.target.value)}
                aria-label="Выбрать дату по календарю" />
              <select className="weekpick" value={weekFilter} onChange={e => setWeekFilter(e.target.value)}
                aria-label="Фильтр по ученику">
                <option value="">Все ученики</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {students.length > 0 && <button className="btn primary" onClick={() => setAddingLesson(true)}>+ Урок</button>}
          </div>
          <WeekView students={weekFilter ? students.filter(s => s.id === weekFilter) : students}
            dates={calDates}
            onLessonClick={l => setLessonDlg({ studentId: l.student.id, lesson: l })}
            onAddLesson={() => setAddingLesson(true)}
            onToggleMark={handleToggleMark}
            onToggleDone={handleToggleDone} />
        </FadeContent>
      )}

      {tab === 'pay' && (
        <FadeContent duration={400} threshold={0}>
          <div className="viewhead">
            <h2>Оплаты</h2>
            <span className="sub">в гривнах</span>
          </div>
          <PaymentsView students={students}
            onOpen={id => { setTab('students'); setOpenId(id) }}
            onPay={setPayingId} />
        </FadeContent>
      )}

      {editing && (
        <StudentForm
          initial={editing === 'new' ? null : byId(editing)}
          onSave={handleFormSave}
          onClose={() => setEditing(null)}
          onDelete={editing !== 'new' ? handleDelete : null}
        />
      )}

      {paying && <PaymentForm student={paying} onSave={handlePaySave} onClose={() => setPayingId(null)} />}

      {lessonDlg && byId(lessonDlg.studentId) && (
        <LessonDialog
          student={byId(lessonDlg.studentId)}
          lesson={lessonDlg.lesson}
          onSave={handleLessonDialogSave}
          onToggleMark={handleToggleMark}
          onToggleHw={handleToggleHw}
          onMove={handleMove}
          onUnmove={handleUnmove}
          onOpenProfile={() => { setTab('students'); setOpenId(lessonDlg.studentId); setLessonDlg(null) }}
          onClose={() => setLessonDlg(null)}
        />
      )}

      {addingLesson && (
        <LessonForm students={students}
          defaultDate={iso(weekStart) === iso(mondayOf(nowDate())) ? iso(nowDate()) : iso(weekStart)}
          onSave={handleLessonAdd} onClose={() => setAddingLesson(false)} />
      )}

      <p className="storage-note">
        {mode === 'server'
          ? 'Данные сохраняются на сервере сразу после каждого изменения.'
          : 'Данные хранятся в этом браузере.'}
      </p>
      <p className="storage-note tzline">
        Расписание ведётся по времени:{' '}
        <select value={schedTz} onChange={e => changeSchedTz(e.target.value)} aria-label="Пояс, в котором ведётся расписание">
          {!tzZones.includes(schedTz) && <option value={schedTz}>{schedTz}</option>}
          {tzZones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </p>
      <p className="storage-note tzline">
        Показывать по местному времени:{' '}
        <select value={tz} onChange={e => changeTz(e.target.value)} aria-label="Местный часовой пояс для показа">
          <option value="">Авто — {deviceTz || 'устройство'}</option>
          {tzZones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </p>
      <p className="storage-note tzline chips">
        Показывать время также:{' '}
        {TZ_FLAGS.map(([z, flag, name]) => (
          <button key={z} type="button" className={'chip' + (showTz.includes(z) ? ' on' : '')}
            aria-pressed={showTz.includes(z)} onClick={() => toggleShowTz(z)}>{flag} {name}</button>
        ))}
      </p>

      <nav className="bottombar" aria-label="Разделы">
        <button className={tab === 'students' ? 'on' : ''} onClick={() => showTab('students')}>
          <IcoUsers /><span>Ученики</span>
        </button>
        <button className={tab === 'week' ? 'on' : ''} onClick={() => showTab('week')}>
          <IcoCal /><span>Неделя</span>
        </button>
        <button className={tab === 'pay' ? 'on' : ''} onClick={() => showTab('pay')}>
          <IcoPay /><span>Оплаты</span>
        </button>
      </nav>
    </div>
  )
}

/* ---------- вход учителя (серверный режим) ---------- */
const TOKEN_KEY = 'atc-token'

function ServerAuthGate({ hasTeacher, onAuth }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setErr('')
    if (!hasTeacher) {
      if (p1.length < 4) return setErr('Пароль слишком короткий — минимум 4 символа.')
      if (p1 !== p2) return setErr('Пароли не совпадают.')
    }
    setBusy(true)
    try {
      const r = await api(hasTeacher ? 'login' : 'setup', { pass: p1 })
      try { localStorage.setItem(TOKEN_KEY, r.token) } catch { /* приватный режим */ }
      onAuth(r.token)
    } catch (e2) {
      setErr(e2.code === 'bad_password' ? 'Неверный пароль.' : 'Не получилось войти, попробуйте ещё раз.')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <span className="wordmark"><Logo /> A-teacher <em>CRM</em></span>
        <h2>{hasTeacher ? 'Вход для учителя' : 'Установите пароль учителя'}</h2>
        <p className="hint" style={{ margin: 0 }}>
          {hasTeacher
            ? 'Введите пароль, чтобы открыть кабинет.'
            : 'Пароль хранится на сервере — вход будет работать с любого устройства.'}
        </p>
        <div className="field">
          <label htmlFor="a-p1">Пароль</label>
          <input id="a-p1" type="password" value={p1} autoFocus autoComplete={hasTeacher ? 'current-password' : 'new-password'}
            onChange={e => { setP1(e.target.value); setErr('') }} />
        </div>
        {!hasTeacher && (
          <div className="field">
            <label htmlFor="a-p2">Пароль ещё раз</label>
            <input id="a-p2" type="password" value={p2} autoComplete="new-password"
              onChange={e => { setP2(e.target.value); setErr('') }} />
          </div>
        )}
        {err && <p className="login-err">{err}</p>}
        <button type="submit" className="btn primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? '…' : hasTeacher ? 'Войти' : 'Сохранить и войти'}
        </button>
      </form>
    </div>
  )
}

/* ---------- кабинет ученика ---------- */
function StudentApp({ join }) {
  const tokenKey = 'atc-stu-' + join
  const [token, setToken] = useState(() => { try { return localStorage.getItem(tokenKey) } catch { return null } })
  const [meta, setMeta] = useState(null)
  const [stu, setStu] = useState(null)
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const { isDark, toggle } = useTheme()

  useEffect(() => {
    if (!token) {
      api('student_meta', { join }).then(setMeta).catch(() => setMeta({ error: true }))
      return
    }
    api('student_get', { token })
      .then(r => {
        if (r.student && r.student.schedTz) SCHED_TZ = r.student.schedTz
        if (r.student && Array.isArray(r.student.showTz)) SHOW_TZ = r.student.showTz
        setStu(r.student)
      })
      .catch(() => {
        try { localStorage.removeItem(tokenKey) } catch { /* приватный режим */ }
        setStu(null)
        setToken(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const submit = async e => {
    e.preventDefault()
    setErr('')
    if (!meta.registered) {
      if (p1.length < 4) return setErr('Пароль слишком короткий — минимум 4 символа.')
      if (p1 !== p2) return setErr('Пароли не совпадают.')
    }
    try {
      const r = await api(meta.registered ? 'student_login' : 'student_register', { join, pass: p1 })
      try { localStorage.setItem(tokenKey, r.token) } catch { /* приватный режим */ }
      setToken(r.token)
    } catch (e2) {
      setErr(e2.code === 'bad_password' ? 'Неверный пароль.'
        : e2.code === 'already_registered' ? 'Пароль уже создан — войдите с ним.'
        : 'Не получилось, попробуйте ещё раз.')
    }
  }

  const logout = () => {
    try { localStorage.removeItem(tokenKey) } catch { /* приватный режим */ }
    setStu(null)
    setToken(null)
  }

  if (!token) {
    if (meta === null) return <div className="app"><p style={{ color: 'var(--muted)' }}>Загрузка…</p></div>
    if (meta.error) return (
      <div className="app"><div className="empty" style={{ marginTop: 48 }}>
        <h3>Ссылка недействительна</h3>
        <p>Попросите у преподавателя новую ссылку-приглашение.</p>
      </div></div>
    )
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={submit}>
          <span className="wordmark"><Logo /> A-teacher <em>CRM</em></span>
          <h2>{meta.registered ? 'Вход для ученика' : 'Привет, ' + meta.name + '!'}</h2>
          <p className="hint" style={{ margin: 0 }}>
            {meta.registered
              ? 'Введите свой пароль, чтобы открыть кабинет.'
              : 'Придумайте пароль — по этой же ссылке будете заходить в свой кабинет.'}
          </p>
          <div className="field">
            <label htmlFor="s-p1">Пароль</label>
            <input id="s-p1" type="password" value={p1} autoFocus
              autoComplete={meta.registered ? 'current-password' : 'new-password'}
              onChange={e => { setP1(e.target.value); setErr('') }} />
          </div>
          {!meta.registered && (
            <div className="field">
              <label htmlFor="s-p2">Пароль ещё раз</label>
              <input id="s-p2" type="password" value={p2} autoComplete="new-password"
                onChange={e => { setP2(e.target.value); setErr('') }} />
            </div>
          )}
          {err && <p className="login-err">{err}</p>}
          <button type="submit" className="btn primary" style={{ width: '100%' }}>
            {meta.registered ? 'Войти' : 'Создать и войти'}
          </button>
        </form>
      </div>
    )
  }

  if (!stu) return <div className="app"><p style={{ color: 'var(--muted)' }}>Загрузка…</p></div>

  const slots = (stu.slots || []).slice().sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start))
  const todayStr = iso(nowDate())
  const upcoming = (stu.extra || []).filter(ex => ex.date >= todayStr)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))

  return (
    <div className="app portal">
      <header className="top">
        <span className="wordmark"><Logo /> A-teacher <em>CRM</em></span>
        <span className="spacer" style={{ flex: 1 }} />
        <div className="hdr-actions">
          <button className="theme-btn" onClick={() => location.reload()} title="Обновить данные" aria-label="Обновить страницу и данные">
            <IcoRefresh />
          </button>
          <button className="theme-btn" onClick={toggle} title="Переключить тему" aria-label="Переключить светлую/тёмную тему">
            {isDark ? <IcoSun /> : <IcoMoon />}
          </button>
          <button className="theme-btn" onClick={logout} title="Выйти" aria-label="Выйти">
            <IcoOut />
          </button>
        </div>
      </header>
      <div className="viewhead">
        <h2>{stu.name}</h2>
        <span className="lvl">{stu.level}{ageLabel(stu) ? ` · ${ageLabel(stu)}` : ''}</span>
      </div>
      <div className="pcards">
        <section className="pcard">
          <h4>Домашнее задание</h4>
          {(stu.homeworks || []).length
            ? stu.homeworks.slice().reverse().slice(0, 6).map(h => (
                <div className="hwrow" key={h.id}>
                  <span className={'hwstat' + (h.done ? ' ok' : '')}>{h.done ? '✓' : '•'}</span>
                  <div className="hwbody">
                    <span className="hwdate">{fmtDate(h.date)}{h.done ? ' · сделано' : ' · к следующему уроку'}</span>
                    <p>{h.text}</p>
                  </div>
                </div>
              ))
            : <p className="notes-p">{stu.homework || 'Пока ничего не задано 🎉'}</p>}
          {stu.bookmark && <p className="hint">📖 Остановились: {stu.bookmark}</p>}
        </section>
        <section className="pcard">
          <h4>Расписание</h4>
          {slots.length
            ? slots.map((sl, i) => (
                <div className="slot-line" key={i}>
                  <span className="d">{DAYS[sl.day]}</span>
                  <span>{sl.start}–{endTime(sl.start, sl.dur)}<LocalNote date={iso(schedNow())} start={sl.start} /></span>
                  {sl.type && <span className="lvl">{sl.type}</span>}
                  <span className="t">{sl.dur} мин</span>
                </div>
              ))
            : <p style={{ color: 'var(--muted)', margin: 0 }}>Расписание уточняется.</p>}
          {upcoming.map((ex, i) => (
            <div className="slot-line" key={'x' + i}>
              <span className="d" style={{ width: 64 }}>{fmtDate(ex.date)}</span>
              <span>{ex.start}–{endTime(ex.start, ex.dur)}<LocalNote date={ex.date} start={ex.start} /></span>
              {ex.type && <span className="lvl">{ex.type}</span>}
              <span className="t">{ex.dur} мин</span>
            </div>
          ))}
          {Object.entries(stu.moves || {}).filter(([, mv]) => mv.date >= todayStr)
            .sort((a, b) => a[1].date.localeCompare(b[1].date))
            .map(([k, mv]) => (
              <div className="slot-line" key={'m' + k}>
                <span className="d" style={{ width: 64 }}>{fmtDate(mv.date)}</span>
                <span>{mv.start}–{endTime(mv.start, mv.dur || 60)}<LocalNote date={mv.date} start={mv.start} /></span>
                <span className="lvl">перенос</span>
                <span className="t">вместо {fmtDate(k.split('|')[0])}</span>
              </div>
            ))}
          <p className="hint">Время — по расписанию ({tzCity(SCHED_TZ)}); флаги рядом — то же время в других странах.</p>
        </section>
        <section className="pcard">
          <h4>Оплата</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Pill student={stu} />
            <span style={{ color: 'var(--muted)' }}>на счету {fmtMoney(stu.balance)}</span>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------- корень: сервер/локально, учитель/ученик ---------- */
export default function App() {
  const join = useMemo(() => {
    const m = location.hash.match(/join=([A-Za-z0-9]+)/)
    return m ? m[1] : null
  }, [])
  const [boot, setBoot] = useState(null)
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  })
  const [localAuthed, setLocalAuthed] = useState(() => {
    try { return localStorage.getItem(AUTH_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    api('ping')
      .then(p => setBoot({ server: true, hasTeacher: !!p.hasTeacher }))
      .catch(() => setBoot({ server: false }))
  }, [])

  if (boot === null) return <div className="app"><p style={{ color: 'var(--muted)' }}>Загрузка…</p></div>

  if (join) {
    if (!boot.server) return (
      <div className="app"><div className="empty" style={{ marginTop: 48 }}>
        <h3>Кабинет ученика недоступен</h3>
        <p>Эта копия сайта работает без сервера. Откройте ссылку, которую прислал преподаватель, целиком.</p>
      </div></div>
    )
    return <StudentApp join={join} />
  }

  if (boot.server) {
    const authFail = () => {
      try { localStorage.removeItem(TOKEN_KEY) } catch { /* приватный режим */ }
      setToken(null)
    }
    if (!token) return <ServerAuthGate hasTeacher={boot.hasTeacher} onAuth={setToken} />
    return <Crm mode="server" token={token} onLogout={() => { api('logout', { token }).catch(() => {}); authFail() }} onAuthFail={authFail} />
  }

  // локальный режим (без api.php): всё как раньше, в localStorage
  const logoutLocal = () => {
    try { localStorage.removeItem(AUTH_KEY) } catch { /* приватный режим */ }
    setLocalAuthed(false)
  }
  return localAuthed
    ? <Crm mode="local" onLogout={logoutLocal} />
    : <AuthGate onAuth={() => setLocalAuthed(true)} />
}
