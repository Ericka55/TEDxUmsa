import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, SeatStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { randomBytes, scryptSync } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function rowName(index: number) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = alphabet[value % alphabet.length] + label;
    value = Math.floor(value / alphabet.length);
  }
  return label;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaClient) {}

  async createCollaborator(eventId: string, input: Record<string, unknown>, actorRole: string) {
    const name = this.requiredString(input.name, 'El nombre');
    const email = this.requiredString(input.email, 'El correo').toLowerCase();
    const password = this.requiredString(input.password, 'La contraseña');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Escribe un correo válido.');
    if (password.length < 12) throw new BadRequestException('La contraseña debe tener al menos 12 caracteres.');
    const role = input.role === 'ORGANIZER' && actorRole === 'ADMIN' ? 'ORGANIZER' : 'COLLABORATOR';
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, status: true, registrationEnabled: true } });
    if (!event) throw new NotFoundException('No encontramos este evento.');
    if (event.status !== 'PUBLISHED' || !event.registrationEnabled) throw new ConflictException('Los colaboradores solo se pueden asignar a eventos activos.');
    const salt = randomBytes(16);
    const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, name, passwordHash, role, active: true } });
        await tx.eventCollaborator.create({ data: { eventId, userId: user.id } });
        return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ese correo ya tiene una cuenta. Usa otro correo para el colaborador.');
      throw error;
    }
  }

  async listCollaborators(eventId: string) {
    if (!(await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }))) throw new NotFoundException('No encontramos este evento.');
    const rows = await this.prisma.eventCollaborator.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, user: { select: { id: true, name: true, email: true, role: true, active: true } } } });
    return rows.map(({ user, createdAt }) => ({ ...user, createdAt }));
  }

  async removeCollaborator(eventId: string, userId: string) {
    const removed = await this.prisma.eventCollaborator.deleteMany({ where: { eventId, userId } });
    if (!removed.count) throw new NotFoundException('El colaborador no está asignado a este evento.');
    if (!(await this.prisma.eventCollaborator.count({ where: { userId } }))) await this.prisma.user.update({ where: { id: userId }, data: { active: false } });
    return { removed: true };
  }

  async listCollaboratorEvents(userId: string) {
    const rows = await this.prisma.eventCollaborator.findMany({ where: { userId, event: { status: 'PUBLISHED', registrationEnabled: true } }, select: { event: { select: { id: true, slug: true, name: true, venue: true, startsAt: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map(({ event }) => event);
  }

  async closeEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, slug: true, status: true, closedAt: true } });
    if (!event) throw new NotFoundException('No encontramos este evento.');
    if (!event.closedAt) {
      const registrations = await this.prisma.registration.findMany({ where: { eventId, status: 'CONFIRMED', checkedInAt: { not: null } }, select: { id: true, surveyToken: true } });
      await this.prisma.$transaction([
        this.prisma.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED', registrationEnabled: false, closedAt: new Date() } }),
        ...registrations.filter((registration) => !registration.surveyToken).map((registration) => this.prisma.registration.update({ where: { id: registration.id }, data: { surveyToken: randomBytes(32).toString('hex') } })),
      ]);
    }
    const recipients = await this.prisma.registration.findMany({ where: { eventId, status: 'CONFIRMED', checkedInAt: { not: null }, surveyToken: { not: null }, surveySentAt: null }, select: { id: true, surveyToken: true, attendee: { select: { firstName: true, email: true } } } });
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) return { eventId, closed: true, eligible: recipients.length, sent: 0, pending: recipients.length, emailConfigured: false };
    let sent = 0;
    const errors: string[] = [];
    const webOrigin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    for (const registration of recipients) {
      const surveyUrl = `${webOrigin}/s/${registration.surveyToken}`;
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [registration.attendee.email], subject: `Cuéntanos cómo estuvo ${event.name}`, html: `<p>Hola ${escapeHtml(registration.attendee.firstName)},</p><p>Gracias por acompañarnos en <strong>${escapeHtml(event.name)}</strong>. Nos ayudaría mucho conocer tu experiencia.</p><p><a href="${surveyUrl}">Responder encuesta de satisfacción</a></p><p>TEDxUMSA</p>` }),
        });
        if (!response.ok) throw new Error(`Correo rechazado (${response.status}).`);
        await this.prisma.registration.update({ where: { id: registration.id }, data: { surveySentAt: new Date() } });
        sent += 1;
      } catch (error) { errors.push(error instanceof Error ? error.message : 'Error enviando el correo.'); }
    }
    const pending = await this.prisma.registration.count({ where: { eventId, status: 'CONFIRMED', checkedInAt: { not: null }, surveyToken: { not: null }, surveySentAt: null } });
    if (!pending) await this.prisma.event.update({ where: { id: eventId }, data: { surveyEmailsSentAt: new Date() } });
    return { eventId, closed: true, eligible: recipients.length, sent, pending, emailConfigured: true, errors };
  }

  async getSatisfactionSurvey(token: string) {
    const registration = await this.prisma.registration.findUnique({ where: { surveyToken: token }, select: { id: true, checkedInAt: true, satisfaction: { select: { id: true } }, event: { select: { name: true, closedAt: true } }, attendee: { select: { firstName: true } } } });
    if (!registration || !registration.checkedInAt || !registration.event.closedAt) throw new NotFoundException('El enlace de encuesta no está activo.');
    return { eventName: registration.event.name, firstName: registration.attendee.firstName, submitted: Boolean(registration.satisfaction) };
  }

  async submitSatisfactionSurvey(token: string, input: Record<string, unknown>) {
    const registration = await this.prisma.registration.findUnique({ where: { surveyToken: token }, select: { id: true, eventId: true, checkedInAt: true, event: { select: { closedAt: true } } } });
    if (!registration || !registration.checkedInAt || !registration.event.closedAt) throw new NotFoundException('El enlace de encuesta no está activo.');
    const rating = Number(input.rating);
    const recommendation = Number(input.recommendation);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestException('Califica el evento del 1 al 5.');
    if (!Number.isInteger(recommendation) || recommendation < 0 || recommendation > 10) throw new BadRequestException('La recomendación debe estar entre 0 y 10.');
    try {
      await this.prisma.satisfactionResponse.create({ data: { eventId: registration.eventId, registrationId: registration.id, rating, recommendation, highlights: this.optionalString(input.highlights)?.slice(0, 4000), improvements: this.optionalString(input.improvements)?.slice(0, 4000) } });
      return { submitted: true };
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ya recibimos una respuesta para esta encuesta.');
      throw error;
    }
  }

  async getSatisfactionReport(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, closedAt: true } });
    if (!event) throw new NotFoundException('No encontramos este evento.');
    const responses = await this.prisma.satisfactionResponse.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' }, select: { rating: true, recommendation: true, highlights: true, improvements: true, createdAt: true, registration: { select: { attendee: { select: { firstName: true, lastName: true } } } } } });
    const eligible = await this.prisma.registration.count({ where: { eventId, status: 'CONFIRMED', checkedInAt: { not: null } } });
    const sent = await this.prisma.registration.count({ where: { eventId, status: 'CONFIRMED', checkedInAt: { not: null }, surveySentAt: { not: null } } });
    const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : 0;
    return { event, responseCount: responses.length, averageRating: average(responses.map((item) => item.rating)), averageRecommendation: average(responses.map((item) => item.recommendation)), surveyDelivery: { eligible, sent, pending: Math.max(0, eligible - sent), emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM) }, ratingDistribution: Array.from({ length: 5 }, (_, index) => ({ rating: index + 1, count: responses.filter((item) => item.rating === index + 1).length })), responses: responses.map(({ registration, ...response }) => ({ ...response, attendee: registration.attendee })) };
  }

  async create(input: Record<string, unknown>) {
    const name = this.requiredString(input.name, 'El nombre');
    const slug = this.requiredString(input.slug, 'El enlace');
    const description = this.requiredString(input.description, 'La descripción');
    const venue = this.requiredString(input.venue, 'La ubicación');
    const hallName = this.requiredString(input.hallName, 'El nombre del salón');
    const hallId = typeof input.hallId === 'string' ? input.hallId : null;
    const whatsappGroupUrl = this.optionalString(input.whatsappGroupUrl);
    if (whatsappGroupUrl && !/^https?:\/\//i.test(whatsappGroupUrl)) throw new BadRequestException('El enlace de WhatsApp debe iniciar con https:// o http://.');
    const startsAt = new Date(String(input.startsAt ?? ''));
    const endsAtValue = input.endsAt ? new Date(String(input.endsAt)) : null;
    const rows = Number(input.seatRows);
    const columns = Number(input.seatColumns);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Indica una fecha válida.');
    if (endsAtValue && (Number.isNaN(endsAtValue.getTime()) || endsAtValue <= startsAt)) throw new BadRequestException('La hora de finalización debe ser posterior a la hora de inicio.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BadRequestException('El enlace solo puede llevar minúsculas, números y guiones.');
    if (!Number.isInteger(rows) || rows < 1 || rows > 30 || !Number.isInteger(columns) || columns < 1 || columns > 40) {
      throw new BadRequestException('El salón admite de 1 a 30 filas y de 1 a 40 butacas por fila.');
    }

    const allowedFields = ['institution', 'referralSource', 'expectations', 'interests', 'perspective', 'comments'];
    const requestedFields = Array.isArray(input.formFields) ? input.formFields : [];
    const normalizedFields: (string | { key: string; label: string })[] = [];
    for (const field of requestedFields) {
      if (typeof field === 'string' && allowedFields.includes(field)) { normalizedFields.push(field); continue; }
      if (!field || typeof field !== 'object') continue;
      const question = field as Record<string, unknown>;
      const key = typeof question.key === 'string' ? question.key : '';
      const label = typeof question.label === 'string' ? question.label.trim() : '';
      if (/^custom_[a-z0-9_-]{4,40}$/.test(key) && label.length > 0 && label.length <= 160) normalizedFields.push({ key, label });
    }
    const layout = Array.isArray(input.seatLayout) ? input.seatLayout : [];
    const configured = new Map<string, SeatStatus | 'AISLE'>();
    for (const entry of layout) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const row = Number(item.rowOrder);
      const column = Number(item.columnOrder);
      const state = item.state;
      if (Number.isInteger(row) && Number.isInteger(column) && row >= 0 && row < rows && column >= 0 && column < columns
        && (state === 'AVAILABLE' || state === 'BLOCKED' || state === 'AISLE')) {
        configured.set(`${row}:${column}`, state);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (hallId && !(await tx.hall.findUnique({ where: { id: hallId }, select: { id: true } }))) {
          throw new BadRequestException('El salón seleccionado ya no existe. Elige un salón del catálogo.');
        }
        const event = await tx.event.create({
          data: {
            name,
            slug,
            description,
            venue,
            hallName,
            hallId,
            whatsappGroupUrl,
            seatRows: rows,
            seatColumns: columns,
            startsAt,
            endsAt: endsAtValue,
            status: 'PUBLISHED',
            registrationEnabled: true,
            formFields: normalizedFields as Prisma.InputJsonValue,
          },
          select: { id: true, slug: true, name: true, description: true, venue: true, hallName: true, seatRows: true, seatColumns: true, startsAt: true, endsAt: true },
        });
        const seats = [];
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const state = configured.get(`${row}:${column}`) ?? 'AVAILABLE';
            if (state === 'AISLE') continue;
            seats.push({
              eventId: event.id,
              rowLabel: rowName(row),
              seatLabel: String(column + 1),
              rowOrder: row,
              columnOrder: column,
              status: state,
            });
          }
        }
        await tx.seat.createMany({ data: seats });
        return { ...event, seatCount: seats.length };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ya existe un formulario con ese enlace.');
      throw error;
    }
  }

  async updateEvent(eventId: string, input: Record<string, unknown>) {
    const current = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, slug: true, status: true } });
    if (!current) throw new NotFoundException('No encontramos este evento.');
    if (current.status === 'ARCHIVED') throw new ConflictException('Los eventos finalizados ya no se pueden editar.');

    const name = this.requiredString(input.name, 'El nombre');
    const slug = current.slug;
    const description = this.requiredString(input.description, 'La descripción');
    const venue = this.requiredString(input.venue, 'La ubicación');
    const startsAt = new Date(String(input.startsAt ?? ''));
    const endsAt = input.endsAt ? new Date(String(input.endsAt)) : null;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BadRequestException('El enlace solo puede llevar minúsculas, números y guiones.');
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Indica una fecha válida.');
    if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) throw new BadRequestException('La hora de finalización debe ser posterior a la hora de inicio.');

    const allowedFields = ['institution', 'referralSource', 'expectations', 'interests', 'perspective', 'comments'];
    const normalizedFields: (string | { key: string; label: string })[] = [];
    for (const field of Array.isArray(input.formFields) ? input.formFields : []) {
      if (typeof field === 'string' && allowedFields.includes(field)) { normalizedFields.push(field); continue; }
      if (!field || typeof field !== 'object') continue;
      const question = field as Record<string, unknown>;
      const key = typeof question.key === 'string' ? question.key : '';
      const label = typeof question.label === 'string' ? question.label.trim() : '';
      if (/^custom_[a-z0-9_-]{4,40}$/.test(key) && label.length > 0 && label.length <= 160) normalizedFields.push({ key, label });
    }

    try {
      return await this.prisma.event.update({
        where: { id: eventId },
        data: { name, slug, description, venue, startsAt, endsAt, formFields: normalizedFields as Prisma.InputJsonValue, whatsappGroupUrl: this.optionalString(input.whatsappGroupUrl) ?? null },
        select: { id: true, slug: true, name: true, description: true, venue: true, startsAt: true, endsAt: true, formFields: true },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Ya existe un formulario con ese enlace.');
      throw error;
    }
  }

  async deleteEventPermanently(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        registrations: { select: { attendeeId: true } },
        collaborators: { select: { userId: true } },
      },
    });
    if (!event) throw new NotFoundException('No encontramos este evento.');

    const attendeeIds = [...new Set(event.registrations.map(({ attendeeId }) => attendeeId))];
    const collaboratorIds = [...new Set(event.collaborators.map(({ userId }) => userId))];

    await this.prisma.$transaction(async (tx) => {
      // Preserve audit history; deleting the event sets its nullable audit eventId to NULL.
      await tx.seatReservation.deleteMany({ where: { eventId } });
      await tx.satisfactionResponse.deleteMany({ where: { eventId } });
      await tx.registration.deleteMany({ where: { eventId } });
      await tx.seat.deleteMany({ where: { eventId } });
      await tx.eventCollaborator.deleteMany({ where: { eventId } });
      await tx.event.delete({ where: { id: eventId } });

      // Attendees may be shared across events; delete only records with no remaining registrations.
      for (const attendeeId of attendeeIds) {
        if (!(await tx.registration.count({ where: { attendeeId } }))) {
          await tx.attendee.deleteMany({ where: { id: attendeeId } });
        }
      }

      // Disable collaborator accounts that no longer have any event assignment.
      for (const userId of collaboratorIds) {
        if (!(await tx.eventCollaborator.count({ where: { userId } }))) {
          await tx.user.updateMany({ where: { id: userId, role: 'COLLABORATOR' }, data: { active: false } });
        }
      }
    });

    return { deleted: true, eventId };
  }

  async listPublic() {
    const events = await this.prisma.event.findMany({
      where: { status: 'PUBLISHED', registrationEnabled: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true, slug: true, name: true, description: true, venue: true, hallName: true, startsAt: true, bannerUrl: true,
        seats: { select: { status: true, rowLabel: true, seatLabel: true, rowOrder: true, columnOrder: true, reservations: { where: { status: 'CONFIRMED' }, select: { id: true } } } },
      },
    });
    return events.map(({ seats, ...event }) => ({
      ...event,
      availableSeats: seats.filter((seat) => seat.status === 'AVAILABLE' && seat.reservations.length === 0).length,
    }));
  }

  async listAdmin(user: { id: string; role: string }) {
    const events = await this.prisma.event.findMany({
      where: user.role === 'ADMIN' ? {} : { collaborators: { some: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, slug: true, name: true, description: true, status: true, registrationEnabled: true, startsAt: true, endsAt: true, closedAt: true, whatsappGroupUrl: true,
        venue: true, hallName: true, seatRows: true, seatColumns: true, formFields: true,
        seats: { select: { status: true, rowLabel: true, seatLabel: true, rowOrder: true, columnOrder: true, reservations: { where: { status: 'CONFIRMED' }, select: { id: true } } } },
        _count: { select: {
          registrations: { where: { status: 'CONFIRMED' } },
        } },
      },
    });
    return Promise.all(events.map(async ({ seats, _count, ...event }) => ({
      ...event,
      seatCount: seats.length,
      occupiedSeats: seats.filter((seat) => seat.reservations.length > 0).length,
      availableSeats: seats.filter((seat) => seat.status === 'AVAILABLE' && seat.reservations.length === 0).length,
      registrationCount: _count.registrations,
      checkedInCount: await this.prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED', checkedInAt: { not: null } } }),
      seatLayout: seats.map(({ status, rowLabel, seatLabel, rowOrder, columnOrder }) => ({ status, rowLabel, seatLabel, rowOrder, columnOrder })),
    })));
  }

  async configureHall(eventId: string, input: Record<string, unknown>) {
    const hallName = this.requiredString(input.hallName, 'El nombre del salÃ³n');
    const rows = Number(input.seatRows);
    const columns = Number(input.seatColumns);
    if (!Number.isInteger(rows) || rows < 1 || rows > 30 || !Number.isInteger(columns) || columns < 1 || columns > 40) {
      throw new BadRequestException('El salÃ³n admite de 1 a 30 filas y de 1 a 40 butacas por fila.');
    }
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, _count: { select: { seats: true } } } });
      if (!event) throw new NotFoundException('No encontramos este evento.');
      if (event._count.seats > 0) throw new ConflictException('Este evento ya tiene un mapa de butacas configurado.');
      await tx.event.update({ where: { id: eventId }, data: { hallName, seatRows: rows, seatColumns: columns } });
      const seats = Array.from({ length: rows * columns }, (_, index) => {
        const rowOrder = Math.floor(index / columns);
        const columnOrder = index % columns;
        return { eventId, rowLabel: rowName(rowOrder), seatLabel: String(columnOrder + 1), rowOrder, columnOrder, status: 'AVAILABLE' as SeatStatus };
      });
      await tx.seat.createMany({ data: seats });
      return { eventId, hallName, seatRows: rows, seatColumns: columns, seatCount: seats.length };
    });
  }

  async listRegistrations(eventId: string, rawPage = '1', rawPageSize = '50') {
    const requestedPage = Number(rawPage);
    const requestedPageSize = Number(rawPageSize);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || !Number.isInteger(requestedPageSize) || requestedPageSize < 1 || requestedPageSize > 100) {
      throw new BadRequestException('La página debe ser positiva y pageSize debe estar entre 1 y 100.');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('No encontramos este evento.');
    const where = { eventId, status: 'CONFIRMED' as const };
    const [registrations, total] = await Promise.all([this.prisma.registration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (requestedPage - 1) * requestedPageSize,
      take: requestedPageSize,
      include: {
        attendee: { select: { firstName: true, lastName: true, email: true, phone: true, institution: true, occupation: true, age: true } },
        reservation: { include: { seat: { select: { rowLabel: true, seatLabel: true } } } },
      },
    }), this.prisma.registration.count({ where })]);
    const items = registrations.map(({ attendee, reservation, ...registration }) => ({
      ...registration,
      attendee,
      seat: reservation?.seat ?? null,
    }));
    return { items, total, page: requestedPage, pageSize: requestedPageSize, hasMore: requestedPage * requestedPageSize < total };
  }

  async checkIn(eventId: string, confirmationCode: string, collaboratorId?: string) {
    if (collaboratorId) {
      const assignment = await this.prisma.eventCollaborator.findUnique({ where: { eventId_userId: { eventId, userId: collaboratorId } }, select: { userId: true } });
      if (!assignment) throw new ForbiddenException('No tienes asignación para acreditar este evento.');
    }
    const registration = await this.prisma.registration.findUnique({
      where: { confirmationCode },
      include: {
        attendee: { select: { firstName: true, lastName: true, email: true } },
        event: { select: { id: true, name: true, closedAt: true } },
        reservation: { include: { seat: { select: { rowLabel: true, seatLabel: true } } } },
      },
    });
    if (!registration || registration.eventId !== eventId || registration.status !== 'CONFIRMED') {
      throw new NotFoundException('No encontramos una inscripción confirmada con ese QR.');
    }
    if (registration.event.closedAt) throw new ConflictException('El evento ya fue finalizado y no admite nuevas acreditaciones.');
    let alreadyCheckedIn = Boolean(registration.checkedInAt);
    if (!alreadyCheckedIn) {
      const result = await this.prisma.registration.updateMany({
        where: { id: registration.id, checkedInAt: null, status: 'CONFIRMED' },
        data: { checkedInAt: new Date() },
      });
      alreadyCheckedIn = result.count === 0;
    }
    const updated = await this.prisma.registration.findUniqueOrThrow({ where: { id: registration.id }, select: { checkedInAt: true } });
    return {
      alreadyCheckedIn,
      checkedInAt: updated.checkedInAt,
      attendee: collaboratorId ? { firstName: registration.attendee.firstName, lastName: registration.attendee.lastName } : registration.attendee,
      event: registration.event,
      seat: registration.reservation?.seat ?? null,
    };
  }

  async getRegistrationPass(slug: string, confirmationCode: string) {
    const registration = await this.prisma.registration.findFirst({
      where: { confirmationCode, status: 'CONFIRMED', event: { slug } },
      select: {
        confirmationCode: true,
        attendee: { select: { firstName: true, lastName: true } },
        event: { select: { name: true, startsAt: true, venue: true, whatsappGroupUrl: true } },
        reservation: { select: { seat: { select: { rowLabel: true, seatLabel: true } } } },
      },
    });
    if (!registration) throw new NotFoundException('No encontramos un pase activo para este formulario.');
    return {
      confirmationCode: registration.confirmationCode,
      attendee: registration.attendee,
      event: registration.event,
      seat: registration.reservation?.seat ?? null,
      whatsappGroupUrl: registration.event.whatsappGroupUrl,
    };
  }

  async findPublic(slug: string, includeRegistrationExtras = false) {
    const event = await this.prisma.event.findFirst({
      where: { slug, status: 'PUBLISHED', registrationEnabled: true },
      include: {
        hall: { select: { photoUrl: true } },
        seats: {
          orderBy: [{ rowOrder: 'asc' }, { columnOrder: 'asc' }],
          include: { reservations: { where: { status: 'CONFIRMED' }, select: { id: true } } },
        },
      },
    });
    if (!event) throw new NotFoundException('No encontramos un formulario activo con ese enlace.');
    const { seats, hall, whatsappGroupUrl, ...details } = event;
    return {
      ...details,
      hallPhotoUrl: hall?.photoUrl ?? null,
      ...(includeRegistrationExtras ? { whatsappGroupUrl } : {}),
      seats: seats.map(({ reservations, ...seat }) => ({
        ...seat,
        occupied: reservations.length > 0,
      })),
    };
  }

  async register(slug: string, input: Record<string, unknown>) {
    const event = await this.findPublic(slug, true);
    const email = this.requiredString(input.email, 'El correo').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Escribe un correo electrónico válido.');
    const firstName = this.requiredString(input.firstName, 'El nombre');
    const lastName = this.requiredString(input.lastName, 'El apellido');
    const phone = this.requiredString(input.phone, 'El teléfono');
    const occupation = this.requiredString(input.occupation, 'La ocupación');
    const seatId = typeof input.seatId === 'string' ? input.seatId : '';
    if (event.seatRows && event.seatRows > 0 && !seatId) throw new BadRequestException('Selecciona una butaca para continuar.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (seatId) {
          const seat = await tx.seat.findFirst({ where: { id: seatId, eventId: event.id, status: 'AVAILABLE' } });
          if (!seat) throw new ConflictException('Esa butaca ya no está disponible. Actualiza el mapa y elige otra.');
          const assigned = await tx.seatReservation.findFirst({
            where: { eventId: event.id, seatId, status: 'CONFIRMED' },
            select: { id: true },
          });
          if (assigned) throw new ConflictException('Esa butaca ya está ocupada. Elige otra.');
        }

        let attendee = await tx.attendee.findUnique({ where: { email } });
        if (!attendee) {
          const ageValue = input.age ? Number(input.age) : undefined;
          if (ageValue !== undefined && (!Number.isInteger(ageValue) || ageValue < 1 || ageValue > 120)) {
            throw new BadRequestException('La edad debe ser un número entre 1 y 120.');
          }
          attendee = await tx.attendee.create({
            data: {
              email, firstName, lastName, phone, occupation,
              institution: this.optionalString(input.institution),
              age: ageValue,
            },
          });
        }

        const registration = await tx.registration.create({
          data: {
            eventId: event.id,
            attendeeId: attendee.id,
            status: 'CONFIRMED',
            referralSource: this.optionalString(input.referralSource),
            expectations: this.optionalString(input.expectations),
            interests: this.optionalString(input.interests),
            perspective: this.optionalString(input.perspective),
            comments: this.optionalString(input.comments),
            customAnswers: this.readCustomAnswers(event.formFields, input.customAnswers),
          },
          select: { id: true, confirmationCode: true, createdAt: true },
        });
        if (seatId) {
          await tx.seatReservation.create({
            data: {
              eventId: event.id,
              seatId,
              registrationId: registration.id,
              status: 'CONFIRMED',
              confirmedAt: new Date(),
            },
          });
        }
        const assignedSeat = seatId
          ? await tx.seat.findUnique({ where: { id: seatId }, select: { rowLabel: true, seatLabel: true } })
          : null;
        return { confirmationCode: registration.confirmationCode, createdAt: registration.createdAt, event: event.name, seat: assignedSeat, whatsappGroupUrl: event.whatsappGroupUrl ?? null };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('El correo ya está inscrito o la butaca acaba de ser ocupada. Actualiza el mapa e intenta otra vez.');
      throw error;
    }
  }

  private requiredString(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${label} es obligatorio.`);
    return value.trim();
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readCustomAnswers(formFields: unknown, value: unknown) {
    if (!Array.isArray(formFields) || !value || typeof value !== 'object' || Array.isArray(value)) return {};
    const submitted = value as Record<string, unknown>;
    const answers: Record<string, string> = {};
    for (const field of formFields) {
      if (!field || typeof field !== 'object') continue;
      const key = (field as Record<string, unknown>).key;
      const answer = typeof key === 'string' ? submitted[key] : undefined;
      if (typeof key === 'string' && typeof answer === 'string' && answer.trim()) answers[key] = answer.trim().slice(0, 4000);
    }
    return answers;
  }
}

