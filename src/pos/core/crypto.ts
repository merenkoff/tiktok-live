// src/pos/core/crypto.ts

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export function generateSessionToken(): string {
  return `pos_${crypto.randomBytes(32).toString('hex')}`;
}

export function normalizePin(pin: string): string {
  return pin.replace(/\D/g, '');
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
