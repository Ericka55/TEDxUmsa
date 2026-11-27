'use client';

import { useEffect, useState } from 'react';

export type AdminSection = 'summary' | 'collaborators' | 'events' | 'qr' | 'halls' | 'responses';

export default function AdminSidebar({ active, eventId = '', onNavigate }: { active: AdminSection; eventId?: string; onNavigate?: (section: Exclude<AdminSection, 'halls' | 'responses'>) => void }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.sessionStorage.getItem('tedxumsa-admin-sidebar-collapsed') === 'true');
  }, []);

  function toggle() {
    setCollapsed((value) => {
      const next = !value;
      window.sessionStorage.setItem('tedxumsa-admin-sidebar-collapsed', String(next));
      return next;
    });
  }

  const eventQuery = eventId ? `&eventId=${encodeURIComponent(eventId)}` : '';
  const panelHref = (section: Exclude<AdminSection, 'halls' | 'responses'>) => `/admin/forms?section=${section}${section === 'events' ? '' : eventQuery}`;

  return <aside className={`admin-console-sidebar admin-shared-sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
    <button type="button" className="admin-sidebar-toggle" onClick={toggle} aria-label={collapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'} title={collapsed ? 'Mostrar menú' : 'Ocultar menú'}>{collapsed ? '›' : '‹'}<span>{collapsed ? 'Mostrar menú' : 'Ocultar menú'}</span></button>
    <a className="admin-console-logo" href="/">TED<span>x</span>UMSA<small>ADMINISTRACIÓN</small></a>
    <p>GESTIONAR</p>
    <a className={active === 'summary' || active === 'responses' ? 'active' : ''} href={panelHref('summary')} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate('summary'); } : undefined}><span className="admin-sidebar-icon" aria-hidden="true">&#9638;</span><span className="admin-sidebar-label">RESUMEN</span></a>
    <a className={active === 'collaborators' ? 'active' : ''} href={panelHref('collaborators')} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate('collaborators'); } : undefined}><span className="admin-sidebar-icon" aria-hidden="true">&#9823;</span><span className="admin-sidebar-label">COLABORADORES</span></a>
    <a className={active === 'events' ? 'active' : ''} href={panelHref('events')} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate('events'); } : undefined}><span className="admin-sidebar-icon" aria-hidden="true">&#10022;</span><span className="admin-sidebar-label">EVENTOS</span></a>
    <a className={active === 'qr' ? 'active' : ''} href={panelHref('qr')} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate('qr'); } : undefined}><span className="admin-sidebar-icon" aria-hidden="true">&#9635;</span><span className="admin-sidebar-label">QR DEL EVENTO</span></a>
    <p>ESPACIOS</p>
    <a className={active === 'halls' ? 'active' : ''} href={`/admin/halls${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`}><span className="admin-sidebar-icon" aria-hidden="true">&#9776;</span><span className="admin-sidebar-label">SALONES</span></a>
    <a href="/"><span className="admin-sidebar-icon" aria-hidden="true">&#8592;</span><span className="admin-sidebar-label">IR AL SITIO</span></a>
    <div className="admin-sidebar-live"><i /> Panel del evento</div>
  </aside>;
}
