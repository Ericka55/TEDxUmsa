'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type SurveyInfo = { eventName: string; firstName: string; submitted: boolean };

export default function SatisfactionSurveyPage() {
  const params = useParams<{ token: string }>();
  const [info, setInfo] = useState<SurveyInfo | null>(null);
  const [rating, setRating] = useState(5);
  const [recommendation, setRecommendation] = useState(10);
  const [message, setMessage] = useState('Cargando encuesta…');
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/events/satisfaction/${encodeURIComponent(params.token)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.message ?? 'Este enlace ya no está disponible.'); setInfo(data); setSent(data.submitted); setMessage(data.submitted ? 'Ya recibimos tu respuesta. ¡Gracias!' : 'Tu opinión nos ayuda a mejorar el próximo evento.'); })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo abrir la encuesta.'));
  }, [params.token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API}/events/satisfaction/${encodeURIComponent(params.token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, recommendation, highlights: form.get('highlights'), improvements: form.get('improvements') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'No se pudo enviar tu respuesta.');
      setSent(true); setMessage('¡Gracias! Tu opinión quedó registrada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo enviar tu respuesta.'); }
    finally { setSaving(false); }
  }

  return <main className="satisfaction-page"><header className="satisfaction-header"><a className="builder-brand" href="/">TED<span>x</span>UMSA</a><span>ENCUESTA DE SATISFACCIÓN</span></header><section className="satisfaction-card"><p className="builder-kicker">GRACIAS POR ACOMPAÑARNOS</p><h1>{info ? info.eventName : 'Tu opinión importa'}</h1><p className="satisfaction-greeting">{info ? `Hola ${info.firstName}.` : ''} {message}</p>{info && !sent && <form onSubmit={(event) => void submit(event)}><fieldset><legend>¿Cómo calificarías tu experiencia?</legend><div className="satisfaction-rating">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={rating === value ? 'selected' : ''} aria-pressed={rating === value} onClick={() => setRating(value)}>{value}<span>{['Mala', 'Regular', 'Buena', 'Muy buena', 'Excelente'][value - 1]}</span></button>)}</div></fieldset><fieldset><legend>¿Qué tan probable es que recomiendes este evento? <b>{recommendation}/10</b></legend><div className="satisfaction-recommendation">{Array.from({ length: 11 }, (_, value) => <button type="button" key={value} className={recommendation === value ? 'selected' : ''} onClick={() => setRecommendation(value)}>{value}</button>)}</div></fieldset><label>¿Qué fue lo que más te gustó?<textarea name="highlights" maxLength={4000} rows={3} /></label><label>¿Qué podríamos mejorar?<textarea name="improvements" maxLength={4000} rows={3} /></label><button className="builder-button" disabled={saving}>{saving ? 'ENVIANDO…' : 'ENVIAR RESPUESTA'}</button></form>}</section><footer className="browse-footer"><span>TEDxUMSA</span><span>Ideas worth spreading.</span></footer></main>;
}
