'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminSidebar from '../../../admin-sidebar';
import { apiFetch } from '../../../../api-client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type EventInfo = { id: string; name: string; startsAt: string; venue: string; registrationCount: number; checkedInCount: number; formFields: (string | { key: string; label: string })[] };
type Registration = {
  id: string; confirmationCode: string; createdAt: string; checkedInAt: string | null;
  referralSource: string | null; expectations: string | null; interests: string | null;
  perspective: string | null; comments: string | null;
  attendee: { firstName: string; lastName: string; email: string; phone: string; institution: string | null; occupation: string; age: number | null };
  seat: { rowLabel: string; seatLabel: string } | null; customAnswers: Record<string, string>;
};
type Answer = { key: string; label: string; value: string };
const fields: { key: string; label: string; get: (r: Registration) => string }[] = [
  { key: 'phone', label: 'Teléfono', get: r => r.attendee.phone },
  { key: 'occupation', label: 'Ocupación', get: r => r.attendee.occupation },
  { key: 'age', label: 'Edad', get: r => r.attendee.age?.toString() ?? '' },
  { key: 'institution', label: 'Institución o universidad', get: r => r.attendee.institution ?? '' },
  { key: 'referralSource', label: '¿Cómo se enteró del evento?', get: r => r.referralSource ?? '' },
  { key: 'expectations', label: '¿Qué expectativas tiene?', get: r => r.expectations ?? '' },
  { key: 'interests', label: '¿Qué temas le interesan?', get: r => r.interests ?? '' },
  { key: 'perspective', label: '¿Qué idea le gustaría compartir?', get: r => r.perspective ?? '' },
  { key: 'comments', label: 'Comentarios adicionales', get: r => r.comments ?? '' },
];

