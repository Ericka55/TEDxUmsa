'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import AdminSidebar, { type AdminSection } from '../admin-sidebar';
import { apiFetch } from '../../api-client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const fields: [string, string][] = [
  ['institution', 'Institución o universidad'],
  ['referralSource', '¿Cómo te enteraste del evento?'],
  ['expectations', '¿Qué expectativas tienes?'],
  ['interests', '¿Qué temas te interesan?'],
  ['perspective', '¿Qué idea te gustaría compartir?'],
  ['comments', 'Comentarios adicionales'],
];
type SeatMode = 'AVAILABLE' | 'BLOCKED' | 'AISLE';
type AdminEvent = {
  id: string; slug: string; name: string; description: string; status: string; startsAt: string; endsAt?: string | null; venue: string; formFields: (string | { key: string; label: string })[]; whatsappGroupUrl?: string | null; closedAt?: string | null;
  hallName: string | null; seatRows: number | null; seatColumns: number | null; seatLayout: { status: 'AVAILABLE' | 'BLOCKED'; rowLabel: string; seatLabel: string; rowOrder: number; columnOrder: number }[]; seatCount: number; occupiedSeats: number; availableSeats: number; registrationCount: number; checkedInCount: number;
};
type Collaborator = { id: string; name: string; email: string; role: 'ORGANIZER' | 'COLLABORATOR'; active: boolean; createdAt: string };
type SatisfactionReport = { responseCount: number; averageRating: number; averageRecommendation: number; surveyDelivery: { eligible: number; sent: number; pending: number; emailConfigured: boolean }; ratingDistribution: { rating: number; count: number }[]; responses: { rating: number; recommendation: number; highlights: string | null; improvements: string | null; attendee: { firstName: string; lastName: string } }[] };
type AdminRegistration = {
  id: string; eventId: string; eventName: string; confirmationCode: string; status: string; createdAt: string;
  attendee: { firstName: string; lastName: string; email: string; phone?: string | null; occupation?: string | null };
  seat: { rowLabel: string; seatLabel: string } | null;
};
type HallRecord = {
  id: string; name: string; venue: string; seatRows: number; seatColumns: number;
  seatLayout: { rowOrder: number; columnOrder: number; status?: 'AVAILABLE' | 'BLOCKED'; state?: 'AVAILABLE' | 'BLOCKED' | 'AISLE' }[];
  photoUrl: string | null; legacyKey?: string | null;
};
type Scanner = { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ScannerConstructor = new (options: { formats: string[] }) => Scanner;
function rowLabel(index: number) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}


