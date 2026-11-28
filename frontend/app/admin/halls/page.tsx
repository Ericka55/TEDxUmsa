'use client';

import { FormEvent, useEffect, useState } from 'react';
import AdminSidebar from '../admin-sidebar';
import { apiFetch } from '../../api-client';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type HallRecord = {
  id: string;
  name: string;
  venue: string;
  seatRows: number;
  seatColumns: number;
  seatLayout: { rowOrder: number; columnOrder: number; status?: 'AVAILABLE' | 'BLOCKED'; state?: 'AVAILABLE' | 'BLOCKED' | 'AISLE' }[];
  photoUrl: string | null;
  legacyKey?: string | null;
};
type SeatMode = 'AVAILABLE' | 'BLOCKED' | 'AISLE';

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

function apiOrigin() { return API.replace(/\/api\/?$/, ''); }

export default function AdminHallsPage() {
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState('');
  const [halls, setHalls] = useState<HallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [photoData, setPhotoData] = useState('');
  const [seatRows, setSeatRows] = useState(5);
  const [seatColumns, setSeatColumns] = useState(8);
  const [seatModes, setSeatModes] = useState<Record<string, SeatMode>>({});
  const [seatTool, setSeatTool] = useState<'CYCLE' | SeatMode>('CYCLE');
  const [notice, setNotice] = useState('');
  const [eventId, setEventId] = useState('');

  useEffect(() => {
    setEventId(new URLSearchParams(window.location.search).get('eventId') ?? window.sessionStorage.getItem('tedxumsa-admin-event-id') ?? '');
    window.sessionStorage.removeItem('tedxumsa-admin-token');
    void apiFetch(`${API}/auth/session`).then(async (response) => {
      if (!response.ok) return;
      const session = await response.json();
      if (session.user?.role !== 'ADMIN') { setNotice('La gestión global de salones está reservada al administrador.'); return; }
      setToken('cookie-session');
      await loadHalls('cookie-session');
    }).catch(() => undefined).finally(() => { setLoading(false); setAuthReady(true); });
  }, []);

  async function loadHalls(authToken: string) {
    setLoading(true);
    try {
      const response = await apiFetch(`${API}/halls`, { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        window.sessionStorage.removeItem('tedxumsa-admin-token');
        setToken('');
        return;
      }
      if (!response.ok) throw new Error(data.message ?? 'No se pudieron cargar los salones.');
      setHalls(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron cargar los salones.');
    } finally { setLoading(false); }
  }

  function newHall() {
    setEditingId(''); setPhotoData(''); setNotice('');
    setSeatRows(5); setSeatColumns(8); setSeatModes({}); setSeatTool('CYCLE');
    (document.getElementById('hall-form') as HTMLFormElement | null)?.reset();
    setShowForm(true);
  }

  function editHall(hall: HallRecord) {
    setEditingId(hall.id); setPhotoData(''); setNotice('');
    setSeatRows(hall.seatRows); setSeatColumns(hall.seatColumns); setSeatTool('CYCLE');
    const modes: Record<string, SeatMode> = {};
    for (let row = 0; row < hall.seatRows; row += 1) for (let column = 0; column < hall.seatColumns; column += 1) {
      const seat = hall.seatLayout?.find((item) => item.rowOrder === row && item.columnOrder === column);
      modes[`${row}:${column}`] = !seat && hall.legacyKey ? 'AISLE' : seat?.state === 'AISLE' ? 'AISLE' : seat?.state === 'BLOCKED' || seat?.status === 'BLOCKED' ? 'BLOCKED' : 'AVAILABLE';
    }
    setSeatModes(modes);
    window.setTimeout(() => {
      const form = document.getElementById('hall-form') as HTMLFormElement | null;
      if (!form) return;
      (form.elements.namedItem('name') as HTMLInputElement).value = hall.name;
      (form.elements.namedItem('venue') as HTMLInputElement).value = hall.venue;
    }, 0);
    setShowForm(true);
  }

  function setSeat(row: number, column: number) {
    setSeatModes((current) => {
      const key = `${row}:${column}`;
      const mode = current[key] ?? 'AVAILABLE';
      const next: SeatMode = seatTool === 'CYCLE'
        ? mode === 'AVAILABLE' ? 'BLOCKED' : mode === 'BLOCKED' ? 'AISLE' : 'AVAILABLE'
        : seatTool;
      return { ...current, [key]: next };
    });
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

  async function selectPhoto(file?: File) {
    setPhotoData('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setNotice('Elige una foto JPG, PNG o WebP de hasta 20 MB.'); return;
    }
    setNotice('Optimizando la foto…');
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const maxPixels = 20_000_000;
      let scale = Math.min(1, 5000 / Math.max(bitmap.width, bitmap.height), Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
      let blob: Blob | null = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
        canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No se pudo preparar la foto.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
        if (blob && blob.size <= 4 * 1024 * 1024) break;
        scale *= 0.82;
      }
      if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('La foto optimizada sigue siendo demasiado pesada.');
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoData(typeof reader.result === 'string' ? reader.result : '');
        setNotice('Foto lista. Se ajustó automáticamente para el mapa del salón.');
      };
      reader.onerror = () => setNotice('No se pudo leer la foto. Prueba exportarla como JPG, PNG o WebP.');
      reader.readAsDataURL(blob);
    } catch {
      setNotice('No se pudo procesar la foto. Prueba exportarla como JPG, PNG o WebP.');
    } finally {
      bitmap?.close();
    }
  }

  async function saveHall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rows = Number(form.get('seatRows'));
    const columns = Number(form.get('seatColumns'));
    const seatLayout = Array.from({ length: rows * columns }, (_, index) => {
      const rowOrder = Math.floor(index / columns);
      const columnOrder = index % columns;
      return { rowOrder, columnOrder, state: seatModes[`${rowOrder}:${columnOrder}`] ?? 'AVAILABLE' };
    });
    setNotice(editingId ? 'Guardando cambios…' : 'Registrando salón…');
    try {
      const response = await apiFetch(`${API}/halls${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.get('name'), venue: form.get('venue'), seatRows: rows, seatColumns: columns, seatLayout, ...(photoData ? { photoDataUrl: photoData } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message ?? 'No se pudo guardar el salón.');
      await loadHalls(token);
      setEditingId(''); setPhotoData(''); formElement.reset();
      setShowForm(false);
      setNotice('Salón guardado.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el salón.');
    }
  }

  return <main className="builder-page admin-main-wide admin-halls-page">
    <header className="builder-header"><a className="builder-brand" href="/">TED<span>x</span>UMSA</a><span>ADMINISTRACIÓN · SALONES</span><a className="admin-logout" href={eventId ? `/admin/forms?section=summary&eventId=${encodeURIComponent(eventId)}` : '/admin/forms?section=events'}>Volver al panel</a></header>
    {!authReady ? <section className="admin-halls-login" role="status"><p>Verificando sesión…</p></section> : !token ? <section className="admin-halls-login"><h1>Inicia sesión para administrar tus salones</h1><p>Ingresa al panel administrativo y vuelve a esta sección.</p><a className="builder-button" href="/admin/forms">IR AL PANEL ADMINISTRATIVO</a></section> : <div className="admin-halls-layout">
      <AdminSidebar active="halls" eventId={eventId} />
      <section className="admin-halls-content"><div className="admin-halls-title"><div><p>ESPACIOS PARA TUS EVENTOS</p><h1>SALONES Y RECINTOS</h1><span>Guarda las ubicaciones y la capacidad de cada lugar. Luego elígelos al crear un evento.</span></div><button type="button" className="builder-button" onClick={newHall}>+ AGREGAR SALÓN</button></div>
        {!showForm && notice && <p className="admin-hall-notice" role="status">{notice}</p>}
        <div className="admin-halls-main-grid"><section className="admin-halls-catalog"><div className="admin-halls-section-title"><h2>RECINTOS REGISTRADOS</h2><span>{halls.length} SALONES</span></div>{loading ? <p>Cargando salones…</p> : halls.length === 0 ? <div className="admin-halls-empty"><b>Todavía no registraste salones</b><p>Agrega un lugar para tenerlo disponible cuando organices un evento.</p></div> : <div className="admin-hall-list">{halls.map((hall) => <article className="admin-hall-card" key={hall.id}><div className="admin-hall-card-image">{hall.photoUrl ? <img src={`${apiOrigin()}${hall.photoUrl}`} alt={`Fotografía de ${hall.name}`} /> : <span>TED<span>x</span>UMSA</span>}</div><div className="admin-hall-card-body"><span className="admin-card-kicker">RECINTO DISPONIBLE</span><h3>{hall.name}</h3><p>{hall.venue}</p><div className="admin-hall-facts"><span>{hall.seatRows} filas</span><span>{hall.seatRows * hall.seatColumns} butacas</span></div><button type="button" className="admin-show-attendees" onClick={() => editHall(hall)}>EDITAR SALÓN</button></div></article>)}</div>}</section>
          <aside className="admin-console-aside admin-halls-aside"><section><div className="admin-aside-heading"><h3>RESUMEN DE SALONES</h3><span>RECINTOS</span></div><div className="admin-status-grid"><div><span>SALONES GUARDADOS</span><b>{halls.length}</b></div><div><span>CAPACIDAD TOTAL</span><b>{halls.reduce((total, hall) => total + hall.seatRows * hall.seatColumns, 0)}</b></div></div><p>Los recintos guardados quedan disponibles para reutilizarlos al crear eventos.</p><button type="button" className="admin-show-attendees" onClick={newHall}>+ AGREGAR SALÓN</button></section><section><div className="admin-aside-heading"><h3>GESTIÓN DEL RECINTO</h3><i /></div><p>Edita la información o la fotografía desde cada tarjeta. Los eventos asociados reciben el nombre y la ubicación actualizados.</p></section></aside>
        </div>
        {showForm && <div className="admin-hall-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}><form id="hall-form" className="admin-hall-form" role="dialog" aria-modal="true" aria-labelledby="hall-form-heading" onSubmit={(event) => void saveHall(event)}><div className="admin-hall-form-title"><div><p>CATÁLOGO DE ESPACIOS</p><h2 id="hall-form-heading">{editingId ? 'EDITAR SALÓN' : 'REGISTRAR SALÓN'}</h2></div><button type="button" onClick={() => setShowForm(false)}>CERRAR</button></div>
            <p className="admin-hall-form-help">Un salón es el recinto físico donde se realiza un evento. Cada evento puede reutilizar uno de estos lugares.</p>
            <label>Nombre del salón<input name="name" placeholder="Auditorio principal" required maxLength={120} /></label><label>Recinto y dirección<input name="venue" placeholder="Teatro, edificio, ciudad" required maxLength={180} /></label>
            <div className="builder-row"><label>Filas<input name="seatRows" type="number" min="1" max="30" value={seatRows} onChange={(event) => setSeatRows(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} required /></label><label>Butacas por fila<input name="seatColumns" type="number" min="1" max="40" value={seatColumns} onChange={(event) => setSeatColumns(Math.max(1, Math.min(40, Number(event.target.value) || 1)))} required /></label></div>
            <p className="builder-help">Elige una herramienta y pulsa las butacas. Los botones con flechas convierten filas o columnas completas en pasillos.</p>
            <div className="seat-tools"><div className="seat-tool-modes"><button type="button" className={seatTool === 'CYCLE' ? 'active' : ''} onClick={() => setSeatTool('CYCLE')}>Editar individual</button><button type="button" className={seatTool === 'AVAILABLE' ? 'active' : ''} onClick={() => setSeatTool('AVAILABLE')}>Disponible</button><button type="button" className={seatTool === 'BLOCKED' ? 'active' : ''} onClick={() => setSeatTool('BLOCKED')}>Bloquear</button><button type="button" className={seatTool === 'AISLE' ? 'active' : ''} onClick={() => setSeatTool('AISLE')}>Pasillo</button></div><div className="seat-tool-actions"><button type="button" onClick={addCenterAisle}>Añadir pasillo central</button><button type="button" onClick={clearAisles}>Quitar pasillos</button></div></div>
            <div className="hall-preview-wrap"><div className="hall-stage">ESCENARIO</div>
              <div className="hall-preview-column-actions" style={{ gridTemplateColumns: `28px 28px repeat(${seatColumns}, 38px)` }}><span /><span />{Array.from({ length: seatColumns }, (_, column) => <button type="button" key={column} onClick={() => markColumnAsAisle(column)} title={`Convertir toda la columna ${column + 1} en pasillo`} aria-label={`Convertir toda la columna ${column + 1} en pasillo`}>&#8595;</button>)}</div>
              {Array.from({ length: seatRows }, (_, row) => <div className="hall-preview-row" key={row} style={{ gridTemplateColumns: `28px 28px repeat(${seatColumns}, 38px)` }}><span className="hall-row-label">{rowLabel(row)}</span><button type="button" className="aisle-row-action" onClick={() => markRowAsAisle(row)} title={`Convertir toda la fila ${rowLabel(row)} en pasillo`} aria-label={`Convertir toda la fila ${rowLabel(row)} en pasillo`}>&#8596;</button>
                {Array.from({ length: seatColumns }, (_, column) => { const mode = seatModes[`${row}:${column}`] ?? 'AVAILABLE'; return <button className={`seat-dot seat-${mode.toLowerCase()}`} type="button" key={column} title={`Fila ${rowLabel(row)}, asiento ${column + 1}: ${mode}`} aria-label={`Fila ${rowLabel(row)}, asiento ${column + 1}: ${mode}`} onClick={() => setSeat(row, column)}>{mode === 'AISLE' ? '·' : column + 1}</button>; })}
              </div>)}
            </div>
            <div className="seat-key"><span><i className="key-available" />Disponible</span><span><i className="key-blocked" />Bloqueada</span><span><i className="key-aisle" />Pasillo</span></div>
            <div className="admin-hall-photo-field"><span>FOTOGRAFÍA DEL RECINTO</span>{(photoData || halls.find((hall) => hall.id === editingId)?.photoUrl) && <img src={photoData || `${apiOrigin()}${halls.find((hall) => hall.id === editingId)?.photoUrl}`} alt="Vista previa de la fotografía del salón" />}<label>Elegir foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectPhoto(event.target.files?.[0])} /><small>JPG, PNG o WebP · hasta 20 MB; se optimiza automáticamente</small></label></div>
            {notice && <p className="admin-hall-notice" role="status">{notice}</p>}<button className="builder-button admin-hall-save">{editingId ? 'GUARDAR CAMBIOS' : 'AGREGAR AL CATÁLOGO'}</button>
          </form></div>}
      </section>
    </div>}
  </main>;
}