export default function EventResponsesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [token, setToken] = useState('');
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [tab, setTab] = useState<'summary' | 'questions' | 'individual'>('summary');
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState('Cargando respuestas…');
  const allFields = useMemo(() => { const configured = new Set((event?.formFields ?? []).filter((field): field is string => typeof field === 'string')); const personal = fields.slice(0, 3); const standard = fields.slice(3).filter(field => configured.has(field.key)); const custom = (event?.formFields ?? []).flatMap(field => typeof field === 'string' ? [] : [{ key: field.key, label: field.label, get: (registration: Registration) => registration.customAnswers?.[field.key] ?? '' }]); return [...personal, ...standard, ...custom]; }, [event]);
  const answers = useCallback((registration: Registration): Answer[] => allFields
    .map(field => ({ key: field.key, label: field.label, value: field.get(registration) }))
    .filter(answer => answer.value.trim()), [allFields]);

  const load = useCallback(async (authToken: string) => {
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [eventsResponse, registrationsResponse] = await Promise.all([
        apiFetch(`${API}/events/admin`, { headers }),
        apiFetch(`${API}/events/admin/${eventId}/registrations?page=1&pageSize=100`, { headers }),
      ]);
      if (eventsResponse.status === 401 || eventsResponse.status === 403 || registrationsResponse.status === 401 || registrationsResponse.status === 403) {
        window.sessionStorage.removeItem('tedxumsa-admin-token'); setToken(''); setMessage('Tu sesión expiró. Vuelve al panel e inicia sesión.'); return;
      }
      const eventsData = await eventsResponse.json();
      const registrationsData = await registrationsResponse.json();
      if (!eventsResponse.ok) throw new Error(eventsData.message ?? 'No se pudo cargar el formulario.');
      if (!registrationsResponse.ok) throw new Error(registrationsData.message ?? 'No se pudieron cargar las respuestas.');
      const currentEvent = (eventsData as EventInfo[]).find(item => item.id === eventId);
      if (!currentEvent) throw new Error('No se encontró este formulario.');
      let allRegistrations = Array.isArray(registrationsData.items) ? registrationsData.items : [];
      let page = 2;
      while (registrationsData.hasMore && allRegistrations.length < registrationsData.total) {
        const pageResponse = await apiFetch(`${API}/events/admin/${eventId}/registrations?page=${page}&pageSize=100`, { headers });
        if (!pageResponse.ok) throw new Error('No se pudieron cargar todas las respuestas.');
        const pageData = await pageResponse.json();
        allRegistrations = allRegistrations.concat(Array.isArray(pageData.items) ? pageData.items : []);
        if (!pageData.hasMore) break;
        page += 1;
      }
      setEvent(currentEvent); setRegistrations(allRegistrations); setMessage('');
      setSelected(current => Math.min(current, Math.max(allRegistrations.length - 1, 0)));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error al cargar las respuestas.'); }
  }, [eventId]);

  useEffect(() => {
    window.sessionStorage.removeItem('tedxumsa-admin-token');
    void apiFetch(`${API}/auth/session`).then(async (response) => {
      if (!response.ok) { setMessage('Inicia sesión desde el panel de administración para ver las respuestas.'); return; }
      const data = await response.json();
      if (!['ADMIN', 'ORGANIZER'].includes(data.user?.role)) { setMessage('Tu rol no puede ver estas respuestas.'); return; }
      setToken('cookie-session');
    }).catch(() => setMessage('No se pudo validar la sesión.'));
  }, []);
  useEffect(() => { if (!token) return; void load(token); const timer = window.setInterval(() => void load(token), 5000); return () => window.clearInterval(timer); }, [token, load]);

  const questionSummary = useMemo(() => {
    return allFields.map(field => {
      const values = registrations.map(registration => field.get(registration).trim()).filter(Boolean);
      const counts = new Map<string, number>(); values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
      return { ...field, count: values.length, values: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
    });
  }, [registrations, answers, allFields]);

  return <main className="builder-page response-page admin-main-wide">
    <header className="builder-header"><a className="builder-brand" href="/">TED<span>x</span>UMSA</a><span>ADMINISTRACIÓN · RESPUESTAS</span><a className="response-back" href={`/admin/forms?section=summary&eventId=${encodeURIComponent(eventId)}`}>Volver al evento</a></header>
    <div className="response-console-shell"><AdminSidebar active="responses" eventId={eventId} /><section className="response-main">
      {event && <><p className="builder-kicker">RESUMEN DE RESPUESTAS</p><h1 className="response-title">{event.name}</h1><p className="response-meta">{new Date(event.startsAt).toLocaleString('es-BO')} · {event.venue}</p>
        <div className="response-stats"><div><strong>{registrations.length}</strong><span>Respuestas</span></div><div><strong>{registrations.filter(r => r.checkedInAt).length}</strong><span>Asistieron</span></div><div><strong>{registrations.length ? Math.round(registrations.filter(r => r.checkedInAt).length / registrations.length * 100) : 0}%</strong><span>Asistencia</span></div></div>
        <nav className="response-tabs" aria-label="Vistas de respuestas"><button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Resumen</button><button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>Por pregunta</button><button className={tab === 'individual' ? 'active' : ''} onClick={() => setTab('individual')}>Individual</button><span>Actualizado cada 5 segundos</span></nav>
        {tab === 'summary' && <section className="response-summary"><h2>Resumen de respuestas</h2><p>{registrations.length} personas respondieron este formulario.</p><div className="response-summary-grid">{questionSummary.map(question => <article className="response-question-card" key={question.key}><div className="response-question-heading"><h3>{question.label}</h3><span>{question.count} respuestas</span></div>{question.values.slice(0, 8).map(([value, count]) => <div className="response-bar-row" key={value}><div><span>{value}</span><b>{count}</b></div><i><span style={{ width: `${Math.max(4, count / Math.max(question.count, 1) * 100)}%` }} /></i></div>)}</article>)}</div>{registrations.length === 0 && <p className="response-empty">Todavía no hay respuestas.</p>}</section>}
        {tab === 'questions' && <section className="response-summary"><h2>Respuestas por pregunta</h2>{questionSummary.map(question => <article className="response-question-card" key={question.key}><div className="response-question-heading"><h3>{question.label}</h3><span>{question.count} respuestas</span></div><div className="response-text-list">{registrations.map(registration => { const value = question.get(registration).trim(); return value ? <p key={registration.id}>{value}<small>{registration.attendee.firstName} {registration.attendee.lastName}</small></p> : null; })}</div></article>)}</section>}
        {tab === 'individual' && <section className="response-individual"><aside><h2>Respuestas individuales</h2>{registrations.map((registration, index) => <button key={registration.id} className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}><strong>{registration.attendee.firstName} {registration.attendee.lastName}</strong><span>{registration.attendee.email}</span></button>)}{registrations.length === 0 && <p className="response-empty">Todavía no hay respuestas.</p>}</aside>{registrations[selected] && <article className="response-person"><div><p className="admin-card-kicker">RESPUESTA {selected + 1} DE {registrations.length}</p><h2>{registrations[selected].attendee.firstName} {registrations[selected].attendee.lastName}</h2><span>{registrations[selected].attendee.email} · {new Date(registrations[selected].createdAt).toLocaleString('es-BO')}</span></div><div className="response-person-answers">{answers(registrations[selected]).map(answer => <section key={answer.key}><span>{answer.label}</span><p>{answer.value}</p></section>)}<section><span>Butaca</span><p>{registrations[selected].seat ? `${registrations[selected].seat.rowLabel} · ${registrations[selected].seat.seatLabel}` : 'Sin butaca asignada'}</p></section><section><span>Asistencia</span><p>{registrations[selected].checkedInAt ? `Confirmada · ${new Date(registrations[selected].checkedInAt).toLocaleString('es-BO')}` : 'Pendiente'}</p></section></div><div className="response-person-nav"><button disabled={selected === 0} onClick={() => setSelected(index => index - 1)}>Anterior</button><button disabled={selected >= registrations.length - 1} onClick={() => setSelected(index => index + 1)}>Siguiente</button></div></article>}</section>}
      </>}
      {!event && <p className="response-loading">{message || 'Cargando respuestas…'} <a href={`/admin/forms?section=summary&eventId=${encodeURIComponent(eventId)}`}>Ir al evento</a></p>}
    </section></div>
  </main>;
}
