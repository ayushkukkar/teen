import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { db } from '@workspace/db';
import { admins, adminLogs } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { hashPassword } from './auth.js';
import { v4 as uuidv4 } from 'uuid';

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'teenpatti-admin-secret-key';

export function signAdminToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, ADMIN_SECRET, { expiresIn: '8h' });
}

export function getAdminAuth(req: Request): { id: string; username: string } | null {
  const auth = (req.headers.authorization as string) || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, ADMIN_SECRET) as { id: string; username: string };
  } catch {
    return null;
  }
}

export async function ensureDefaultAdmin(): Promise<void> {
  const [existing] = await db.select().from(admins).where(eq(admins.username, 'admin')).limit(1);
  if (!existing) {
    await db.insert(admins).values({
      id: uuidv4(),
      username: 'admin',
      passwordHash: await hashPassword('admin1234'),
    });
  }
}

export async function logAdminAction(
  admin: { id: string; username: string },
  action: string,
  target: { id: string; username: string } | null,
  details: Record<string, unknown>,
): Promise<void> {
  await db.insert(adminLogs).values({
    id: uuidv4(),
    adminId: admin.id,
    adminUsername: admin.username,
    action,
    targetId: target?.id ?? null,
    targetUsername: target?.username ?? null,
    details,
  }).catch(() => {});
}
