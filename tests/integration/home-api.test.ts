import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db';
import { GET, PATCH } from '../../src/app/api/home/route';

describe('Home Identity & Settings API Integration Tests', () => {
  let home: any;
  let originalName: string;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found in database');
    originalName = home.name;
  });

  afterAll(async () => {
    if (home) {
      await prisma.home.update({
        where: { id: home.id },
        data: { name: originalName || 'Apex Horizon Estate' },
      });
    }
  });

  it('GET /api/home returns home identity and estate structure', async () => {
    const req = new NextRequest('http://localhost:3000/api/home');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.home).toBeDefined();
    expect(data.home.id).toBe(home.id);
    expect(typeof data.home.name).toBe('string');
    expect(data.home.totalFloors).toBeGreaterThanOrEqual(1);
    expect(data.home.totalRooms).toBeGreaterThanOrEqual(1);
    expect(data.home.totalSensors).toBeGreaterThanOrEqual(1);
    expect(data.climate).toBeDefined();
  });

  it('PATCH /api/home updates home name and persists to database', async () => {
    const newName = 'Sharma Residence';
    const req = new NextRequest('http://localhost:3000/api/home', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.home).toBeDefined();
    expect(data.home.name).toBe(newName);

    // Verify database persistence
    const reloaded = await prisma.home.findUnique({
      where: { id: home.id },
    });
    expect(reloaded?.name).toBe(newName);
  });

  it('PATCH /api/home supports Unicode characters and accents', async () => {
    const unicodeName = 'घर (Maison Étoile)';
    const req = new NextRequest('http://localhost:3000/api/home', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: unicodeName }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.home.name).toBe(unicodeName);

    const reloaded = await prisma.home.findUnique({
      where: { id: home.id },
    });
    expect(reloaded?.name).toBe(unicodeName);
  });

  it('PATCH /api/home automatically trims leading and trailing whitespace', async () => {
    const req = new NextRequest('http://localhost:3000/api/home', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   The Nest   ' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.home.name).toBe('The Nest');

    const reloaded = await prisma.home.findUnique({
      where: { id: home.id },
    });
    expect(reloaded?.name).toBe('The Nest');
  });

  it('PATCH /api/home rejects empty or whitespace-only name with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/home', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Validation failed');
    expect(data.details).toContain('Home name cannot be empty');
  });

  it('PATCH /api/home rejects names exceeding 64 characters with 400', async () => {
    const longName = 'A'.repeat(65);
    const req = new NextRequest('http://localhost:3000/api/home', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: longName }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Validation failed');
    expect(data.details).toContain('Home name must not exceed 64 characters');
  });

  it('PATCH /api/home rejects unauthorized anonymous requests with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/home?auth=anonymous', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Home' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });
});
