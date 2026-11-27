'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api-client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type AssignedEvent = { id: string; slug: string; name: string; venue: string; startsAt: string };
type ScannerConstructor = new (options?: { formats?: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> };

export default function CollaboratorPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [message, setMessage] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedLinkEventId, setCopiedLinkEventId] = useState('');
  const [scanningEvent, setScanningEvent] = useState<AssignedEvent | null>(null);
  const [manualCode, setManualCode] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  async function copyRegistrationLink(item: AssignedEvent) {
    const url = `${window.location.origin}/e/${item.slug}`;
    try { await navigator.clipboard.writeText(url); setCopiedLinkEventId(item.id); window.setTimeout(() => setCopiedLinkEventId((id) => id === item.id ? '' : id), 2500); }
    catch { setMessage(`No se pudo copiar automáticamente. Copia este enlace: ${url}`); }
  }

  async function loadEvents() {
    setLoading(true);
    try {
      const response = await apiFetch(`${API}/events/collaborator`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudieron cargar tus eventos.');
      setEvents(Array.isArray(data) ? data : []); setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo conectar con el servidor.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    window.sessionStorage.removeItem('tedxumsa-collaborator-token');
    void apiFetch(`${API}/auth/session`).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.user?.role !== 'COLLABORATOR') return;
      setToken('cookie-session'); await loadEvents();
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!scanningEvent) return;
    const eventId = scanningEvent.id;
    let stopped = false;
    let stream: MediaStream | undefined;
    let frame = 0;
    async function startScanner() {
      const Detector = (window as Window & { BarcodeDetector?: ScannerConstructor }).BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) { setScanMessage('Este navegador no permite escanear con cámara. Ingresa el código manualmente.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream; await video.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const scan = async () => {
          if (stopped || !video) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              stopped = true; setManualCode(codes[0].rawValue);
              await verifyCheckIn(eventId, codes[0].rawValue); setScanningEvent(null); return;
            }
          } catch { /* Continúa el escaneo mientras el QR no esté enfocado. */ }
          frame = window.requestAnimationFrame(() => void scan());
        };
        void scan();
      } catch { setScanMessage('No se pudo abrir la cámara. Revisa el permiso o ingresa el código manualmente.'); }
    }
    void startScanner();
    return () => { stopped = true; window.cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scanningEvent]);

  async function verifyCheckIn(eventId: string, rawCode: string) {
    const code = rawCode.trim(); if (!code) return;
    setScanMessage('Verificando QR…');
    try {
      const response = await apiFetch(`${API}/events/collaborator/${encodeURIComponent(eventId)}/check-in/${encodeURIComponent(code)}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo acreditar el código.');
      const attendee = `${data.attendee.firstName} ${data.attendee.lastName}`;
      setScanMessage(data.alreadyCheckedIn ? `${attendee} ya estaba acreditado.` : `Asistencia confirmada: ${attendee} · ${data.event.name}`);
      setManualCode('');
    } catch (error) { setScanMessage(error instanceof Error ? error.message : 'No se pudo verificar el QR.'); }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('Ingresando…');
    try {
      const response = await apiFetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo iniciar sesión.');
      if (data.user?.role !== 'COLLABORATOR') throw new Error('Esta cuenta no tiene rol de colaborador.');
      setToken('cookie-session'); await loadEvents();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); setLoading(false); }
  }

  function logout() { void apiFetch(`${API}/auth/logout`, { method: 'POST' }); window.sessionStorage.removeItem('tedxumsa-collaborator-token'); setToken(''); setEvents([]); setPassword(''); setMessage(''); setScanningEvent(null); }

  return <main className="collaborator-page">
    <header className="builder-header"><a className="builder-brand" href="/">TED<span>x</span>UMSA</a><span>PORTAL DE COLABORADORES</span>{token && <button className="admin-logout" onClick={logout}>Cerrar sesión</button>}</header>
    <section className="collaborator-main">{!token ? <form className="builder-form" onSubmit={(event) => void login(event)}><p className="builder-kicker">EQUIPO DE INSCRIPCIONES</p><h1>Acceso de<br /><em>colaborador.</em></h1><label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="builder-button" disabled={loading}>{loading ? 'INGRESANDO…' : 'INGRESAR'}</button>{message && <p className="builder-notice" role="status">{message}</p>}</form> : <>
      <div className="collaborator-heading"><p className="builder-kicker">EVENTOS ASIGNADOS</p><h1>Apoya con las<br /><em>inscripciones.</em></h1><p>Abre la inscripción del evento o acredita a las personas que ingresan.</p></div>
      {message && <p className="builder-notice" role="status">{message}</p>}
      {scanMessage && <p className="builder-notice" role="status">{scanMessage}</p>}
      {scanningEvent && <section className="builder-form collaborator-scanner"><h2>Acceso · {scanningEvent.name}</h2><video ref={videoRef} autoPlay muted playsInline aria-label="Cámara para leer el QR" /><form onSubmit={(event) => { event.preventDefault(); void verifyCheckIn(scanningEvent.id, manualCode); }}><label>Código de confirmación<input value={manualCode} onChange={(event) => setManualCode(event.target.value)} autoComplete="off" /></label><button className="builder-button">ACREDITAR</button></form><button type="button" className="admin-show-attendees" onClick={() => setScanningEvent(null)}>CERRAR ESCÁNER</button></section>}
      {loading ? <p>Cargando eventos…</p> : events.length ? <div className="collaborator-event-list">{events.map((item) => <article key={item.id}><div><span>{new Date(item.startsAt).toLocaleString('es-BO')}</span><h2>{item.name}</h2><p>{item.venue}</p></div><div className="collaborator-event-actions"><button type="button" className="admin-show-attendees" onClick={() => void copyRegistrationLink(item)}>{copiedLinkEventId === item.id ? 'ENLACE COPIADO ✓' : 'COPIAR ENLACE'}</button><button type="button" className="admin-show-attendees" onClick={() => { setScanMessage('Apunta la cámara al QR de este evento.'); setScanningEvent(item); }}>ESCANEAR QR</button><a className="builder-button" href={`/e/${item.slug}`} target="_blank" rel="noreferrer">ABRIR INSCRIPCIÓN ↗</a></div></article>)}</div> : <div className="admin-empty"><p>No tienes eventos activos asignados.</p><small>Contacta al administrador para que te agregue a un evento.</small></div>}
    </>}</section>
  </main>;
}
