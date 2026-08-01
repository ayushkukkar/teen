import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import { users } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/auth.js';

async function requireAuth(req: Request, res: Response): Promise<{ user: any } | null> {
  const payload = getAuthUser(req);
  if (!payload) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  const [user] = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id)).catch(() => {});
  return { user };
}

const router = Router();

// tableId → Map<userId, username>
const rooms = new Map<string, Map<string, string>>();
// userId → pending signals queue
const pendingSignals = new Map<string, Array<{ from: string; data: any }>>();
// userId → last heartbeat ms
const lastHeartbeat = new Map<string, number>();

const HEARTBEAT_TTL = 12_000;

function cleanStale() {
  const now = Date.now();
  for (const [uid, ts] of lastHeartbeat) {
    if (now - ts > HEARTBEAT_TTL) {
      lastHeartbeat.delete(uid);
      pendingSignals.delete(uid);
      for (const members of rooms.values()) members.delete(uid);
    }
  }
}
setInterval(cleanStale, 5_000);

function roomPeers(tableId: string, excludeId: string) {
  const room = rooms.get(tableId);
  if (!room) return [];
  return [...room.entries()]
    .filter(([uid]) => uid !== excludeId)
    .map(([userId, username]) => ({ userId, username }));
}

// POST /api/voice/join  { tableId }
router.post('/join', async (req, res) => {
  const a = await requireAuth(req, res); if (!a) return;
  const { tableId } = req.body;
  if (!tableId) return void res.status(400).json({ error: 'tableId required' });

  if (!rooms.has(tableId)) rooms.set(tableId, new Map());
  rooms.get(tableId)!.set(a.user.id, a.user.username);
  lastHeartbeat.set(a.user.id, Date.now());
  if (!pendingSignals.has(a.user.id)) pendingSignals.set(a.user.id, []);

  res.json({ ok: true, peers: roomPeers(tableId, a.user.id) });
});

// GET /api/voice/signals?tableId=  → consume signals + get peers (heartbeat)
router.get('/signals', async (req, res) => {
  const a = await requireAuth(req, res); if (!a) return;
  const tableId = req.query.tableId as string;
  if (!tableId) return void res.status(400).json({ error: 'tableId required' });

  lastHeartbeat.set(a.user.id, Date.now());

  const signals = pendingSignals.get(a.user.id) ?? [];
  pendingSignals.set(a.user.id, []);

  res.json({ signals, peers: roomPeers(tableId, a.user.id) });
});

// POST /api/voice/signal  { to, data }
router.post('/signal', async (req, res) => {
  const a = await requireAuth(req, res); if (!a) return;
  const { to, data } = req.body;
  if (!to || !data) return void res.status(400).json({ error: 'to and data required' });

  lastHeartbeat.set(a.user.id, Date.now());
  if (!pendingSignals.has(to)) pendingSignals.set(to, []);
  pendingSignals.get(to)!.push({ from: a.user.id, data });

  res.json({ ok: true });
});

// POST /api/voice/leave  { tableId }
router.post('/leave', async (req, res) => {
  const a = await requireAuth(req, res); if (!a) return;
  const { tableId } = req.body ?? {};

  if (tableId && rooms.has(tableId)) rooms.get(tableId)!.delete(a.user.id);
  lastHeartbeat.delete(a.user.id);
  pendingSignals.delete(a.user.id);

  res.json({ ok: true });
});

export default router;
