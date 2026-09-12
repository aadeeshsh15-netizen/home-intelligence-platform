import { describe, it, expect } from 'vitest';
import { UpdateHomeSchema } from '../../src/domain/home.schema';

describe('Home Name Validation Schema Unit Tests', () => {
  it('accepts standard home names', () => {
    const validNames = [
      'My Home',
      'Sharma Residence',
      'Oakwood House',
      'The Nest',
      'Apex Horizon Estate',
      'Penthouse 402',
    ];

    for (const name of validNames) {
      const result = UpdateHomeSchema.safeParse({ name });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(name);
      }
    }
  });

  it('accepts Unicode names and non-Latin alphabets', () => {
    const unicodeNames = [
      'घर',
      'Maison Étoile',
      'Schloss Schönbrunn',
      'Casa do Sol',
      '桜の家',
      'بيت العائلة',
    ];

    for (const name of unicodeNames) {
      const result = UpdateHomeSchema.safeParse({ name });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(name);
      }
    }
  });

  it('accepts names with apostrophes, hyphens, and numbers', () => {
    const specialNames = [
      "Aadeesh's Home",
      'Villa-on-the-Hill',
      'Unit #42',
      'Residence & Retreat',
      "O'Connor Manor",
    ];

    for (const name of specialNames) {
      const result = UpdateHomeSchema.safeParse({ name });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(name);
      }
    }
  });

  it('trims leading and trailing whitespace', () => {
    const result = UpdateHomeSchema.safeParse({ name: '   Sharma Residence   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Sharma Residence');
    }
  });

  it('rejects empty string', () => {
    const result = UpdateHomeSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Home name cannot be empty');
    }
  });

  it('rejects whitespace-only strings', () => {
    const result = UpdateHomeSchema.safeParse({ name: '     ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Home name cannot be empty');
    }
  });

  it('rejects names exceeding 64 characters', () => {
    const longName = 'A'.repeat(65);
    const result = UpdateHomeSchema.safeParse({ name: longName });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Home name must not exceed 64 characters');
    }
  });

  it('accepts names exactly 64 characters', () => {
    const exactName = 'A'.repeat(64);
    const result = UpdateHomeSchema.safeParse({ name: exactName });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(exactName);
    }
  });

  it('rejects missing name field', () => {
    const result = UpdateHomeSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
