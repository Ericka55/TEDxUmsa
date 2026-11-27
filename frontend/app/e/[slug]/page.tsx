'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const labels: Record<string, string> = {
  institution: 'Institución o universidad',
  referralSource: '¿Cómo te enteraste del evento?',
  expectations: '¿Qué expectativas tienes sobre TEDxUMSA?',
  interests: '¿Qué temas te interesan?',
  perspective: '¿Qué perspectiva o idea te gustaría compartir?',
  comments: 'Comentarios adicionales',
};

type SeatInfo = { id: string; rowLabel: string; seatLabel: string; rowOrder: number; columnOrder: number; status: 'AVAILABLE' | 'BLOCKED'; occupied: boolean };
type FormField = string | { key: string; label: string };
type EventInfo = { slug: string; name: string; description: string; venue: string; hallName: string | null; hallPhotoUrl: string | null; seatRows: number | null; seatColumns: number | null; startsAt: string; endsAt: string | null; formFields: FormField[]; seats: SeatInfo[] };

export default function PublicRegistrationPage() {
  const params = useParams<{ slug: string }>();
  const [info, setInfo] = useState<EventInfo | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [registeredSeat, setRegisteredSeat] = useState<{ rowLabel: string; seatLabel: string } | null>(null);
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeeOccupation, setAttendeeOccupation] = useState('');
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('');
  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [registrationStep, setRegistrationStep] = useState<1 | 2>(1);
  const [registrationDraft, setRegistrationDraft] = useState<Record<string, string>>({});
  const [introVisible, setIntroVisible] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    loadEvent();
  }, [params.slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroVisible(false), 2400);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetch(`${API}/events/${encodeURIComponent(params.slug)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((data) => { if (data) setInfo({ ...data, seats: Array.isArray(data.seats) ? data.seats : [] }); })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [params.slug]);

  function loadEvent() {
    setSelectedSeatId('');
    setError('');
    const preview = new URLSearchParams(window.location.search).get('preview') === '1';
    setPreviewMode(preview);
    fetch(`${API}/events/${encodeURIComponent(params.slug)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? 'No encontramos este formulario.');
        setInfo({ ...data, seats: Array.isArray(data.seats) ? data.seats : [] });
        const savedCode = preview ? null : window.localStorage.getItem(`tedxumsa-ticket:${params.slug}`);
        if (savedCode) {
          try {
            const passResponse = await fetch(`${API}/events/${encodeURIComponent(params.slug)}/registrations/${encodeURIComponent(savedCode)}`);
            if (!passResponse.ok) {
              if (passResponse.status === 404) window.localStorage.removeItem(`tedxumsa-ticket:${params.slug}`);
              return;
            }
            const pass = await passResponse.json();
            setWhatsappGroupUrl(pass.whatsappGroupUrl ?? '');
            setRegisteredSeat(pass.seat ?? null);
            setAttendeeName(pass.attendee ? `${pass.attendee.firstName} ${pass.attendee.lastName}` : 'Asistente TEDxUMSA');
            setAttendeeOccupation('Asistente TEDxUMSA');
            setQrImage(await QRCode.toDataURL(pass.confirmationCode, { width: 360, margin: 3, errorCorrectionLevel: 'H', color: { dark: '#111111', light: '#ffffff' } }));
            setConfirmation(pass.confirmationCode);
          } catch { /* Keep the form available if the saved pass cannot be checked right now. */ }
        }
      })
      .catch((problem) => setError(problem.message ?? 'No se pudo cargar el evento.'));
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (registrationStep === 1) {
      const form = new FormData(event.currentTarget);
      setRegistrationDraft(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'privacy').map(([key, value]) => [key, String(value)])));
      setRegistrationStep(2);
      return;
    }
    if (previewMode) {
      setError('Estás viendo una vista previa. No se enviaron datos ni se creó una inscripción.');
      return;
    }
    const customAnswers: Record<string, string> = {};
    for (const field of info?.formFields ?? []) if (typeof field !== 'string' && registrationDraft[field.key]) customAnswers[field.key] = registrationDraft[field.key];
    const data = {
      email: registrationDraft.email, firstName: registrationDraft.firstName, lastName: registrationDraft.lastName,
      phone: registrationDraft.phone, occupation: registrationDraft.occupation, institution: registrationDraft.institution,
      age: registrationDraft.age || undefined, referralSource: registrationDraft.referralSource,
      expectations: registrationDraft.expectations, interests: registrationDraft.interests,
      perspective: registrationDraft.perspective, comments: registrationDraft.comments,
      customAnswers, seatId: selectedSeatId || undefined,
    };
    if (info?.seatRows && info.seatRows > 0 && !selectedSeatId) {
      setError('Selecciona una butaca disponible para continuar.');
      return;
    }
    try {
      const response = await fetch(`${API}/events/${encodeURIComponent(params.slug)}/registrations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'No se pudo completar la inscripción.');
      const generatedQr = await QRCode.toDataURL(result.confirmationCode, { width: 360, margin: 3, errorCorrectionLevel: 'H', color: { dark: '#111111', light: '#ffffff' } });
      window.localStorage.setItem(`tedxumsa-ticket:${params.slug}`, result.confirmationCode);
      setWhatsappGroupUrl(result.whatsappGroupUrl ?? '');
      setRegisteredSeat(result.seat ?? null);
      setAttendeeName(`${registrationDraft.firstName ?? ''} ${registrationDraft.lastName ?? ''}`.trim());
      setAttendeeOccupation(registrationDraft.occupation ?? '');
      setQrImage(generatedQr);
      setConfirmation(result.confirmationCode);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se pudo completar la inscripción.');
    }
  }

  if (introVisible) return <main className="tedx-intro" aria-label="TEDxUMSA"><div className="tedx-intro-wordmark"><span>TED</span><b>x</b><span>UMSA</span></div><p>IDEAS QUE MERECEN SER COMPARTIDAS</p></main>;
  if (confirmation) {
    const selectedSeat = registeredSeat ?? info?.seats.find((seat) => seat.id === selectedSeatId) ?? null;
    return <main className="public-event confirmation-page confirmation-editorial">
      <header className="registration-nav confirmation-nav">
        <div className="registration-wordmark">TED<span>x</span>UMSA<small>X = INDEPENDENTLY ORGANIZED TED EVENT</small></div>
        <span className="registration-edition"><i /> EDICIÓN TEDxUMSA</span>
        <nav><a className="current" href="#pase">INSCRIPCIÓN</a><a href="#pase">EL EVENTO</a></nav>
      </header>
      <div className="confirmation-progress" aria-label="Inscripción completada"><span>01&nbsp; REGISTRO DE DATOS</span><i></i><span>02&nbsp; SELECCIÓN DE BUTACA</span><i></i><strong>03&nbsp; CONFIRMACIÓN FINALIZADA <b>✓</b></strong></div>
      <section className="confirmation-title"><div><span>▰ TRANSACCIÓN APROBADA // PROTOCOLO TEDxUMSA</span><h1>¡TU INSCRIPCIÓN<br /><em>FUE CONFIRMADA!</em></h1></div><aside className="confirmation-welcome"><p>Bienvenido a la comunidad TEDxUMSA. Tu lugar para presenciar la colisión de ideas y el caos transformador está oficialmente asegurado.</p><b>✉ PASE DISPONIBLE EN ESTA PANTALLA</b></aside></section>
      <section className="confirmation-ticket-layout" id="pase">
        <article className="confirmation-ticket-card"><div className="confirmation-ticket-brand"><b>TED<span>x</span>UMSA</b><small>OFFICIAL PASS <i>ED. TEDxUMSA</i></small></div><div className="confirmation-ticket-event"><span>ACCESO OFICIAL</span><h2>{info?.name ?? 'TEDxUMSA'}</h2><p>IDEAS QUE MERECEN SER COMPARTIDAS</p></div><div className="confirmation-ticket-footer"><div><span>ORGANIZADOR</span><b>TEDxUMSA</b><small>{info?.venue ?? 'Bolivia'}</small></div><div><span>TIPO DE PASE</span><b>{selectedSeat ? 'ASIENTO ASIGNADO' : 'ENTRADA GENERAL'}</b></div></div></article>
        <article className="confirmation-details-card"><div className="confirmation-ticket-meta"><b>● CONFIRMADO & REGISTRADO</b><span>CÓDIGO: {confirmation}</span></div><div className="confirmation-attendee"><span>TITULAR ACREDITADO</span><h2>{attendeeName || 'Asistente TEDxUMSA'}</h2><p>CARRERA / PROFESIÓN: {attendeeOccupation || 'ASISTENTE TEDxUMSA'}</p></div><div className="confirmation-detail-grid"><div><span>FECHA</span><b>{info ? new Date(info.startsAt).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</b></div><div><span>HORARIO</span><b className="confirmation-opening-time">{info ? new Date(info.startsAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—'}{info?.endsAt ? ` — ${new Date(info.endsAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}` : ''}</b></div><div><span>INGRESO</span><b>{info?.venue ?? 'RECINTO DEL EVENTO'}</b><small>Consulta la señalización al llegar.</small></div></div>{selectedSeat && <div className="confirmation-seat-feature"><div><span>ASIGNACIÓN PREFERENCIAL</span><h3>FILA {selectedSeat.rowLabel} — BUTACA {selectedSeat.seatLabel}</h3><p>UBICACIÓN: {info?.hallName ?? 'SALÓN PRINCIPAL'}</p></div><b>{selectedSeat.rowLabel} · {selectedSeat.seatLabel}</b></div>}<div className="confirmation-code"><span>EXPEDIDO POR SISTEMA TEDxUMSA AUTORIZADO</span><b>{confirmation}</b><button type="button" onClick={() => { void navigator.clipboard.writeText(confirmation).then(() => { setCodeCopied(true); window.setTimeout(() => setCodeCopied(false), 1800); }); }}>{codeCopied ? 'COPIADO ✓' : 'COPIAR CÓDIGO'}</button></div></article>
        <aside className="confirmation-qr-card"><span className="qr-corner-mark">⌘</span><p>CONTROL DE ACCESO</p>{qrImage && <img src={qrImage} alt={`Código QR de acceso ${confirmation}`} />}<strong>CHECK-IN TOKEN</strong><small>HASH: {confirmation}</small><div className="confirmation-barcode" aria-label={`Código ${confirmation}`}>{Array.from({ length: 48 }, (_, index) => <i key={index} style={{ width: `${1 + ((confirmation.charCodeAt(index % confirmation.length) + index * 3) % 3)}px` }} />)}</div><small className="confirmation-barcode-code">SCAN AT VENUE GATE 1</small></aside>
      </section>
      {whatsappGroupUrl && <section className="confirmation-whatsapp"><div><span>COMUNIDAD DEL EVENTO</span><h2>Sigamos en contacto.</h2><p>Únete al grupo de WhatsApp para recibir novedades y detalles importantes de la jornada.</p></div><a href={whatsappGroupUrl} target="_blank" rel="noopener noreferrer">UNIRME AL GRUPO <b aria-hidden="true">↗</b></a></section>}
      <div className="confirmation-actions"><button type="button" className="confirmation-action-primary" onClick={() => window.print()}>DESCARGAR TICKET (PDF) ⬇</button><a href={info ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(info.name)}&dates=${encodeURIComponent(new Date(info.startsAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''))}/${encodeURIComponent(new Date(info.endsAt ?? new Date(new Date(info.startsAt).getTime() + 2 * 60 * 60 * 1000)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''))}&location=${encodeURIComponent(info.venue)}` : '#pase'} target="_blank" rel="noreferrer">AGREGAR A CALENDARIO ▣</a><button type="button" onClick={() => { if (navigator.share) void navigator.share({ title: `Mi pase ${info?.name ?? 'TEDxUMSA'}`, text: `Mi código de acceso: ${confirmation}` }); else void navigator.clipboard.writeText(confirmation).then(() => setCodeCopied(true)); }}>COMPARTIR #{info?.slug.toUpperCase() ?? 'TEDxUMSA'} ♧</button></div>
      <section className="confirmation-guidelines"><article><span>01</span><h3>DOCUMENTO Y COMPROBANTE</h3><p>Ten a mano tu documento de identidad y muestra este código QR para validar tu inscripción al ingresar.</p></article><article><span>02</span><h3>CIERRE DE INGRESO</h3><p>Te recomendamos llegar con anticipación. El acceso se valida en la entrada del recinto.</p></article><article><span>03</span><h3>QR PERSONAL</h3><p>Este pase corresponde a una sola persona. No compartas el código para evitar inconvenientes al ingresar.</p></article></section>
      <section className="confirmation-venue"><div className={`confirmation-venue-art${info?.hallPhotoUrl ? ' has-photo' : ''}`} aria-label={info?.hallPhotoUrl ? `Foto del salón ${info.hallName ?? ''}` : 'Ilustración del recinto'}>{info?.hallPhotoUrl ? <img className="confirmation-venue-photo" src={`${API.replace(/\/api\/?$/, '')}${info.hallPhotoUrl}`} alt={`Salón ${info.hallName ?? info.venue}`} /> : <><span className="venue-skyline" aria-hidden="true"></span><span className="venue-building" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></span><span className="venue-foreground" aria-hidden="true"></span></>}<small>{info?.hallName ?? 'TEDxUMSA · BOLIVIA'}</small></div><div className="confirmation-venue-copy"><span>RECINTO OFICIAL // {info?.hallName ?? 'SEDE DEL EVENTO'}</span><h2>{info?.venue ?? 'Nos vemos en el evento.'}</h2><p>{info?.description ?? 'Prepárate para compartir ideas y vivir una experiencia TEDxUMSA.'}</p><b>REVISA LA FECHA Y LLEGA CON ANTICIPACIÓN ↗</b></div></section>
      <footer className="confirmation-footer"><div><b>TED<span>x</span>UMSA</b><small>Ideas que merecen ser compartidas.</small></div><div><span>CONTACTO DIRECTO</span><strong>TEDxUMSA · BOLIVIA</strong></div><div><span>ACCESO PERSONAL</span><strong>{confirmation}</strong></div></footer>
    </main>;
  }
  if (!info) return <main className="public-event"><p className="builder-kicker">TEDxUMSA · REGISTRO</p><h1>{error ? 'Formulario no disponible.' : 'Cargando evento…'}</h1>{error && <p>{error}</p>}</main>;

  const openSeats = info.seats.filter((seat) => seat.status === 'AVAILABLE' && !seat.occupied).length;
  return (
    <main className={`registration-page${registrationStep === 2 ? ' seat-step-page' : ''}`}>
      <header className="registration-nav">
        <div className="registration-wordmark">TED<span>x</span>UMSA<small>X = INDEPENDENTLY ORGANIZED TED EVENT</small></div>
        <span className="registration-edition"><i /> EDICIÓN TEDxUMSA</span>
        <nav><a className="current" href="#registro">INSCRIPCIÓN</a><a href="#evento">EL EVENTO</a></nav>
      </header>
      {previewMode && <div className="registration-preview-notice" role="status"><strong>VISTA PREVIA DEL FORMULARIO</strong><span>Así lo verá una persona antes de inscribirse. Los datos de prueba no se enviarán.</span></div>}
      <div className="registration-progress"><span className={registrationStep === 1 ? 'current' : 'complete'}><b>01</b> INSCRIPCIÓN <small>{registrationStep === 1 ? 'ACTIVO · EN CURSO' : 'COMPLETADO ✓'}</small></span><i className={registrationStep === 2 ? 'active' : ''} /><span className={registrationStep === 2 ? 'current' : ''}><b>02</b> SELECCIÓN DE ASIENTOS <small>{registrationStep === 2 ? 'ACTIVO · EN CURSO' : 'PENDIENTE'}</small></span><i /><span><b>03</b> CONFIRMACIÓN <small>PENDIENTE</small></span></div>
      <section className="registration-hero">
        <div className="registration-hero-copy"><span>{registrationStep === 1 ? '01 / REGISTRO GENERAL // TEDxUMSA' : '02 / LOCALIZACIÓN ESPACIAL // AFORO NUMERADO'}</span><h1>{registrationStep === 1 ? <>INSCRIPCIÓN<br />OFICIAL</> : <>SELECCIÓN<br />DE ASIENTOS</>}</h1>{registrationStep === 2 && <p>{info.venue}{info.hallName ? ` // ${info.hallName}` : ''}</p>}</div>
        <div className="registration-hero-mark" aria-hidden="true"><b>×</b></div>
      </section>
      {registrationStep === 1 ? <div className="registration-content">
        <aside className="registration-event-column" id="evento">
          <span className="registration-section-tag"><i /> EDICIÓN ESPECIAL // CUPOS LIMITADOS</span>
          <p className="registration-brand-line">TEDxUMSA PRESENTA</p>
          <h2>{info.name}</h2>
          <p className="registration-event-description">{info.description}</p>
          <div className="registration-event-facts">
            <div><span>01 // FECHA OFICIAL</span><strong>{new Date(info.startsAt).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })}</strong><small>JORNADA DEL EVENTO</small></div>
            <div><span>02 // HORARIO</span><strong>{new Date(info.startsAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}{info.endsAt ? ` — ${new Date(info.endsAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}` : ''}</strong><small>HORA LOCAL</small></div>
            <div className="registration-venue-fact"><span>03 // RECINTO Y SEDE</span><strong>{info.venue}</strong><small>{info.hallName ?? 'TEDxUMSA · BOLIVIA'}</small></div>
            <div><span>04 // CAPACIDAD</span><strong>{info.seats.length ? `${openSeats} LUGARES` : 'REGISTRO ABIERTO'}</strong><small>{info.seats.length ? 'ASIENTOS DISPONIBLES' : 'CONFIRMACIÓN CON QR'}</small></div>
          </div>
          <div className="registration-protocol"><span>&#9672;</span><div><strong>PROTOCOLO DE ACCESO</strong><p>Completa tus datos para generar tu credencial digital. Presenta el código QR al ingresar al evento.</p></div></div>
        </aside>
        <section className="registration-form-column" id="registro">
          <form className="registration-form" onSubmit={register}>
            <div className="registration-form-heading"><div><span>FORMULARIO OFICIAL // TEDxUMSA</span><h2>Ficha del<br />asistente</h2></div><p>CAMPOS OBLIGATORIOS<br /><b>PASO 01 DE 02</b></p></div>
            <div className="registration-field"><span>01. NOMBRE COMPLETO <i>// ID_NAME</i></span><div className="registration-name-inputs"><input name="firstName" placeholder="Nombre" autoComplete="given-name" defaultValue={registrationDraft.firstName} required /><input name="lastName" placeholder="Apellido" autoComplete="family-name" defaultValue={registrationDraft.lastName} required /></div></div>
            <div className="registration-field-grid">
              <label className="registration-field"><span>02. CORREO ELECTRÓNICO <i>// EMAIL</i></span><input type="email" name="email" placeholder="asistente@correo.com" autoComplete="email" defaultValue={registrationDraft.email} required /></label>
              <label className="registration-field"><span>03. NÚMERO CELULAR <i>// WHATSAPP</i></span><input name="phone" type="tel" placeholder="+591 70000000" autoComplete="tel" defaultValue={registrationDraft.phone} required /></label>
              <label className="registration-field"><span>04. CARRERA / PROFESIÓN <i>// DISCIPLINA</i></span><input name="occupation" placeholder="Ej. Ingeniería de sistemas" defaultValue={registrationDraft.occupation} required /></label>
              <label className="registration-field"><span>05. EDAD <i>// YEARS</i></span><input name="age" type="number" min="1" max="120" placeholder="Edad (opcional)" defaultValue={registrationDraft.age} /></label>
              {info.formFields?.map((field) => { const key = typeof field === 'string' ? field : field.key; const label = typeof field === 'string' ? labels[field] ?? field : field.label; return <label className="registration-field registration-custom-field" key={key}><span>{label.toLocaleUpperCase('es-BO')} <i>// RESPUESTA</i></span><textarea name={key} rows={key === 'comments' ? 4 : 2} placeholder="Escribe tu respuesta aquí..." defaultValue={registrationDraft[key]} /></label>; })}
            </div>
            <label className="registration-privacy"><input type="checkbox" required /><span>Acepto que mis datos se utilicen para gestionar mi inscripción y confirmo que la información proporcionada es correcta.</span></label>
            <button className="registration-submit"><span>CONTINUAR A SELECCIÓN DE ASIENTOS</span><b>&#8594;</b></button>
            <div className="registration-form-foot"><span>PASO 01 DE 02 · DATOS DEL ASISTENTE</span><span>TEDxUMSA · BOLIVIA</span></div>
            {error && <p className="registration-error" role="alert">{error}</p>}
          </form>
        </section>
      </div> : <section className="seat-selection-layout" id="registro">
        <div className="seat-selection-main"><div className="seat-selection-legend"><span><i className="key-available" /> DISPONIBLE ({openSeats})</span><span><i className="key-selected" /> SELECCIONADO ({selectedSeatId ? 1 : 0})</span><span><i className="key-blocked" /> OCUPADO / NO DISPONIBLE</span><b>↻ HAZ CLIC EN UNA BUTACA LIBRE PARA CAMBIAR</b></div>
          <div className="seat-selection-stage"><span>● ESCENARIO TEDx // PANTALLA PRINCIPAL</span><small>VISTA FRONTAL ÓPTIMA</small></div>
          {(info.seats?.length ?? 0) > 0 && info.seatRows && info.seatColumns ? <div className="seat-selection-map-scroll"><div className="seat-selection-map" style={{ minWidth: `${Math.max(520, info.seatColumns * 38 + 80)}px` }}>
            {Array.from({ length: info.seatRows }, (_, row) => <div className="seat-selection-row" key={row} style={{ gridTemplateColumns: `24px repeat(${info.seatColumns}, minmax(22px,1fr)) 24px` }}><span className="seat-side-label">{info.seats.find((seat) => seat.rowOrder === row)?.rowLabel ?? row + 1}</span>
              {Array.from({ length: info.seatColumns! }, (_, column) => { const seat = info.seats.find((item) => item.rowOrder === row && item.columnOrder === column); if (!seat) return <span className="public-aisle" key={column} aria-label="Pasillo" />; const unavailable = seat.status === 'BLOCKED' || seat.occupied; const selected = selectedSeatId === seat.id; return <button type="button" key={seat.id} disabled={unavailable} onClick={() => setSelectedSeatId(seat.id)} className={`public-seat ${unavailable ? 'unavailable' : selected ? 'selected' : 'available'}`} title={`Fila ${seat.rowLabel}, asiento ${seat.seatLabel}${seat.occupied ? ', ocupada' : seat.status === 'BLOCKED' ? ', bloqueada' : ''}`} aria-pressed={selected}>{unavailable ? '×' : seat.seatLabel}</button>; })}<span className="seat-side-label">{info.seats.find((seat) => seat.rowOrder === row)?.rowLabel ?? row + 1}</span></div>)}
          </div></div> : <p className="seat-map-empty">Este evento no tiene butacas numeradas. Continúa para confirmar tu inscripción.</p>}
          <div className="seat-selection-footnote"><span>← ACCESO Y PASILLO IZQUIERDO</span><b>{info.hallName ?? 'SALÓN DEL EVENTO'} · {info.seatRows ?? 0} FILAS</b><span>ACCESO Y PASILLO DERECHO →</span></div>
        </div>
        <aside className="seat-selection-summary"><div className="seat-summary-heading"><h2>▣ RESUMEN DE RESERVA</h2><span>● EN VIVO</span></div><article><small>EVENTO OFICIAL</small><h3>{info.name}</h3><div><span>FECHA · HORARIO</span><b>{new Date(info.startsAt).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}</b></div><div><span>SEDE</span><b>{info.venue}</b><small>{info.hallName}</small></div><div><span>TITULAR DEL REGISTRO</span><b>{registrationDraft.firstName} {registrationDraft.lastName}</b><small>{registrationDraft.email}</small></div></article><div className="seat-summary-selected"><span>BUTACA ASIGNADA · ESTADO: {selectedSeatId ? 'CONFIRMABLE' : 'PENDIENTE'}</span>{selectedSeatId ? <><b>FILA {info.seats.find((seat) => seat.id === selectedSeatId)?.rowLabel} / {info.seats.find((seat) => seat.id === selectedSeatId)?.seatLabel}</b><small>UBICACIÓN: {info.hallName ?? 'SALÓN PRINCIPAL'}</small></> : <><b>{info.seatRows ? info.seats.length ? 'ELIGE TU BUTACA' : 'SIN BUTACAS DISPONIBLES' : 'ACCESO GENERAL'}</b><small>{info.seatRows ? `${openSeats} asientos disponibles` : 'No requiere selección de asiento'}</small></>}</div><button type="button" className="seat-summary-back" onClick={() => { setRegistrationStep(1); setError(''); }}>← VOLVER A MIS DATOS</button><form onSubmit={register}><button className="registration-submit" disabled={previewMode || Boolean(info.seatRows && info.seatRows > 0 && !selectedSeatId)}><span>{previewMode ? 'VISTA PREVIA · INSCRIPCIÓN DESACTIVADA' : 'CONFIRMAR INSCRIPCIÓN'}</span><b>&#8594;</b></button></form>{error && <p className="registration-error" role="alert">{error}</p>}{previewMode && <small className="seat-summary-secure">VISTA PREVIA · NO SE GUARDARÁN DATOS</small>}</aside>
      </section>}
      <footer className="registration-footer"><span>ORGANIZA <b>Comité TEDxUMSA</b></span><span>LICENCIA <b>TED Conferences LLC</b></span><span>CIUDAD <b>La Paz, Bolivia</b></span><span>SISTEMA <b>TEDxUMSA · REGISTRO</b></span></footer>
    </main>
  );
}