export default function FormBuilderPage() {
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState('');
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [registrations, setRegistrations] = useState<AdminRegistration[]>([]);
  const [registrationsHasMore, setRegistrationsHasMore] = useState(false);
  const [loadingMoreRegistrations, setLoadingMoreRegistrations] = useState(false);
  const [halls, setHalls] = useState<HallRecord[]>([]);
  const [scanStatus, setScanStatus] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const [seatRows, setSeatRows] = useState(5);
  const [seatColumns, setSeatColumns] = useState(8);
  const [seatModes, setSeatModes] = useState<Record<string, SeatMode>>({});
  const [seatTool, setSeatTool] = useState<'CYCLE' | SeatMode>('CYCLE');
  const [customQuestions, setCustomQuestions] = useState<{ key: string; label: string }[]>([]);
  const [questionOrder, setQuestionOrder] = useState<string[]>(fields.map(([key]) => key));
  const [savedLayoutId, setSavedLayoutId] = useState('');
  const [venue, setVenue] = useState('');
  const [hallName, setHallName] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [selectedDashboardEventId, setSelectedDashboardEventId] = useState('');
  const [editingEventId, setEditingEventId] = useState('');
  const [activeSection, setActiveSection] = useState<AdminSection>('events');
  const [scanningEventId, setScanningEventId] = useState('');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorNotice, setCollaboratorNotice] = useState('');
  const [satisfactionReport, setSatisfactionReport] = useState<SatisfactionReport | null>(null);
  const [eventCloseNotice, setEventCloseNotice] = useState('');
  const [closingEventId, setClosingEventId] = useState('');
  const [deletingEventId, setDeletingEventId] = useState('');
  const [copiedLinkEventId, setCopiedLinkEventId] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const eventsLoaded = useRef(false);
  const eventsCache = useRef<AdminEvent[]>([]);
  const pollInFlight = useRef(false);
  const requestedSection = useRef<AdminSection | ''>('');
  const savedLayouts = halls;
  const dashboardEvent = events.find((item) => item.id === selectedDashboardEventId) ?? null;
  const editingEvent = events.find((item) => item.id === editingEventId) ?? null;
  const activeEvents = events.filter((item) => item.status === 'PUBLISHED');
  const selectableEvents = activeEvents.filter((item) => `${item.name} ${item.venue} ${item.hallName ?? ''}`.toLocaleLowerCase('es-BO').includes(eventSearch.toLocaleLowerCase('es-BO')));
  const closedEvents = events.filter((item) => item.status === 'ARCHIVED' && item.closedAt);
  const selectableClosedEvents = closedEvents.filter((item) => `${item.name} ${item.venue}`.toLocaleLowerCase('es-BO').includes(eventSearch.toLocaleLowerCase('es-BO')));
  const draftEvents = events.filter((item) => item.status === 'DRAFT');
  const selectableDraftEvents = draftEvents.filter((item) => `${item.name} ${item.venue}`.toLocaleLowerCase('es-BO').includes(eventSearch.toLocaleLowerCase('es-BO')));
  const dashboardRegistrations = registrations.filter((item) => item.eventId === dashboardEvent?.id);
  const visibleAttendees = dashboardRegistrations.filter((item) => `${item.attendee.firstName} ${item.attendee.lastName} ${item.attendee.email} ${item.confirmationCode}`.toLocaleLowerCase('es-BO').includes(attendeeSearch.toLocaleLowerCase('es-BO'))).slice(0, 12);
  const eventRegistrations = dashboardEvent?.registrationCount ?? 0;
  const eventCapacity = dashboardEvent?.seatCount ?? 0;
  const eventAvailable = dashboardEvent?.availableSeats ?? 0;
  const eventCheckIns = dashboardEvent?.checkedInCount ?? 0;
  const capacityPercent = eventCapacity ? Math.round((eventRegistrations / eventCapacity) * 1000) / 10 : 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section') as AdminSection | null;
    const validSections: AdminSection[] = ['summary', 'collaborators', 'events', 'qr', 'halls', 'responses'];
    const eventId = params.get('eventId') || window.sessionStorage.getItem('tedxumsa-admin-event-id') || '';
    const nextSection = section && validSections.includes(section) ? section : eventId ? 'summary' : 'events';
    setActiveSection(nextSection);
    requestedSection.current = nextSection === 'collaborators' || nextSection === 'qr' ? nextSection : '';
    if (nextSection !== 'events' && eventId) setSelectedDashboardEventId(eventId);
    else if (nextSection === 'events') { setSelectedDashboardEventId(''); window.sessionStorage.removeItem('tedxumsa-admin-event-id'); }
    window.sessionStorage.removeItem('tedxumsa-admin-token');
    void apiFetch(`${API}/auth/session`).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      setToken('cookie-session');
      setIsAdministrator(data.user?.role === 'ADMIN');
    }).catch(() => undefined).finally(() => setAuthReady(true));
  }, []);

  function navigateAdminSection(section: Exclude<AdminSection, 'halls' | 'responses'>) {
    setActiveSection(section);
    requestedSection.current = '';
    if (section === 'events') {
      setSelectedDashboardEventId('');
      setScanningEventId('');
      setScanStatus('');
      window.history.replaceState(null, '', '/admin/forms?section=events');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!dashboardEvent) {
      window.history.replaceState(null, '', `/admin/forms?section=${section}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.history.replaceState(null, '', `/admin/forms?section=${section}&eventId=${encodeURIComponent(dashboardEvent.id)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (section === 'qr') {
      setScanStatus('Apunta la cámara al QR de este evento.');
      setScanningEventId(dashboardEvent.id);
    } else if (section !== 'collaborators') {
      setScanningEventId('');
      setScanStatus('');
    }
  }

  useEffect(() => {
    if (!selectedDashboardEventId) { window.sessionStorage.removeItem('tedxumsa-admin-event-id'); return; }
    window.sessionStorage.setItem('tedxumsa-admin-event-id', selectedDashboardEventId);
  }, [selectedDashboardEventId]);

  useEffect(() => {
    if (!dashboardEvent || !requestedSection.current) return;
    const section = requestedSection.current;
    requestedSection.current = '';
    if (section === 'collaborators') window.setTimeout(() => document.getElementById('admin-collaborators')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    if (section === 'qr') {
      setScanStatus('Apunta la cámara al QR de este evento.');
      setScanningEventId(dashboardEvent.id);
      window.setTimeout(() => document.getElementById('admin-event-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [dashboardEvent]);

  useEffect(() => {
    if (!token) return;
    void loadEvents(token);
    void loadHalls(token);
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || pollInFlight.current) return;
      pollInFlight.current = true;
      void loadEvents(token).finally(() => { pollInFlight.current = false; });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedDashboardEventId) { setCollaborators([]); setSatisfactionReport(null); return; }
    setEventCloseNotice('');
    const headers = { Authorization: `Bearer ${token}` };
    void Promise.all([
      apiFetch(`${API}/events/admin/${selectedDashboardEventId}/collaborators`, { headers }).then((response) => response.ok ? response.json() : []),
      apiFetch(`${API}/events/admin/${selectedDashboardEventId}/satisfaction`, { headers }).then((response) => response.ok ? response.json() : null),
    ]).then(([people, report]) => { setCollaborators(Array.isArray(people) ? people : []); setSatisfactionReport(report); }).catch(() => { setCollaborators([]); setSatisfactionReport(null); });
  }, [token, selectedDashboardEventId]);

  useEffect(() => {
    if (!token || !selectedDashboardEventId) { setRegistrations([]); setRegistrationsHasMore(false); return; }
    let cancelled = false;
    let requestInFlight = false;
    const refreshFirstPage = async () => {
      if (requestInFlight || document.visibilityState !== 'visible') return;
      requestInFlight = true;
      try {
        const response = await apiFetch(`${API}/events/admin/${encodeURIComponent(selectedDashboardEventId)}/registrations?page=1&pageSize=50`);
        if (!response.ok) throw new Error('No se pudieron cargar las inscripciones del evento.');
        const result = await response.json();
        if (!cancelled) {
          const name = eventsCache.current.find((item) => item.id === selectedDashboardEventId)?.name ?? '';
          const firstPage: AdminRegistration[] = Array.isArray(result.items) ? (result.items as AdminRegistration[]).map((registration) => ({ ...registration, eventId: selectedDashboardEventId, eventName: name })) : [];
          setRegistrations((current) => [...firstPage, ...current.filter((registration) => registration.eventId === selectedDashboardEventId && !firstPage.some((fresh: AdminRegistration) => fresh.id === registration.id))]);
          setRegistrationsHasMore(Boolean(result.hasMore));
        }
      } catch { if (!cancelled) setRegistrations([]); }
      finally { requestInFlight = false; }
    };
    void refreshFirstPage();
    const interval = window.setInterval(() => void refreshFirstPage(), 15000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [token, selectedDashboardEventId]);

  async function loadMoreRegistrations() {
    if (!selectedDashboardEventId || loadingMoreRegistrations || !registrationsHasMore) return;
    setLoadingMoreRegistrations(true);
    try {
      const nextPage = Math.floor(dashboardRegistrations.length / 50) + 1;
      const response = await apiFetch(`${API}/events/admin/${encodeURIComponent(selectedDashboardEventId)}/registrations?page=${nextPage}&pageSize=50`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'No se pudieron cargar más inscripciones.');
      const name = eventsCache.current.find((item) => item.id === selectedDashboardEventId)?.name ?? '';
      setRegistrations((current) => [...current, ...(Array.isArray(result.items) ? (result.items as AdminRegistration[]).map((registration) => ({ ...registration, eventId: selectedDashboardEventId, eventName: name })) : [])]);
      setRegistrationsHasMore(Boolean(result.hasMore));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudieron cargar más inscripciones.'); }
    finally { setLoadingMoreRegistrations(false); }
  }


  useEffect(() => {
    if (!scanningEventId) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let frame = 0;
    const start = async () => {
      const Detector = (window as Window & { BarcodeDetector?: ScannerConstructor }).BarcodeDetector;
      if (!Detector) { setScanStatus('Este navegador no ofrece lector QR por cámara. Puedes ingresar el código manualmente.'); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setScanStatus('La cámara no está disponible. Ingresa el código manualmente.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const scanFrame = async () => {
          if (stopped || !video) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              stopped = true;
              setManualCode(codes[0].rawValue);
              setScanningEventId('');
              void submitCheckIn(codes[0].rawValue, scanningEventId);
              return;
            }
          } catch { /* Keep the camera preview active while the QR is out of frame. */ }
          frame = window.requestAnimationFrame(() => void scanFrame());
        };
        void scanFrame();
      } catch {
        setScanStatus('No se pudo abrir la cámara. Ingresa el código manualmente.');
      }
    };
    void start();
    return () => { stopped = true; window.cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scanningEventId, token]);

  async function loadEvents(authToken: string) {
    if (!eventsLoaded.current) setLoadingEvents(true);
    try {
      const response = await apiFetch(`${API}/events/admin`);
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        window.sessionStorage.removeItem('tedxumsa-admin-token');
        setToken('');
        setIsAdministrator(false);
        setEvents([]);
        setRegistrations([]);
        setSelectedDashboardEventId('');
        eventsLoaded.current = false;
        throw new Error('Session expired. Please sign in again.');
      }
      if (!response.ok) throw new Error(data.message ?? 'No se pudieron cargar los formularios.');
      eventsCache.current = data;
      setEvents(data);
      setSelectedDashboardEventId((current) => data.some((item: AdminEvent) => item.id === current) ? current : '');
      eventsLoaded.current = true;

    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Error al cargar el panel.');
    } finally {
      setLoadingEvents(false);
      eventsLoaded.current = true;
    }
  }

  async function loadHalls(authToken: string) {
    try {
      const response = await apiFetch(`${API}/halls`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) setHalls(data);
    } catch { /* The event dashboard remains usable if the hall list is unavailable. */ }
  }

  async function submitCheckIn(rawCode: string, expectedEventId: string) {
    const code = rawCode.trim();
    if (!code) return;
    setScanStatus('Verificando QR...');
    try {
      const response = await apiFetch(`${API}/events/admin/${encodeURIComponent(expectedEventId)}/registrations/${encodeURIComponent(code)}/check-in`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'El QR no corresponde a una inscripción activa.');
      if (data.event?.id !== expectedEventId) throw new Error('Este QR pertenece a otro formulario.');
      const attendee = `${data.attendee.firstName} ${data.attendee.lastName}`;
      setScanStatus(data.alreadyCheckedIn ? `${attendee} ya había ingresado.` : `Asistencia confirmada: ${attendee} · ${data.event.name}`);
      const registrationResponse = await apiFetch(`${API}/events/admin/${encodeURIComponent(expectedEventId)}/registrations?page=1&pageSize=50`);
      if (registrationResponse.ok) {
        const result = await registrationResponse.json();
        const rows = Array.isArray(result.items) ? result.items : [];
        setRegistrations((rows as AdminRegistration[]).map((registration) => ({ ...registration, eventId: expectedEventId, eventName: data.event.name })));
        setRegistrationsHasMore(Boolean(result.hasMore));
      }
      void loadEvents(token);
    } catch (error) {
      setScanStatus(error instanceof Error ? error.message : 'No se pudo verificar el QR.');
    }
  }

  async function addCollaborator(event: FormEvent<HTMLFormElement>, eventId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setCollaboratorNotice('Agregando colaborador…');
    try {
      const response = await apiFetch(`${API}/events/admin/${eventId}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: values.get('name'), email: values.get('email'), password: values.get('password'), role: values.get('role') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo agregar el colaborador.');
      setCollaborators((current) => [...current, { ...data, active: true }]);
      form.reset();
      setCollaboratorNotice(data.role === 'ORGANIZER' ? 'Organizador asignado a este evento.' : 'Colaborador agregado. Comparte sus credenciales de acceso de forma segura.');
    } catch (error) { setCollaboratorNotice(error instanceof Error ? error.message : 'No se pudo agregar el colaborador.'); }
  }

  async function removeCollaborator(eventId: string, collaborator: Collaborator) {
    if (!window.confirm(`¿Quitar a ${collaborator.name} de este evento?`)) return;
    try {
      const response = await apiFetch(`${API}/events/admin/${eventId}/collaborators/${collaborator.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo quitar el colaborador.');
      setCollaborators((current) => current.filter((item) => item.id !== collaborator.id));
      setCollaboratorNotice('Colaborador quitado de este evento.');
    } catch (error) { setCollaboratorNotice(error instanceof Error ? error.message : 'No se pudo quitar el colaborador.'); }
  }

  async function finishEvent(eventId: string, retry = false) {
    if (closingEventId) return;
    if (!retry && !window.confirm('¿Terminar este evento? Se cerrarán las inscripciones y se enviará una encuesta a quienes registraron su asistencia.')) return;
    setClosingEventId(eventId);
    setEventCloseNotice(retry ? 'Reintentando los correos pendientes…' : 'Finalizando evento y enviando encuestas…');
    try {
      const response = await apiFetch(`${API}/events/admin/${eventId}/close`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo finalizar el evento.');
      setEventCloseNotice(data.eligible === 0 ? 'Evento finalizado. No había asistentes acreditados para encuestar.' : !data.emailConfigured ? `Evento finalizado. Faltan configurar RESEND_API_KEY y MAIL_FROM; hay ${data.pending} correos pendientes.` : data.pending ? `Evento finalizado. Se enviaron ${data.sent}; quedan ${data.pending} correos pendientes. Puedes reintentarlo.` : `Evento finalizado. Encuesta enviada a ${data.sent} asistentes acreditados.`);
      await Promise.all([loadEvents(token), apiFetch(`${API}/events/admin/${eventId}/satisfaction`, { headers: { Authorization: `Bearer ${token}` } }).then(async (reportResponse) => { if (reportResponse.ok) setSatisfactionReport(await reportResponse.json()); })]);
    } catch (error) { setEventCloseNotice(error instanceof Error ? error.message : 'No se pudo finalizar el evento.'); }
    finally { setClosingEventId(''); }
  }

  async function deleteEventPermanently(item: AdminEvent) {
    if (deletingEventId) return;
    if (!window.confirm(`Vas a eliminar permanentemente “${item.name}” y todos sus registros, respuestas, butacas e historial. Esta acción no se puede deshacer.`)) return;
    const confirmation = window.prompt(`Para confirmar, escribe exactamente el nombre del evento:\n${item.name}`);
    if (confirmation !== item.name) {
      if (confirmation !== null) setNotice('El nombre no coincide. No se eliminó el evento.');
      return;
    }

    setDeletingEventId(item.id);
    setNotice('Eliminando evento y sus datos…');
    try {
      const response = await apiFetch(`${API}/events/admin/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo eliminar el evento.');

      setEvents((current) => current.filter((event) => event.id !== item.id));
      setRegistrations((current) => current.filter((registration) => registration.eventId !== item.id));
      setSelectedDashboardEventId('');
      setEditingEventId('');
      setScanningEventId('');
      setCollaborators([]);
      setSatisfactionReport(null);
      setActiveSection('events');
      window.sessionStorage.removeItem('tedxumsa-admin-event-id');
      window.history.replaceState(null, '', '/admin/forms?section=events');
      setNotice(`“${item.name}” y todos sus datos fueron eliminados permanentemente.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el evento.');
    } finally {
      setDeletingEventId('');
    }
  }

  async function copyRegistrationLink(eventId: string, slug: string) {
    const registrationUrl = `${window.location.origin}/e/${slug}`;
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopiedLinkEventId(eventId);
      window.setTimeout(() => setCopiedLinkEventId((current) => current === eventId ? '' : current), 2500);
    } catch {
      setNotice(`No se pudo copiar automáticamente. Copia este enlace: ${registrationUrl}`);
    }
  }

  async function exportRegistrationsCsv() {
    const columns = ['ID', 'Participante', 'Correo', 'Evento', 'Butaca', 'Estado', 'Fecha de inscripción'];
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const allRegistrations: AdminRegistration[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore && dashboardEvent) {
      const response = await apiFetch(`${API}/events/admin/${encodeURIComponent(dashboardEvent.id)}/registrations?page=${page}&pageSize=100`);
      if (!response.ok) throw new Error('No se pudo preparar la descarga completa de inscripciones.');
      const result = await response.json();
      allRegistrations.push(...(Array.isArray(result.items) ? (result.items as AdminRegistration[]).map((item) => ({ ...item, eventId: dashboardEvent.id, eventName: dashboardEvent.name })) : []));
      hasMore = Boolean(result.hasMore); page += 1;
    }
    const rows = allRegistrations.map((item) => [item.confirmationCode, `${item.attendee.firstName} ${item.attendee.lastName}`, item.attendee.email, item.eventName, item.seat ? `${item.seat.rowLabel}-${item.seat.seatLabel}` : 'Sin asiento', item.status, new Date(item.createdAt).toLocaleString('es-BO')]);
    const blob = new Blob(['\uFEFF', [columns, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tedxumsa-${dashboardEvent?.slug ?? 'inscritos'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function configureHall(event: FormEvent<HTMLFormElement>, eventId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setScanStatus('Creando el mapa de butacas...');
    try {
      const response = await apiFetch(`${API}/events/admin/${eventId}/hall`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hallName: form.get('hallName'), seatRows: Number(form.get('seatRows')), seatColumns: Number(form.get('seatColumns')) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo crear el mapa.');
      setScanStatus(`Mapa creado: ${data.seatCount} butacas disponibles.`);
      await loadEvents(token);
      await loadHalls(token);
    } catch (error) {
      setScanStatus(error instanceof Error ? error.message : 'No se pudo crear el mapa.');
    }
  }

  function useSavedLayout(eventId: string) {
    setSavedLayoutId(eventId);
    const saved = halls.find((item) => item.id === eventId);
    if (!saved) return;
    const rows = saved.seatRows; const columns = saved.seatColumns;
    setSeatRows(rows); setSeatColumns(columns);
    const modes: Record<string, SeatMode> = {};
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const seat = saved.seatLayout.find((item) => item.rowOrder === row && item.columnOrder === column);
      modes[`${row}:${column}`] = !seat && saved.legacyKey ? 'AISLE' : seat?.state === 'AISLE' ? 'AISLE' : seat?.status === 'BLOCKED' || seat?.state === 'BLOCKED' ? 'BLOCKED' : 'AVAILABLE';
    }
    setSeatModes(modes);
    setVenue(saved.venue); setHallName(saved.name);
  }

  function cycleSeat(row: number, column: number) {
    const key = `${row}:${column}`;
    setSeatModes((current) => {
      const currentMode = current[key] ?? 'AVAILABLE';
      const next: SeatMode = currentMode === 'AVAILABLE' ? 'BLOCKED' : currentMode === 'BLOCKED' ? 'AISLE' : 'AVAILABLE';
      return { ...current, [key]: next };
    });
  }

  function setSeat(row: number, column: number) {
    if (seatTool === 'CYCLE') { cycleSeat(row, column); return; }
    setSeatModes((current) => ({ ...current, [`${row}:${column}`]: seatTool }));
  }

  function markRowAsAisle(row: number) {
    setSeatModes((current) => {
      const next = { ...current };
      for (let column = 0; column < seatColumns; column += 1) next[`${row}:${column}`] = 'AISLE';
      return next;
    });
  }

  function markColumnAsAisle(column: number) {
    setSeatModes((current) => {
      const next = { ...current };
      for (let row = 0; row < seatRows; row += 1) next[`${row}:${column}`] = 'AISLE';
      return next;
    });
  }

  function addCenterAisle() {
    const center = Math.floor(seatColumns / 2);
    const columns = seatColumns % 2 === 0 ? [center - 1, center] : [center];
    setSeatModes((current) => {
      const next = { ...current };
      for (let row = 0; row < seatRows; row += 1) for (const column of columns) next[`${row}:${column}`] = 'AISLE';
      return next;
    });
  }

  function clearAisles() {
    setSeatModes((current) => Object.fromEntries(Object.entries(current).map(([key, mode]) => [key, mode === 'AISLE' ? 'AVAILABLE' : mode])));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('Ingresando…');
    try {
      const response = await apiFetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo iniciar sesión.');
      setToken('cookie-session');
      setIsAdministrator(data.user?.role === 'ADMIN');
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Error de conexión con el servidor.');
    }
  }

  function openEventEditor(item: AdminEvent) {
    setEditingEventId(item.id);
    setVenue(item.venue);
    setHallName(item.hallName ?? '');
    setCustomQuestions(item.formFields.filter((field): field is { key: string; label: string } => typeof field !== 'string').map((field) => ({ ...field })));
    setQuestionOrder(item.formFields.map((field) => typeof field === 'string' ? field : field.key));
    setCreating(true);
    setNotice('');
    setLink('');
  }

  function moveQuestion(key: string, offset: -1 | 1) {
    setQuestionOrder((current) => {
      const index = current.indexOf(key);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function createForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isEditing = Boolean(editingEventId);
    setNotice(isEditing ? 'Guardando cambios…' : 'Creando formulario…');
    setLink('');
    const form = new FormData(event.currentTarget);
    const slug = String(form.get('slug')).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const formFields: (string | { key: string; label: string })[] = questionOrder.flatMap((key): (string | { key: string; label: string })[] => {
      if (fields.some(([fieldKey]) => fieldKey === key)) return form.get(key) ? [key] : [];
      const question = customQuestions.find((item) => item.key === key);
      return question?.label.trim() ? [{ ...question, label: question.label.trim() }] : [];
    });
    try {
      const response = await apiFetch(isEditing ? `${API}/events/admin/${editingEventId}` : `${API}/events`, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.get('name'), slug, description: form.get('description'),
          venue: form.get('venue'), startsAt: form.get('startsAt'), endsAt: form.get('endsAt') || null, whatsappGroupUrl: form.get('whatsappGroupUrl') || null, formFields,
          ...(!isEditing ? { hallId: savedLayoutId || null, hallName: form.get('hallName'), seatRows: Number(form.get('seatRows')),
          seatColumns: Number(form.get('seatColumns')),
          seatLayout: Array.from({ length: seatRows * seatColumns }, (_, index) => {
            const rowOrder = Math.floor(index / seatColumns);
            const columnOrder = index % seatColumns;
            return { rowOrder, columnOrder, state: seatModes[`${rowOrder}:${columnOrder}`] ?? 'AVAILABLE' };
          }) } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message ?? 'No se pudo crear el formulario.');
      const publicLink = `${window.location.origin}/e/${data.slug}`;
      setLink(publicLink);
      setNotice(isEditing ? 'Evento y preguntas actualizados.' : 'Formulario publicado. Copia el enlace para compartirlo.');
      setCreating(false);
      if (isEditing) { setEditingEventId(''); setActiveSection('summary'); }
      void loadEvents(token);
      void loadHalls(token);
      (event.currentTarget as HTMLFormElement).reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Error de conexión con el servidor.');
    }
  }

  return (
    <main className={`builder-page${token && (!creating || editingEventId) ? ' admin-main-wide' : ''}`}>
      <header className="builder-header"><a className="builder-brand" href="/">TED<span>x</span>UMSA</a><span>ADMINISTRACIÓN</span>{token && <button className="admin-logout" onClick={() => { void apiFetch(`${API}/auth/logout`, { method: 'POST' }); window.sessionStorage.removeItem('tedxumsa-admin-token'); setToken(''); setCreating(false); setEvents([]); setRegistrations([]); setSelectedDashboardEventId(''); eventsLoaded.current = false; setNotice(''); }}>Cerrar sesión</button>}</header>
      <section className="builder-main">
        {authReady && (!token || creating) && <><p className="builder-kicker">HERRAMIENTA PARA ORGANIZADORES</p><h1>{creating ? editingEvent ? <>Edita el<br /><em>evento.</em></> : <>Publica un<br /><em>nuevo evento.</em></> : <>Panel de<br /><em>administración.</em></>}</h1></>}
        {!authReady ? <p className="admin-auth-loading" role="status">Verificando sesión…</p> : !token ? (
          <form className="builder-form" onSubmit={login}>
            <h2>Acceso administrador</h2>
            <label>Correo administrador<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
            <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
            <button className="builder-button">Ingresar</button>
          </form>
        ) : !creating ? (
          <section className="admin-dashboard">
            <div className="admin-console-shell">
                  <AdminSidebar active={dashboardEvent && activeSection === 'events' ? 'summary' : activeSection} eventId={dashboardEvent?.id ?? selectedDashboardEventId} onNavigate={navigateAdminSection} />
              <div className="admin-console-content" id="admin-home">
                <div className="admin-console-topline"><div><b>ADMINISTRACIÓN TEDxUMSA</b><span>/ EVENTOS Y ASISTENTES</span></div><div className="admin-user-chip"><i /> SESIÓN ACTIVA <b>AD</b></div></div>
                {!dashboardEvent || activeSection === 'events' ? <section className="admin-event-picker">
                  <div className="admin-console-heading"><div><p>GESTIÓN DE EVENTOS</p><h2>{activeSection === 'collaborators' ? 'Elige un evento para ver sus colaboradores' : activeSection === 'qr' ? 'Elige un evento para escanear entradas' : activeSection === 'summary' ? 'Elige un evento para ver su resumen' : 'Elige un evento'}</h2><span>Abre el evento que quieres administrar; cada sección mostrará únicamente sus datos.</span></div>{isAdministrator && <button className="builder-button" onClick={() => { setSelectedDashboardEventId(''); setActiveSection('events'); setEditingEventId(''); setCustomQuestions([]); setQuestionOrder(fields.map(([key]) => key)); setVenue(''); setHallName(''); setCreating(true); setLink(''); setNotice(''); }}>+ CREAR EVENTO</button>}</div>
                  <div className="admin-event-picker-toolbar"><label><span aria-hidden="true">⌕</span><input aria-label="Buscar eventos activos" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Buscar evento o lugar" /></label><button type="button" onClick={() => void loadEvents(token)}>↻ ACTUALIZAR</button><span>{activeEvents.length} activos</span></div>
                  {loadingEvents && events.length === 0 ? <p className="builder-notice">Cargando eventos activos…</p> : activeEvents.length === 0 ? <div className="admin-empty"><span>TED<span className="admin-x">x</span>UMSA</span><p>No hay eventos activos todavía.</p><small>Publica un evento para que aparezca aquí y puedas administrar sus inscripciones.</small></div> : selectableEvents.length === 0 ? <p className="builder-notice">No hay eventos que coincidan con esa búsqueda.</p> : <div className="admin-event-picker-grid">{selectableEvents.map((item) => <article className="admin-event-picker-card" key={item.id}><div className="admin-picker-card-top"><span>● ACTIVO</span><small>{new Date(item.startsAt).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><h3>{item.name}</h3><p>{item.venue}{item.hallName ? ` · ${item.hallName}` : ''}</p><div className="admin-picker-card-stats"><span><b>{item.registrationCount}</b> inscritos</span><span><b>{item.availableSeats}</b> butacas libres</span><span><b>{item.checkedInCount}</b> ingresaron</span></div><button type="button" className="builder-button" onClick={() => { const destination = activeSection === 'collaborators' || activeSection === 'qr' ? activeSection : 'summary'; setSelectedDashboardEventId(item.id); setActiveSection(destination); requestedSection.current = ''; setAttendeeSearch(''); setScanStatus(destination === 'qr' ? 'Apunta la cámara al QR de este evento.' : ''); if (destination === 'qr') setScanningEventId(item.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>ABRIR {activeSection === 'collaborators' ? 'COLABORADORES' : activeSection === 'qr' ? 'ESCÁNER QR' : 'DASHBOARD'} <b aria-hidden="true">&#8594;</b></button><button type="button" className="admin-copy-registration-link" onClick={() => void copyRegistrationLink(item.id, item.slug)}>{copiedLinkEventId === item.id ? 'ENLACE COPIADO ✓' : 'COPIAR ENLACE DE INSCRIPCIÓN'}</button></article>)}</div>}
                  {closedEvents.length > 0 && <section className="admin-closed-events"><div className="admin-list-heading"><div><span aria-hidden="true">&#10022;</span><h3>EVENTOS FINALIZADOS</h3><small>Consulta la asistencia y las respuestas de satisfacción.</small></div><span>{closedEvents.length}</span></div>{selectableClosedEvents.length ? <div className="admin-event-picker-grid">{selectableClosedEvents.map((item) => <article className="admin-event-picker-card is-closed" key={item.id}><div className="admin-picker-card-top"><span>FINALIZADO</span><small>{item.closedAt ? new Date(item.closedAt).toLocaleDateString('es-BO') : ''}</small></div><h3>{item.name}</h3><p>{item.venue}</p><div className="admin-picker-card-stats"><span><b>{item.registrationCount}</b> inscritos</span><span><b>{item.checkedInCount}</b> asistieron</span><span><b>{item.availableSeats}</b> butacas libres</span></div><button type="button" className="builder-button" onClick={() => { setSelectedDashboardEventId(item.id); setEventCloseNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>VER DASHBOARD Y ENCUESTA <b aria-hidden="true">&#8594;</b></button></article>)}</div> : <p className="builder-notice">No hay eventos finalizados que coincidan con la búsqueda.</p>}</section>}
                  {draftEvents.length > 0 && <section className="admin-closed-events"><div className="admin-list-heading"><div><span aria-hidden="true">&#10022;</span><h3>BORRADORES</h3><small>Continúa configurando estos eventos.</small></div><span>{draftEvents.length}</span></div>{selectableDraftEvents.length ? <div className="admin-event-picker-grid">{selectableDraftEvents.map((item) => <article className="admin-event-picker-card is-closed" key={item.id}><div className="admin-picker-card-top"><span>BORRADOR</span><small>{new Date(item.startsAt).toLocaleDateString('es-BO')}</small></div><h3>{item.name}</h3><p>{item.venue}</p><button type="button" className="builder-button" onClick={() => { setSelectedDashboardEventId(item.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>CONTINUAR CONFIGURACIÓN <b aria-hidden="true">&#8594;</b></button></article>)}</div> : <p className="builder-notice">No hay borradores que coincidan con la búsqueda.</p>}</section>}
                </section> : activeSection === 'collaborators' ? <section className="admin-section-view" id="admin-collaborators">
                  <div className="admin-console-heading"><div><p>GESTIÓN DEL EVENTO</p><h2>Colaboradores</h2><span>{dashboardEvent.name} · administra quién puede ayudar con las inscripciones.</span></div><a className="admin-show-attendees" href={`/admin/forms?section=summary&eventId=${encodeURIComponent(dashboardEvent.id)}`}>VOLVER AL RESUMEN</a></div>
                  <section className="admin-collab-panel admin-collaborators-page"><div className="admin-aside-heading"><h3>PERSONAS ASIGNADAS A ESTE EVENTO</h3><span>{collaborators.length}</span></div><p>Los colaboradores pueden registrar asistentes y confirmar su llegada para este evento.</p>{dashboardEvent.status === 'PUBLISHED' && <><a className="admin-collab-portal-link" href="/colaborador" target="_blank" rel="noreferrer">ABRIR PORTAL DE COLABORADORES ↗</a><form onSubmit={(event) => void addCollaborator(event, dashboardEvent.id)}><label>Nombre<input name="name" required maxLength={120} placeholder="Nombre completo" /></label><label>Correo<input name="email" type="email" required placeholder="persona@correo.com" /></label><label>Contraseña temporal<input name="password" type="password" minLength={12} required autoComplete="new-password" placeholder="Mínimo 12 caracteres" /></label>{isAdministrator && <label>Rol para este evento<select name="role" defaultValue="COLLABORATOR"><option value="COLLABORATOR">Colaborador</option><option value="ORGANIZER">Organizador del evento</option></select></label>}<button type="submit" className="admin-show-attendees">+ AGREGAR COLABORADOR</button></form></>}{collaboratorNotice && <p className="admin-collab-notice" role="status">{collaboratorNotice}</p>}<div className="admin-collab-list">{collaborators.map((person) => <div key={person.id}><span><b>{person.name}</b><small>{person.email}</small></span><button type="button" aria-label={`Quitar a ${person.name}`} onClick={() => void removeCollaborator(dashboardEvent.id, person)}>×</button></div>)}{collaborators.length === 0 && <small>Aún no hay colaboradores.</small>}</div></section>
                </section> : activeSection === 'qr' ? <section className="admin-section-view" id="admin-event-tools">
                  <div className="admin-console-heading"><div><p>CONTROL DE ACCESO</p><h2>Escáner de entradas</h2><span>{dashboardEvent.name} · verifica el QR al ingreso.</span></div><a className="admin-show-attendees" href={`/admin/forms?section=summary&eventId=${encodeURIComponent(dashboardEvent.id)}`}>VOLVER AL RESUMEN</a></div>
                  <section className="admin-qr-workspace"><div className="admin-aside-heading"><h3>LECTOR QR DEL EVENTO</h3><span>{dashboardEvent.slug.toUpperCase()}</span></div><video className="checkin-camera" ref={videoRef} muted playsInline /><div className="admin-qr-controls"><button type="button" className="admin-show-attendees" onClick={() => { setScanStatus('Apunta la cámara al QR de este evento.'); setScanningEventId(scanningEventId === dashboardEvent.id ? '' : dashboardEvent.id); }}>{scanningEventId === dashboardEvent.id ? 'CERRAR CÁMARA' : 'ACTIVAR CÁMARA'}</button><form className="checkin-manual" onSubmit={(event) => { event.preventDefault(); void submitCheckIn(manualCode, dashboardEvent.id); }}><label>CÓDIGO DE ENTRADA<input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Pega o escribe el código" required /></label><button className="builder-button">CONFIRMAR ASISTENCIA</button></form></div>{scanStatus && <p className="checkin-status" role="status">{scanStatus}</p>}</section>
                </section> : <>
                <div className="admin-console-heading"><div><p>{dashboardEvent.status === 'ARCHIVED' ? 'EVENTO FINALIZADO' : 'DASHBOARD DEL EVENTO'}</p><h2>{dashboardEvent.name}</h2><span>{dashboardEvent.venue} · {dashboardEvent.hallName ?? 'Salón sin configurar'}</span></div><div className="admin-console-heading-actions"><button type="button" className="admin-show-attendees" onClick={() => { setSelectedDashboardEventId(''); setScanningEventId(''); setScanStatus(''); }}>← TODOS LOS EVENTOS</button>{dashboardEvent.status === 'PUBLISHED' && <button type="button" className="admin-finish-event-button" disabled={closingEventId === dashboardEvent.id} onClick={() => void finishEvent(dashboardEvent.id)}>{closingEventId === dashboardEvent.id ? 'FINALIZANDO…' : 'TERMINAR EVENTO'}</button>}<button className="builder-button" onClick={() => { setSelectedDashboardEventId(''); setEditingEventId(''); setCustomQuestions([]); setQuestionOrder(fields.map(([key]) => key)); setVenue(''); setHallName(''); setCreating(true); setLink(''); setNotice(''); }}>+ CREAR EVENTO</button></div></div>
                <div className="admin-kpi-grid">
                  <article><span>INSCRITOS CONFIRMADOS</span><strong>{eventRegistrations}</strong><small>{dashboardEvent?.name ?? 'Elige un evento abajo'}</small></article>
                  <article className="admin-kpi-hot"><span>AFORO OCUPADO</span><strong>{eventCapacity ? <>{capacityPercent}<i>%</i></> : '—'}</strong><small>{eventRegistrations} de {eventCapacity} butacas</small></article>
                  <article><span>BUTACAS DISPONIBLES</span><strong>{eventAvailable}</strong><small>{dashboardEvent?.hallName ?? 'Salón sin configurar'}</small></article>
                  <article><span>ASISTENTES QUE INGRESARON</span><strong>{eventCheckIns}</strong><small>Registrados en puerta</small></article>
                </div>
                <div className="admin-console-grid">
                  <section className="admin-console-events" id="admin-event-tools">
                    <div className="admin-list-heading"><div><span aria-hidden="true">&#10022;</span><h3>GESTIÓN DE {dashboardEvent.name.toLocaleUpperCase('es-BO')}</h3><small>Herramientas y registros de este evento.</small></div><button onClick={() => void loadEvents(token)}>↻ ACTUALIZAR</button></div>
                    <article className="admin-event-card is-dashboard-event">
                      <div className="admin-event-top"><div><span className="admin-card-kicker">{dashboardEvent.status === 'PUBLISHED' ? '● PUBLICADO' : dashboardEvent.status === 'DRAFT' ? 'BORRADOR' : 'ARCHIVADO'}</span><h3>{dashboardEvent.name}</h3></div><a href={`/e/${dashboardEvent.slug}?preview=1`} target="_blank" rel="noreferrer">PREVISUALIZAR INSCRIPCIÓN ↗</a></div><div className="admin-registration-link"><span>{typeof window !== 'undefined' ? `${window.location.origin}/e/${dashboardEvent.slug}` : `/e/${dashboardEvent.slug}`}</span><button type="button" onClick={() => void copyRegistrationLink(dashboardEvent.id, dashboardEvent.slug)}>{copiedLinkEventId === dashboardEvent.id ? 'COPIADO ✓' : 'COPIAR LINK'}</button></div>
                      <p className="admin-event-meta">{new Date(dashboardEvent.startsAt).toLocaleString('es-BO')} · {dashboardEvent.venue}</p>
                      <div className="admin-stats"><div><span>SALÓN</span><strong>{dashboardEvent.hallName || 'Sin salón'}</strong></div><div><span>CAPACIDAD</span><strong>{dashboardEvent.seatCount} butacas</strong></div><div><span>OCUPADOS</span><strong>{dashboardEvent.occupiedSeats}</strong></div><div><span>INSCRITOS · EN VIVO</span><strong>{dashboardEvent.registrationCount}</strong></div><div><span>INGRESARON</span><strong>{dashboardEvent.checkedInCount} / {dashboardEvent.registrationCount}</strong></div></div>
                      {dashboardEvent.seatCount === 0 && <form className="existing-hall-form" onSubmit={(event) => void configureHall(event, dashboardEvent.id)}><strong>Este evento todavía no tiene butacas.</strong><label>Nombre del salón<input name="hallName" defaultValue="Auditorio principal" required /></label><div className="builder-row"><label>Filas<input name="seatRows" type="number" min="1" max="30" defaultValue="5" required /></label><label>Butacas por fila<input name="seatColumns" type="number" min="1" max="40" defaultValue="8" required /></label></div><button className="admin-show-attendees">Crear mapa de butacas</button></form>}
                      <div className="admin-event-actions">{isAdministrator && <button type="button" className="admin-show-attendees" disabled={dashboardEvent.status === 'ARCHIVED'} onClick={() => openEventEditor(dashboardEvent)}>EDITAR EVENTO</button>}<a className="admin-show-attendees admin-response-link" href={`/admin/forms/${dashboardEvent.id}/responses`}>VER RESPUESTAS ↗</a><button type="button" className="admin-show-attendees" onClick={() => { setScanStatus('Apunta la cámara al QR de este evento.'); setScanningEventId(scanningEventId === dashboardEvent.id ? '' : dashboardEvent.id); }}>{scanningEventId === dashboardEvent.id ? 'CERRAR ESCÁNER' : 'ESCANEAR ENTRADAS'}</button>{isAdministrator && <button type="button" className="admin-show-attendees admin-delete-event" disabled={deletingEventId === dashboardEvent.id} onClick={() => void deleteEventPermanently(dashboardEvent)}>{deletingEventId === dashboardEvent.id ? 'ELIMINANDO…' : 'ELIMINAR EVENTO'}</button>}</div>
                      {scanningEventId === dashboardEvent.id && <div className="event-scanner"><video className="checkin-camera" ref={videoRef} muted playsInline /><form className="checkin-manual" onSubmit={(event) => { event.preventDefault(); void submitCheckIn(manualCode, dashboardEvent.id); }}><label>CÓDIGO QR<input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Ingresar código manual" /></label><button className="admin-show-attendees">Confirmar asistencia</button></form>{scanStatus && <p className="checkin-status" role="status">{scanStatus}</p>}</div>}
                    </article>
                    <section className="admin-attendee-table-panel" id="admin-attendees"><div className="admin-attendee-table-heading"><div><h3>INSCRITOS EN ESTE EVENTO</h3><span>{dashboardEvent?.name ?? 'Elige un evento arriba'} · {dashboardRegistrations.length} personas registradas</span></div><button type="button" onClick={() => void exportRegistrationsCsv().catch((error) => setNotice(error instanceof Error ? error.message : "No se pudo descargar la lista."))} disabled={!dashboardEvent}>↧ DESCARGAR LISTA</button></div><label className="admin-attendee-search">⌕ <input value={attendeeSearch} onChange={(event) => setAttendeeSearch(event.target.value)} placeholder="Buscar por nombre, correo o código" /></label><div className="admin-attendee-table-scroll"><table className="admin-attendee-table"><thead><tr><th>CÓDIGO</th><th>PARTICIPANTE</th><th>CONTACTO</th><th>FECHA</th><th>BUTACA</th><th>ESTADO</th></tr></thead><tbody>{visibleAttendees.map((item) => <tr key={item.id}><td className="admin-attendee-id">{item.confirmationCode.slice(-6)}</td><td><b>{item.attendee.firstName} {item.attendee.lastName}</b><small>{item.attendee.occupation ?? 'ASISTENTE TEDxUMSA'}</small></td><td>{item.attendee.email}<small>{item.attendee.phone ?? ''}</small></td><td>{new Date(item.createdAt).toLocaleDateString('es-BO')}</td><td>{item.seat ? `FILA ${item.seat.rowLabel} · ${item.seat.seatLabel}` : 'GENERAL'}</td><td><span className={`admin-registration-status ${item.status === 'CONFIRMED' ? 'confirmed' : ''}`}>{item.status === 'CONFIRMED' ? '● CONFIRMADO' : item.status}</span></td></tr>)}{visibleAttendees.length === 0 && <tr><td colSpan={6}>{dashboardRegistrations.length ? 'No hay coincidencias con esa búsqueda.' : 'Todavía no hay personas inscritas en este evento.'}</td></tr>}</tbody></table></div><button type="button" className="admin-show-attendees" onClick={() => void loadMoreRegistrations()} disabled={loadingMoreRegistrations || !registrationsHasMore}>{loadingMoreRegistrations ? "CARGANDO..." : "CARGAR MÁS INSCRIPCIONES"}</button></section>
                  </section>
                  <aside className="admin-console-aside"><section><div className="admin-aside-heading"><h3>OCUPACIÓN DEL EVENTO</h3><span>{dashboardEvent?.slug.toUpperCase() ?? 'AFORO'}</span></div>{!dashboardEvent ? <p>Publica tu primer evento para ver la ocupación.</p> : <div className="admin-occupancy-item"><div><b>{dashboardEvent.name}</b><span>{dashboardEvent.occupiedSeats} / {dashboardEvent.seatCount} BUTACAS</span></div><div className="admin-occupancy-track"><i style={{ width: `${dashboardEvent.seatCount ? Math.min(100, Math.round((dashboardEvent.occupiedSeats / dashboardEvent.seatCount) * 100)) : 0}%` }} /></div><small>{dashboardEvent.hallName ?? 'Salón sin configurar'} · {dashboardEvent.occupiedSeats} ocupadas</small></div>}<div className="admin-occupancy-total"><span>INSCRITOS EN ESTE EVENTO</span><b>{eventRegistrations}</b></div></section>
                    <section className="admin-event-status"><div className="admin-aside-heading"><h3>ESTADO DEL EVENTO</h3><i /></div><div className="admin-status-grid"><div><span>INSCRITOS</span><b>{eventRegistrations}</b></div><div><span>ASISTIERON</span><b>{eventCheckIns}</b></div><div><span>AFORO</span><b>{eventCapacity}</b></div><div><span>LIBRES</span><b>{eventAvailable}</b></div></div><p>{dashboardEvent.status === 'ARCHIVED' ? 'EVENTO FINALIZADO' : '● SINCRONIZACIÓN EN TIEMPO REAL ACTIVA'}</p></section>
                    <section className="admin-collab-panel" id="admin-collaborators"><div className="admin-aside-heading"><h3>COLABORADORES</h3><span>{collaborators.length}</span></div><p>Personas que apoyan con la inscripción de este evento.</p>{dashboardEvent.status === 'PUBLISHED' && <><a className="admin-collab-portal-link" href="/colaborador" target="_blank" rel="noreferrer">PORTAL DE COLABORADORES ↗</a><form onSubmit={(event) => void addCollaborator(event, dashboardEvent.id)}><label>Nombre<input name="name" required maxLength={120} placeholder="Nombre completo" /></label><label>Correo<input name="email" type="email" required placeholder="persona@correo.com" /></label><label>Contraseña temporal<input name="password" type="password" minLength={12} required autoComplete="new-password" placeholder="Mínimo 12 caracteres" /></label>{isAdministrator && <label>Rol para este evento<select name="role" defaultValue="COLLABORATOR"><option value="COLLABORATOR">Colaborador</option><option value="ORGANIZER">Organizador del evento</option></select></label>}<button type="submit" className="admin-show-attendees">+ AGREGAR COLABORADOR</button></form></>}{collaboratorNotice && <p className="admin-collab-notice" role="status">{collaboratorNotice}</p>}<div className="admin-collab-list">{collaborators.map((person) => <div key={person.id}><span><b>{person.name}</b><small>{person.email}</small></span><button type="button" aria-label={`Quitar a ${person.name}`} onClick={() => void removeCollaborator(dashboardEvent.id, person)}>×</button></div>)}{collaborators.length === 0 && <small>Aún no hay colaboradores.</small>}</div></section>
                    {dashboardEvent.status === 'ARCHIVED' && <section className="admin-event-status"><div className="admin-aside-heading"><h3>ENCUESTA DE SATISFACCIÓN</h3><span>{satisfactionReport?.responseCount ?? 0} RESPUESTAS</span></div><p>{eventCloseNotice || (satisfactionReport?.surveyDelivery.pending ? satisfactionReport.surveyDelivery.emailConfigured ? `Quedan ${satisfactionReport.surveyDelivery.pending} correos pendientes de envío.` : 'Configura RESEND_API_KEY y MAIL_FROM en .env para enviar las encuestas.' : satisfactionReport?.surveyDelivery.eligible ? `Encuesta enviada a ${satisfactionReport.surveyDelivery.sent} asistentes acreditados.` : 'No hubo asistentes acreditados para encuestar.')}</p>{satisfactionReport?.surveyDelivery.pending ? <button type="button" className="admin-show-attendees" disabled={closingEventId === dashboardEvent.id} onClick={() => void finishEvent(dashboardEvent.id, true)}>{closingEventId === dashboardEvent.id ? 'REENVIANDO…' : `REENVIAR ${satisfactionReport.surveyDelivery.pending} ENCUESTAS PENDIENTES`}</button> : null}</section>}
                  </aside>
                </div>
                {dashboardEvent.status === 'ARCHIVED' && satisfactionReport && <section className="admin-satisfaction-report"><div className="admin-list-heading"><div><span aria-hidden="true">&#10022;</span><h3>RESULTADOS DE SATISFACCIÓN</h3><small>Respuestas de asistentes que acreditaron su entrada.</small></div><span>{satisfactionReport.responseCount} respuestas</span></div><div className="admin-satisfaction-kpis"><article><span>CALIFICACIÓN PROMEDIO</span><b>{satisfactionReport.averageRating}<small>/ 5</small></b></article><article><span>RECOMENDARÍAN EL EVENTO</span><b>{satisfactionReport.averageRecommendation}<small>/ 10</small></b></article></div><div className="admin-satisfaction-distribution">{satisfactionReport.ratingDistribution.map((item) => <div key={item.rating}><span>{item.rating} estrellas</span><i><b style={{ width: `${satisfactionReport.responseCount ? item.count / satisfactionReport.responseCount * 100 : 0}%` }} /></i><strong>{item.count}</strong></div>)}</div><div className="admin-satisfaction-comments">{satisfactionReport.responses.map((item, index) => <article key={`${item.attendee.firstName}-${index}`}><b>{item.attendee.firstName} {item.attendee.lastName} · {item.rating}/5</b>{item.highlights && <p><strong>Lo mejor:</strong> {item.highlights}</p>}{item.improvements && <p><strong>Para mejorar:</strong> {item.improvements}</p>}</article>)}{satisfactionReport.responseCount === 0 && <p>Todavía no hay respuestas de satisfacción.</p>}</div></section>}
                </>}
              </div>
            </div>
          </section>
        ) : (
          <div className={editingEvent ? 'admin-console-shell admin-edit-event-shell' : 'admin-create-event-shell'}>
          {editingEvent && <AdminSidebar active="summary" eventId={editingEvent.id} />}
          <div className={editingEvent ? 'admin-console-content' : ''}>
          {editingEvent && <div className="admin-console-topline"><div><b>ADMINISTRACIÓN TEDxUMSA</b><span>/ EDITAR EVENTO</span></div><a href={`/admin/forms?section=summary&eventId=${encodeURIComponent(editingEvent.id)}`}>VOLVER AL RESUMEN</a></div>}
          <form className="builder-form" onSubmit={createForm}>
            <button type="button" className="admin-back" onClick={() => { setCreating(false); setEditingEventId(''); setNotice(''); }}>← Volver al panel</button>
            <h2>{editingEvent ? 'Editar evento y preguntas' : 'Datos del evento'}</h2>
            <label>Nombre del evento<input name="name" defaultValue={editingEvent?.name ?? ''} placeholder="Ideas para el futuro" required /></label>
            <label>Enlace corto<input name="slug" defaultValue={editingEvent?.slug ?? ''} placeholder="ideas-para-el-futuro" required readOnly={Boolean(editingEvent)} /><small>{editingEvent ? 'Se conserva para que los enlaces y tickets existentes sigan funcionando.' : 'El enlace público del formulario será /e/nombre-del-evento.'}</small></label>
            <label>Descripción<textarea name="description" defaultValue={editingEvent?.description ?? ''} rows={4} required /></label>
            <div className="builder-row"><label>Ubicación<input name="venue" value={venue} onChange={(event) => setVenue(event.target.value)} required /></label><label>Fecha y hora de inicio<input name="startsAt" type="datetime-local" defaultValue={localDateTime(editingEvent?.startsAt)} required /></label></div><div className="builder-row"><label>Fecha y hora de finalización (opcional)<input name="endsAt" type="datetime-local" defaultValue={localDateTime(editingEvent?.endsAt)} /></label><label>Enlace del grupo de WhatsApp (opcional)<input name="whatsappGroupUrl" type="url" defaultValue={editingEvent?.whatsappGroupUrl ?? ''} maxLength={2048} placeholder="https://chat.whatsapp.com/..." /><small>Se mostrará en el pase únicamente después de completar la inscripción.</small></label></div>
            {!editingEvent && <section className="hall-builder">
              {savedLayouts.length > 0 && <label>Usar un salón guardado<select value={savedLayoutId} onChange={(event) => useSavedLayout(event.target.value)}><option value="">Crear un salón nuevo</option>{savedLayouts.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.venue} ({item.seatRows} x {item.seatColumns})</option>)}</select><small>Al elegirlo se copiarán el lugar y la distribución de butacas.</small></label>}
              <h2>Salón y distribución de butacas</h2>
              <label>Nombre del salón<input name="hallName" value={hallName} onChange={(event) => setHallName(event.target.value)} placeholder="Auditorio principal" required /></label>
              <div className="builder-row">
                <label>Filas (máximo 30)<input name="seatRows" type="number" min="1" max="30" value={seatRows} onChange={(e) => setSeatRows(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} required /></label>
                <label>Butacas por fila (máximo 40)<input name="seatColumns" type="number" min="1" max="40" value={seatColumns} onChange={(e) => setSeatColumns(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} required /></label>
              </div>
              <p className="builder-help">Selecciona una herramienta y haz clic una vez. Tambien puedes convertir filas enteras en pasillos.</p>
              <div className="seat-tools"><div className="seat-tool-modes"><button type="button" className={seatTool === 'CYCLE' ? 'active' : ''} onClick={() => setSeatTool('CYCLE')}>Editar individual</button><button type="button" className={seatTool === 'AVAILABLE' ? 'active' : ''} onClick={() => setSeatTool('AVAILABLE')}>Disponible</button><button type="button" className={seatTool === 'BLOCKED' ? 'active' : ''} onClick={() => setSeatTool('BLOCKED')}>Bloquear</button><button type="button" className={seatTool === 'AISLE' ? 'active' : ''} onClick={() => setSeatTool('AISLE')}>Pasillo</button></div><div className="seat-tool-actions"><button type="button" onClick={addCenterAisle}>Anadir pasillo central</button><button type="button" onClick={clearAisles}>Quitar pasillos</button></div></div>
              <div className="hall-preview-wrap"><div className="hall-stage">ESCENARIO</div>
                <div className="hall-preview-column-actions" style={{ gridTemplateColumns: `28px 28px repeat(${seatColumns}, 38px)` }}><span /><span />{Array.from({ length: seatColumns }, (_, column) => <button type="button" key={column} onClick={() => markColumnAsAisle(column)} title={`Convertir toda la columna ${column + 1} en pasillo`} aria-label={`Convertir toda la columna ${column + 1} en pasillo`}>&#8595;</button>)}</div>
                {Array.from({ length: seatRows }, (_, row) => <div className="hall-preview-row" key={row} style={{ gridTemplateColumns: `28px 28px repeat(${seatColumns}, 38px)` }}><span className="hall-row-label">{rowLabel(row)}</span><button type="button" className="aisle-row-action" onClick={() => markRowAsAisle(row)} title={`Convertir toda la fila ${rowLabel(row)} en pasillo`} aria-label={`Convertir toda la fila ${rowLabel(row)} en pasillo`}>&#8596;</button>
                  {Array.from({ length: seatColumns }, (_, column) => {
                    const mode = seatModes[`${row}:${column}`] ?? 'AVAILABLE';
                    return <button className={`seat-dot seat-${mode.toLowerCase()}`} type="button" key={column} title={`Fila ${rowLabel(row)}, asiento ${column + 1}: ${mode}`} aria-label={`Fila ${rowLabel(row)}, asiento ${column + 1}: ${mode}`} onClick={() => setSeat(row, column)}>{mode === 'AISLE' ? '·' : column + 1}</button>;
                  })}
                </div>)}
              </div>
              <div className="seat-key"><span><i className="key-available" />Disponible</span><span><i className="key-blocked" />Bloqueada</span><span><i className="key-aisle" />Pasillo</span></div>
            </section>}
            <section className="custom-question-builder"><div><h2>Preguntas del formulario</h2><p>Activa, ordena y edita las preguntas que verá quien se inscriba.</p></div>
              {questionOrder.map((key, index) => {
                const standard = fields.find(([fieldKey]) => fieldKey === key);
                const custom = customQuestions.find((item) => item.key === key);
                if (!standard && !custom) return null;
                return <div className="custom-question-row form-question-row" key={key}>
                  <span className="form-question-number">{String(index + 1).padStart(2, '0')}</span>
                  <label className="builder-check"><input type="checkbox" name={key} checked={questionOrder.includes(key)} onChange={(event) => { if (!event.target.checked) setQuestionOrder((current) => current.filter((item) => item !== key)); }} />Incluir</label>
                  {standard ? <strong>{standard[1]}</strong> : <label className="form-question-label">Pregunta personalizada<input value={custom?.label ?? ''} maxLength={160} onChange={(event) => setCustomQuestions((current) => current.map((item) => item.key === key ? { ...item, label: event.target.value } : item))} placeholder="Escribe tu pregunta" /></label>}
                  <div className="form-question-actions"><button type="button" disabled={index === 0} onClick={() => moveQuestion(key, -1)} aria-label="Subir pregunta">↑</button><button type="button" disabled={index === questionOrder.length - 1} onClick={() => moveQuestion(key, 1)} aria-label="Bajar pregunta">↓</button>{custom && <button type="button" onClick={() => { setCustomQuestions((current) => current.filter((item) => item.key !== key)); setQuestionOrder((current) => current.filter((item) => item !== key)); }}>Quitar</button>}</div>
                </div>;
              })}
              {fields.filter(([key]) => !questionOrder.includes(key)).map(([key, label]) => <label className="builder-check" key={key}><input type="checkbox" onChange={() => setQuestionOrder((current) => [...current, key])} />Incluir {label}</label>)}
              <button type="button" className="admin-show-attendees" onClick={() => { const key = `custom_${crypto.randomUUID().replaceAll('-', '')}`; setCustomQuestions((current) => [...current, { key, label: '' }]); setQuestionOrder((current) => [...current, key]); }}>+ Agregar pregunta</button></section>
            <button className="builder-button">{editingEvent ? 'Guardar cambios del evento' : 'Crear formulario y generar enlace'}</button>
          </form>
          </div>
          </div>
        )}
        {notice && <p className="builder-notice" role="status">{notice}</p>}
        {link && <div className="generated-link"><span>ENLACE PÚBLICO</span><a href={link} target="_blank" rel="noreferrer">{link}</a><button onClick={() => navigator.clipboard.writeText(link)}>Copiar enlace</button></div>}
      </section>
    </main>
  );
}

