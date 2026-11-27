'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type EventCard = {
  id: string;
  slug: string;
  name: string;
  description: string;
  venue: string;
  hallName: string | null;
  startsAt: string;
  bannerUrl: string | null;
  availableSeats: number;
};

function eventDate(value: string) {
  return new Date(value).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Home() {
  const [events, setEvents] = useState<EventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadEvents() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/events`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudieron cargar los eventos.');
      setEvents(data);
    } catch (problem) {
      setError(problem instanceof TypeError
        ? 'No pudimos conectar con el servidor de eventos. Comprueba que el backend esté iniciado e inténtalo de nuevo.'
        : problem instanceof Error ? problem.message : 'No se pudieron cargar los eventos. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  const featured = events[0];

  return (
    <main className="browse-page">
      <header className="browse-nav">
        <a className="browse-logo" href="/" aria-label="TEDxUMSA inicio">TED<span>x</span>UMSA</a>
        <nav><a href="#eventos">Explorar</a><a className="admin-link" href="/admin/forms">Administración</a></nav>
      </header>

      <section className="featured-event" style={featured?.bannerUrl ? { backgroundImage: `linear-gradient(90deg,#090909ee 0%,#090909a8 48%,#09090930 100%),url("${featured.bannerUrl}")` } : undefined}>
        {featured ? <div className="featured-copy">
          <p className="browse-kicker">TEDxUMSA · IDEAS QUE NOS MUEVEN</p>
          <h1>{featured.name}</h1>
          <p className="featured-description">{featured.description}</p>
          <p className="featured-meta">{eventDate(featured.startsAt)}<span>·</span>{featured.venue}{featured.hallName ? ` · ${featured.hallName}` : ''}</p>
          <div className="featured-actions"><a className="play-button" href={`/e/${featured.slug}`}>INSCRIBIRME <b aria-hidden="true">&#8594;</b></a><a className="more-button" href="#eventos">EXPLORAR EVENTOS</a></div>
        </div> : <div className="featured-copy">
          <p className="browse-kicker">IDEAS QUE MERECEN COMPARTIRSE</p>
          <h1>Una nueva<br />idea está por<br /><em>comenzar.</em></h1>
          {error ? <><p className="featured-description">{error}</p><div className="featured-actions"><button className="more-button" type="button" onClick={() => void loadEvents()}>Volver a intentar</button></div></> : <><p className="featured-description">TEDxUMSA reúne ideas que inspiran nuevas conversaciones.</p><div className="featured-actions"><a className="play-button" href="#eventos">EXPLORAR EVENTOS <b aria-hidden="true">&#8594;</b></a></div></>}
        </div>}
        {!featured && <div className="empty-art" aria-hidden="true"><b>TED</b><i>x</i>UMSA</div>}
        {featured && <div className="featured-index"><span>01</span><i /><span>{String(events.length).padStart(2, '0')} EVENTOS</span></div>}
      </section>

      <section id="eventos" className="event-rail-section">
        <div className="rail-heading"><div><p className="browse-kicker">AGENDA ABIERTA</p><h2>Próximos eventos</h2></div><span>{events.length} {events.length === 1 ? 'evento' : 'encuentros'}</span></div>
        {loading ? <p className="rail-message">Cargando eventos…</p> : error ? null : events.length === 0 ? (
          <div className="rail-empty"><span className="rail-empty-mark">✦</span><div><p>Aún no hay eventos disponibles</p><span>Los eventos publicados aparecerán aquí.</span></div></div>
        ) : (
          <div className="event-rail">{events.map((event, index) => <a className="event-card" href={`/e/${event.slug}`} key={event.id}>
            <div className={`event-card-art art-${index % 5}`}>{event.bannerUrl ? <img src={event.bannerUrl} alt="" /> : <><span className="card-number">{String(index + 1).padStart(2, '0')}</span><span className="card-brand">TED<span>x</span>UMSA</span></>}</div>
            <div className="event-card-info"><span className="card-date">{eventDate(event.startsAt)}</span><h3>{event.name}</h3><p>{event.venue}</p><span className="card-seats">{event.availableSeats} lugares disponibles</span><span className="event-card-cta">Ver evento y registrarme <b aria-hidden="true">&#8594;</b></span></div>
          </a>)}</div>
        )}
      </section>
      <footer className="browse-footer"><span>TEDxUMSA</span><span>Ideas worth spreading.</span><a href="/admin/forms">Acceso organizadores</a></footer>
    </main>
  );
}
