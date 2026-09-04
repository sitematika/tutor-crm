import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import SpotlightCard from './reactbits/SpotlightCard.jsx'
import CountUp from './reactbits/CountUp.jsx'
import FadeContent from './reactbits/FadeContent.jsx'

/* ---------- constants ---------- */
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DURATIONS = [30, 45, 60, 90]
const COLORS = ['#4E79A7', '#B3623F', '#5F9E6E', '#8B6BB1', '#C2903A', '#3E8F8F', '#B15B7D', '#7A8450']
const STORAGE_KEY = 'tutor-crm-students-v2'

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const todayIdx = () => (new Date().getDay() + 6) % 7 // 0 = Пн
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
// возраст; для учеников, заведённых раньше с «классом школы», показываем класс
const ageLabel = s => (s.age ? `${s.age} ${yearsWord(Number(s.age))}` : s.grade ? `${s.grade} кл.` : '')
const lessonKey = l => l.date + '|' + l.start

/* Статус оплаты: ручная галочка > денежный счёт */
function payStatus(s) {
  if (s.paidTick) return { k: 'paid', label: 'Оплачено ✓' }
  const b = s.balance || 0
  const rate = s.rate || 0
  if (b < 0) return { k: 'debt', label: 'Долг ' + fmtMoney(-b) }
  if (rate > 0 && b >= rate) return { k: 'paid', label: `Наперёд · ${Math.floor(b / rate)} ур.` }
  if (b > 0) return { k: 'due', label: 'Мало на счету' }
  return { k: 'due', label: 'Ждёт оплаты' }
}

