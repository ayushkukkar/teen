import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';

const SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'teenpatti-demo-secret-key-change-in-prod';

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    return jwt.verify(token, SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getAuthUser(req: Request): { id: string; username: string } | null {
  const auth = (req.headers.authorization as string) || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verifyToken(token) as { id: string; username: string } | null;
}
