import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const imageTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const maxImageBytes = 5 * 1024 * 1024;

@Injectable()
export class HallsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    return this.prisma.hall.findMany({ orderBy: [{ venue: 'asc' }, { name: 'asc' }] });
  }

  async create(input: Record<string, unknown>) {
    const data = this.validate(input);
    const photoUrl = typeof input.photoDataUrl === 'string' && input.photoDataUrl ? await this.savePhoto(input.photoDataUrl) : undefined;
    return this.prisma.hall.create({ data: { ...data, ...(photoUrl ? { photoUrl } : {}) } });
  }

  async update(id: string, input: Record<string, unknown>) {
    const data = this.validate(input);
    const hall = await this.prisma.hall.findUnique({ where: { id }, select: { id: true } });
    if (!hall) throw new NotFoundException('No encontramos ese salón.');
    const photoUrl = typeof input.photoDataUrl === 'string' && input.photoDataUrl ? await this.savePhoto(input.photoDataUrl) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const updatedHall = await tx.hall.update({ where: { id }, data: { ...data, ...(photoUrl ? { photoUrl } : {}) } });
      await tx.event.updateMany({ where: { hallId: id }, data: { hallName: updatedHall.name, venue: updatedHall.venue } });
      return updatedHall;
    });
  }

  private validate(input: Record<string, unknown>) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const venue = typeof input.venue === 'string' ? input.venue.trim() : '';
    const seatRows = Number(input.seatRows);
    const seatColumns = Number(input.seatColumns);
    if (!name || name.length > 120) throw new BadRequestException('Escribe un nombre de salón de hasta 120 caracteres.');
    if (!venue || venue.length > 180) throw new BadRequestException('Escribe una ubicación de hasta 180 caracteres.');
    if (!Number.isInteger(seatRows) || seatRows < 1 || seatRows > 30 || !Number.isInteger(seatColumns) || seatColumns < 1 || seatColumns > 40) {
      throw new BadRequestException('El salón admite de 1 a 30 filas y de 1 a 40 butacas por fila.');
    }
    const seatLayout = Array.isArray(input.seatLayout) ? input.seatLayout : [];
    return { name, venue, seatRows, seatColumns, seatLayout: seatLayout as Prisma.InputJsonValue };
  }

  private async savePhoto(dataUrl: string) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
    if (!match) throw new BadRequestException('La foto debe ser JPG, PNG o WebP.');
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0 || bytes.length > maxImageBytes) throw new BadRequestException('La foto debe pesar hasta 5 MB.');
    let detectedFormat = '';
    try {
      const image = sharp(bytes, { failOn: 'error', limitInputPixels: 25_000_000, animated: false });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > 25_000_000) throw new Error('invalid dimensions');
      await image.stats();
      detectedFormat = metadata.format ?? '';
    } catch {
      throw new BadRequestException('El archivo no contiene una imagen válida o supera el límite de dimensiones.');
    }
    const detectedMime = detectedFormat === 'jpeg' ? 'image/jpeg' : detectedFormat === 'png' ? 'image/png' : detectedFormat === 'webp' ? 'image/webp' : '';
    if (detectedMime !== mimeType) {
      throw new BadRequestException('El contenido del archivo no coincide con su formato de imagen.');
    }
    const directory = resolve(process.cwd(), 'uploads', 'halls');
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}${imageTypes[mimeType]}`;
    await writeFile(resolve(directory, filename), bytes, { flag: 'wx' });
    return `/uploads/halls/${filename}`;
  }
}