function nextLesson(s) {
  if (!s.slots || !s.slots.length) return null
  const now = new Date()
  const nowDay = todayIdx()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  let best = null
  for (const sl of s.slots) {
    let delta = (sl.day - nowDay + 7) % 7
    if (delta === 0 && toMin(sl.start) <= nowMin) delta = 7
    const score = delta * 1440 + toMin(sl.start)
    if (!best || score < best.score) best = { score, sl, delta }
  }
  const { sl, delta } = best
  const when = delta === 0 ? 'сегодня' : delta === 1 ? 'завтра' : DAYS[sl.day]
  return `${when} в ${sl.start}`
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

/* Тип урока: обычный (пусто), пробный или уровень CEFR */
function TypeOptions() {
  return (
    <>
      <option value="">Обычный</option>
      <option value="Пробный">Пробный</option>
      {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
    </>
  )
}

function Tick({ student, onToggle }) {
  return (
    <button
      className={'tick' + (student.paidTick ? ' on' : '')}
      title={student.paidTick ? 'Оплата отмечена — снять галочку' : 'Отметить: урок оплачен'}
      aria-label={'Оплата: ' + (student.paidTick ? 'отмечена' : 'не отмечена')}
      aria-pressed={!!student.paidTick}
      onClick={e => { e.stopPropagation(); onToggle(student) }}
    >✓</button>
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
    name: '', level: 'B1', age: '', rate: 500, contact: '', notes: '', bookmark: '', balance: 0,
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
  const submit = e => {
    e.preventDefault()
    const a = Number(amount) || 0
    if (a <= 0) return
    onSave({ date: new Date().toISOString().slice(0, 10), amount: a })
  }
  const lessons = student.rate > 0 ? Math.floor((Number(amount) || 0) / student.rate) : 0
  return (
    <Modal title={'Оплата — ' + student.name} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="p-amount">Сумма, ₴</label>
          <input id="p-amount" type="number" min="50" step="50" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
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
    date: defaultDate || iso(new Date()),
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
function StudentsView({ students, onOpen, onAdd, onTick }) {
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
                <Tick student={s} onToggle={onTick} />
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

function ProfileView({ student: s, onBack, onEdit, onPay, onTick, onRemoveExtra, serverMode, onMakeJoin, onToggleHw, onDeleteHw }) {
  const payments = (s.payments || []).slice().reverse()
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
                  <span>{sl.start}–{endTime(sl.start, sl.dur)}</span>
                  {sl.type && <span className="lvl">{sl.type}</span>}
                  <span className="t">{sl.dur} мин</span>
                </div>
              ))
            : <p style={{ color: 'var(--muted)', margin: 0 }}>Слоты не заданы — добавьте в редактировании.</p>}
          {(s.extra || []).length > 0 && (
            <>
              <h4>Разовые уроки</h4>
              {s.extra.map((ex, i) => ({ ...ex, i }))
                .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
                .map(ex => (
                  <div className="slot-line" key={ex.i}>
                    <span className="d" style={{ width: 64 }}>{fmtDate(ex.date)}</span>
                    <span>{ex.start}–{endTime(ex.start, ex.dur)}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Pill student={s} />
            <Tick student={s} onToggle={onTick} />
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>урок оплачен отдельно</span>
          </div>
          <h4>История оплат</h4>
          {payments.length
            ? payments.map((p, i) => (
                <div className="payrow" key={i}>
                  <span>{fmtDate(p.date)}</span>
                  <span className="amt">{fmtMoney(p.amount)}</span>
                </div>
              ))
            : <p style={{ color: 'var(--muted)', margin: 0 }}>Оплат ещё не было.</p>}
          <h4>Проведённые уроки</h4>
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
const PX_PER_HOUR = 46

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

function WeekView({ students, weekStart, onLessonClick, onAddLesson, onToggleMark }) {
  const dates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart])
  const todayIso = iso(new Date())

  const lessons = useMemo(() => {
    const items = []
    students.forEach(s => {
      ;(s.slots || []).forEach(sl => {
        items.push({ ...sl, date: iso(dates[sl.day]), startMin: toMin(sl.start), student: s })
      })
      ;(s.extra || []).forEach(ex => {
        const di = dates.findIndex(d => iso(d) === ex.date)
        if (di !== -1) items.push({ ...ex, day: di, startMin: toMin(ex.start), student: s, once: true })
      })
    })
    return items.map(l => {
      const key = lessonKey(l)
      const entry = (l.student.log || []).find(e => e.date === l.date && e.start === l.start)
      return {
        ...l, key,
        paid: !!((l.student.marks || {})[key]),
        done: !!entry && entry.kind !== 'cancelled',
        cancelled: !!entry && entry.kind === 'cancelled',
      }
    })
  }, [students, dates])

  const [minH, maxH] = useMemo(() => {
    if (!lessons.length) return [9, 20]
    const lo = Math.min(...lessons.map(l => Math.floor(l.startMin / 60)))
    const hi = Math.max(...lessons.map(l => Math.ceil((l.startMin + l.dur) / 60)))
    return [Math.max(0, lo), Math.min(24, hi)]
  }, [lessons])

  const hours = []
  for (let h = minH; h <= maxH; h++) hours.push(h)
  const colH = (maxH - minH) * PX_PER_HOUR

  if (!lessons.length) return (
    <div className="empty">
      <h3>На этой неделе уроков нет</h3>
      <p>Добавьте урок или перелистните неделю стрелками выше.</p>
      {students.length > 0 && <button className="btn primary" onClick={onAddLesson}>+ Урок</button>}
    </div>
  )

  return (
    <>
      <div className="week-wrap">
        <div className="week">
          <div className="wh" aria-hidden="true"></div>
          {DAYS.map((d, i) => (
            <div className={'wh' + (iso(dates[i]) === todayIso ? ' today' : '')} key={d}>
              {d}<span className="dnum">{dates[i].getDate()}</span>
            </div>
          ))}
          <div className="timecol" style={{ height: colH }}>
            {hours.map(h => (
              <span className="hr" key={h} style={{ top: (h - minH) * PX_PER_HOUR }}>{h}:00</span>
            ))}
          </div>
          {DAYS.map((_, di) => {
            const dayItems = layoutLanes(lessons.filter(l => l.day === di))
            return (
              <div className={'daycol' + (iso(dates[di]) === todayIso ? ' today' : '')} key={di} style={{ height: colH }}>
                {hours.slice(1).map(h => (
                  <div className="hline" key={h} style={{ top: (h - minH) * PX_PER_HOUR }} />
                ))}
                {dayItems.map(l => (
                  <div className={'lesson' + (l.type === 'Пробный' ? ' trial' : '') + (l.done ? ' isdone' : '') + (l.cancelled ? ' iscancel' : '')} key={l.key + l.student.id}
                    role="button" tabIndex={0}
                    onClick={() => onLessonClick(l)}
                    onKeyDown={e => { if (e.key === 'Enter') onLessonClick(l) }}
                    style={{
                      top: (l.startMin - minH * 60) / 60 * PX_PER_HOUR + 1,
                      height: l.dur / 60 * PX_PER_HOUR - 3,
                      left: `calc(${(100 / l.lanes) * l.lane}% + 3px)`,
                      width: `calc(${100 / l.lanes}% - 6px)`,
                      '--stu': COLORS[l.student.colorIdx % COLORS.length],
                    }}>
                    <b>{l.done ? '✓ ' : l.cancelled ? '✕ ' : ''}{l.student.name}</b>
                    <span>{l.start}–{endTime(l.start, l.dur)}{l.type ? ' · ' + l.type : ''}{l.once ? ' · разовый' : ''}</span>
                    <button
                      className={'ltick' + (l.paid ? ' on' : '')}
                      title={l.paid ? 'Урок оплачен — снять отметку' : 'Отметить: урок оплачен'}
                      aria-label={'Оплата урока: ' + (l.paid ? 'отмечена' : 'не отмечена')}
                      aria-pressed={l.paid}
                      onClick={e => { e.stopPropagation(); onToggleMark(l.student, l.key) }}
                    >✓</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <p className="weeknote">Клик по уроку — статус (проведён/отменён) и домашка; галочка в углу — «оплачено». Время показано местное — вашего устройства.</p>
    </>
  )
}

/* ---------- окно урока в календаре ---------- */
function LessonDialog({ student: s, lesson, onSave, onOpenProfile, onToggleMark, onToggleHw, onClose }) {
  const prevEntry = (s.log || []).find(e => e.date === lesson.date && e.start === lesson.start)
  const initialStatus = prevEntry ? (prevEntry.kind === 'cancelled' ? 'cancelled' : 'done') : 'none'
  // правило 24 часов: отмена меньше чем за сутки — со списанием (можно поменять вручную)
  const under24 = new Date(lesson.date + 'T' + lesson.start).getTime() - Date.now() < 24 * 3600 * 1000
  const [status, setStatus] = useState(initialStatus)
  const [charge, setCharge] = useState(
    prevEntry && prevEntry.kind === 'cancelled' ? prevEntry.charged !== false : under24
  )
  // домашка, заданная именно на этом уроке (если окно открыли повторно)
  const ownHw = (s.homeworks || []).find(h => h.date === lesson.date)
  const [hw, setHw] = useState(ownHw ? ownHw.text : '')
  // последняя домашка с прошлых уроков — проверить «сделано»
  const prevHw = (s.homeworks || []).filter(h => h.date !== lesson.date).slice(-1)[0]
  const paid = !!((s.marks || {})[lesson.key])

  const submit = e => {
    e.preventDefault()
    onSave({ lesson, status, prevEntry, hw, charge })
  }

  return (
    <Modal title={s.name} onClose={onClose}>
      <p className="hint" style={{ marginTop: -10 }}>
        {DAYS[lesson.day]}, {fmtDate(lesson.date)} · {lesson.start}–{endTime(lesson.start, lesson.dur)} · {lesson.dur} мин
        {lesson.type ? ' · ' + lesson.type : ''} · местное время
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
            {s.paidTick
              ? 'Стоит галочка «оплачен отдельно» — она снимется, счёт не изменится.'
              : `Со счёта спишется ${fmtMoney(s.rate)}.`}
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
          <label htmlFor="ld-hw">Домашнее задание на следующий урок</label>
          <textarea id="ld-hw" value={hw} onChange={e => setHw(e.target.value)}
            placeholder="Ученик увидит это в своём кабинете" />
        </div>
        <label className="check-line">
          <input type="checkbox" checked={paid} onChange={() => onToggleMark(s, lesson.key)} />
          <span>Этот урок оплачен</span>
        </label>
        <div className="mfoot">
          <button type="button" className="btn ghost left" onClick={onOpenProfile}>Профиль ученика →</button>
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">Сохранить</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------- payments view ---------- */
function PaymentsView({ students, onOpen, onPay, onTick }) {
  const waiting = students.filter(s => payStatus(s).k !== 'paid')
  const lessonsWeek = students.reduce((n, s) => n + (s.slots || []).length, 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthIncome = students.reduce((sum, s) =>
    sum + (s.payments || []).filter(p => p.date && p.date.slice(0, 7) === thisMonth)
      .reduce((a, p) => a + (p.amount || 0), 0), 0)

  const sorted = students.slice().sort((a, b) => (a.balance || 0) - (b.balance || 0))

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
      <div className="table-wrap">
        <table className="pay">
          <thead>
            <tr>
              <th>Ученик</th><th>Оплачен</th><th>Статус</th><th className="num">На счету</th>
              <th className="num">Ставка</th><th>Последняя оплата</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const last = (s.payments || [])[(s.payments || []).length - 1]
              return (
                <tr key={s.id} className="rowlink" onClick={() => onOpen(s.id)}>
                  <td>
                    <span className="stu-cell">
                      <Ava student={s} size={28} />
                      <span className="stu-name">{s.name}<small>{s.level}{ageLabel(s) ? ` · ${ageLabel(s)}` : ''} · {fmtMoney(s.rate)}/ур.</small></span>
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}><Tick student={s} onToggle={onTick} /></td>
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
              <tr><td colSpan="7" style={{ color: 'var(--muted)', textAlign: 'center', padding: 28 }}>
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
        sessionStorage.setItem(AUTH_KEY, '1')
      } catch { /* приватный режим */ }
      onAuth()
    } else {
      let stored = null
      try { stored = localStorage.getItem(PASS_KEY) } catch { /* приватный режим */ }
      if (await hashPass(p1) === stored) {
        try { sessionStorage.setItem(AUTH_KEY, '1') } catch { /* приватный режим */ }
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
        <span className="wordmark">A-teacher <em>CRM</em></span>
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
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const { isDark, toggle } = useTheme()

  // серверный режим: загрузка при входе, сохранение с задержкой после изменений
  const skipNextSave = useRef(true)
  useEffect(() => {
    if (mode !== 'server') return
    api('get', { token })
      .then(r => { skipNextSave.current = true; setData(r.data && typeof r.data === 'object' ? r.data : {}) })
      .catch(e => { if (e.status === 401) onAuthFail() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (data === null) return
    if (mode !== 'server') { persist(data); return }
    if (skipNextSave.current) { skipNextSave.current = false; return }
    const t = setTimeout(() => {
      api('save', { token, data }).catch(e => { if (e.status === 401) onAuthFail() })
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const students = useMemo(() =>
    Object.entries(data || {}).map(([id, s]) => ({ ...s, id }))
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
    if (editing === 'new') {
      const id = uid()
      const used = students.map(s => s.colorIdx % COLORS.length)
      let colorIdx = 0
      while (used.includes(colorIdx) && colorIdx < COLORS.length) colorIdx++
      save(id, { ...form, colorIdx: colorIdx % COLORS.length, createdAt: new Date().toISOString() })
      setOpenId(id)
    } else {
      save(editing, { ...byId(editing), ...form })
    }
    setEditing(null)
  }

  const handleDelete = () => {
    if (!confirm('Удалить ученика вместе с историей оплат?')) return
    setData(d => { const c = { ...d }; delete c[editing]; return c })
    setEditing(null)
    setOpenId(null)
  }

  const handleTick = s => save(s.id, { ...s, paidTick: !s.paidTick })

  // сохранение из окна урока: статус (проведён/отменён, правило 24 ч) + домашка
  const handleLessonDialogSave = ({ lesson, status, prevEntry, hw, charge }) => {
    const s = byId(lessonDlg.studentId)
    if (!s) { setLessonDlg(null); return }
    const next = { ...s }
    const isEntry = e => e.date === lesson.date && e.start === lesson.start

    // старая запись убирается, её списание (если было) возвращается
    next.log = (s.log || []).filter(e => !isEntry(e))
    if (prevEntry && prevEntry.charged !== false) {
      if (prevEntry.paidBy === 'tick') next.paidTick = true
      else next.balance = (next.balance || 0) + (next.rate || 0)
    }

    // домашка этого урока — отдельной записью со статусом «сделано/нет»
    const text = (hw || '').trim()
    const hws = (s.homeworks || []).slice()
    const hwIdx = hws.findIndex(h => h.date === lesson.date)
    if (text) {
      if (hwIdx >= 0) hws[hwIdx] = { ...hws[hwIdx], text }
      else hws.push({ id: uid(), date: lesson.date, text, done: false })
    } else if (hwIdx >= 0) hws.splice(hwIdx, 1)
    next.homeworks = hws

    // новая запись: проведён — всегда со списанием; отменён — по галочке
    if (status !== 'none') {
      const willCharge = status === 'done' ? true : !!charge
      let paidBy
      if (willCharge) {
        paidBy = next.paidTick ? 'tick' : 'balance'
        if (paidBy === 'tick') next.paidTick = false
        else next.balance = (next.balance || 0) - (next.rate || 0)
      }
      next.log = [...next.log, {
        date: lesson.date, start: lesson.start, dur: lesson.dur, type: lesson.type,
        kind: status, charged: willCharge, paidBy, hw: text || undefined,
      }]
    }

    save(s.id, next)
    setLessonDlg(null)
  }

  const handleToggleHw = (s, id) =>
    save(s.id, { ...s, homeworks: (s.homeworks || []).map(h => (h.id === id ? { ...h, done: !h.done } : h)) })

  const handleDeleteHw = (s, id) =>
    save(s.id, { ...s, homeworks: (s.homeworks || []).filter(h => h.id !== id) })

  const handlePaySave = p => {
    const s = paying
    save(s.id, { ...s, balance: (s.balance || 0) + p.amount, payments: [...(s.payments || []), p] })
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
    }
    setAddingLesson(false)
  }

  const handleToggleMark = (s, key) => {
    const marks = { ...(s.marks || {}) }
    if (marks[key]) delete marks[key]
    else marks[key] = true
    save(s.id, { ...s, marks })
  }

  const handleRemoveExtra = (s, i) =>
    save(s.id, { ...s, extra: (s.extra || []).filter((_, j) => j !== i) })

  const handleMakeJoin = s => save(s.id, { ...s, join: uid() + uid() })

  const showTab = t => { setTab(t); setOpenId(null) }

  if (data === null) {
    return <div className="app"><p style={{ color: 'var(--muted)' }}>Загрузка…</p></div>
  }

  return (
    <div className="app">
      <header className="top">
        <span className="wordmark">A-teacher <em>CRM</em></span>
        <nav className="tabs" aria-label="Разделы">
          <button className={tab === 'students' ? 'on' : ''} onClick={() => showTab('students')}>Ученики</button>
          <button className={tab === 'week' ? 'on' : ''} onClick={() => showTab('week')}>Неделя</button>
          <button className={tab === 'pay' ? 'on' : ''} onClick={() => showTab('pay')}>Оплаты</button>
        </nav>
        <button className="theme-btn" onClick={toggle} title="Переключить тему" aria-label="Переключить светлую/тёмную тему">
          {isDark ? '☀️' : '🌙'}
        </button>
        <button className="btn sm" onClick={onLogout}>Выйти</button>
      </header>

      {tab === 'students' && !open && (
        <FadeContent duration={400} threshold={0}>
          <div className="viewhead">
            <h2>Ученики</h2>
            <span className="sub">{students.length ? students.length + ' чел.' : ''}</span>
            <span className="spacer" />
            <button className="btn primary" onClick={() => setEditing('new')}>+ Ученик</button>
          </div>
          <StudentsView students={students} onOpen={setOpenId} onAdd={() => setEditing('new')} onTick={handleTick} />
        </FadeContent>
      )}

      {tab === 'students' && open && (
        <ProfileView
          student={open}
          onBack={() => setOpenId(null)}
          onEdit={() => setEditing(open.id)}
          onPay={() => setPayingId(open.id)}
          onTick={handleTick}
          onRemoveExtra={i => handleRemoveExtra(open, i)}
          serverMode={mode === 'server'}
          onMakeJoin={() => handleMakeJoin(open)}
          onToggleHw={id => handleToggleHw(open, id)}
          onDeleteHw={id => handleDeleteHw(open, id)}
        />
      )}

      {tab === 'week' && (
        <FadeContent duration={400} threshold={0}>
          <div className="viewhead">
            <h2>Расписание недели</h2>
            <span className="sub">
              {weekStart.getDate()} {MONTHS[weekStart.getMonth()]} — {addDays(weekStart, 6).getDate()} {MONTHS[addDays(weekStart, 6).getMonth()]} {addDays(weekStart, 6).getFullYear()}
            </span>
            <span className="spacer" />
            <div className="weeknav">
              <button className="btn sm" onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Предыдущая неделя">←</button>
              <button className="btn sm" onClick={() => setWeekStart(mondayOf(new Date()))}>Сегодня</button>
              <button className="btn sm" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Следующая неделя">→</button>
              <input type="date" className="weekpick" value={iso(weekStart)}
                onChange={e => e.target.value && setWeekStart(mondayOf(new Date(e.target.value + 'T00:00')))}
                aria-label="Выбрать неделю по календарю" />
            </div>
            {students.length > 0 && <button className="btn primary" onClick={() => setAddingLesson(true)}>+ Урок</button>}
          </div>
          <WeekView students={students}
            weekStart={weekStart}
            onLessonClick={l => setLessonDlg({ studentId: l.student.id, lesson: l })}
            onAddLesson={() => setAddingLesson(true)}
            onToggleMark={handleToggleMark} />
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
            onPay={setPayingId}
            onTick={handleTick} />
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
          onOpenProfile={() => { setTab('students'); setOpenId(lessonDlg.studentId); setLessonDlg(null) }}
          onClose={() => setLessonDlg(null)}
        />
      )}

      {addingLesson && (
        <LessonForm students={students}
          defaultDate={iso(weekStart) === iso(mondayOf(new Date())) ? iso(new Date()) : iso(weekStart)}
          onSave={handleLessonAdd} onClose={() => setAddingLesson(false)} />
      )}

      <p className="storage-note">
        {mode === 'server'
          ? 'Данные сохраняются на сервере — доступны с любого устройства.'
          : 'Данные хранятся в этом браузере.'}
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
      try { sessionStorage.setItem(TOKEN_KEY, r.token) } catch { /* приватный режим */ }
      onAuth(r.token)
    } catch (e2) {
      setErr(e2.code === 'bad_password' ? 'Неверный пароль.' : 'Не получилось войти, попробуйте ещё раз.')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <span className="wordmark">A-teacher <em>CRM</em></span>
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
      .then(r => setStu(r.student))
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
          <span className="wordmark">A-teacher <em>CRM</em></span>
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
  const todayStr = iso(new Date())
  const upcoming = (stu.extra || []).filter(ex => ex.date >= todayStr)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))

  return (
    <div className="app portal">
      <header className="top">
        <span className="wordmark">A-teacher <em>CRM</em></span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="theme-btn" onClick={toggle} title="Переключить тему" aria-label="Переключить светлую/тёмную тему">
          {isDark ? '☀️' : '🌙'}
        </button>
        <button className="btn sm" onClick={logout}>Выйти</button>
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
                  <span>{sl.start}–{endTime(sl.start, sl.dur)}</span>
                  {sl.type && <span className="lvl">{sl.type}</span>}
                  <span className="t">{sl.dur} мин</span>
                </div>
              ))
            : <p style={{ color: 'var(--muted)', margin: 0 }}>Расписание уточняется.</p>}
          {upcoming.map((ex, i) => (
            <div className="slot-line" key={'x' + i}>
              <span className="d" style={{ width: 64 }}>{fmtDate(ex.date)}</span>
              <span>{ex.start}–{endTime(ex.start, ex.dur)}</span>
              {ex.type && <span className="lvl">{ex.type}</span>}
              <span className="t">{ex.dur} мин</span>
            </div>
          ))}
          <p className="hint">Время показано местное — вашего устройства.</p>
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
    try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
  })
  const [localAuthed, setLocalAuthed] = useState(() => {
    try { return sessionStorage.getItem(AUTH_KEY) === '1' } catch { return false }
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
      try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* приватный режим */ }
      setToken(null)
    }
    if (!token) return <ServerAuthGate hasTeacher={boot.hasTeacher} onAuth={setToken} />
    return <Crm mode="server" token={token} onLogout={() => { api('logout', { token }).catch(() => {}); authFail() }} onAuthFail={authFail} />
  }

  // локальный режим (без api.php): всё как раньше, в localStorage
  const logoutLocal = () => {
    try { sessionStorage.removeItem(AUTH_KEY) } catch { /* приватный режим */ }
    setLocalAuthed(false)
  }
  return localAuthed
    ? <Crm mode="local" onLogout={logoutLocal} />
    : <AuthGate onAuth={() => setLocalAuthed(true)} />
}
