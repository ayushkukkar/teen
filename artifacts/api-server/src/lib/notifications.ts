// In-memory notifications (short-lived; per-process is fine for MVP)
const KEY = '__tp_notifications__';
const g = global as any;
if (!g[KEY]) g[KEY] = { byUser: new Map<string, any[]>(), counter: 0 };
const N: { byUser: Map<string, any[]>; counter: number } = g[KEY];

export function pushNotification(userId: string, notif: Record<string, any>): void {
  const list = N.byUser.get(userId) || [];
  list.push({ ...notif, id: notif.id || ('n_' + (++N.counter) + '_' + Date.now()), createdAt: Date.now() });
  N.byUser.set(userId, list);
}

export function getNotifications(userId: string): any[] {
  const list = N.byUser.get(userId) || [];
  const now = Date.now();
  const alive = list.filter((n: any) => {
    if (n.status && n.status !== 'pending') return (now - n.createdAt) < 20_000;
    return (now - n.createdAt) < 300_000;
  });
  N.byUser.set(userId, alive);
  return alive;
}

export function updateNotification(userId: string, notifId: string, patch: Record<string, any>): any {
  const list = N.byUser.get(userId) || [];
  const idx = list.findIndex((n: any) => n.id === notifId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  N.byUser.set(userId, list);
  return list[idx];
}

export function findNotification(userId: string, notifId: string): any {
  const list = N.byUser.get(userId) || [];
  return list.find((n: any) => n.id === notifId) || null;
}

export function removeNotification(userId: string, notifId: string): void {
  const list = N.byUser.get(userId) || [];
  N.byUser.set(userId, list.filter((n: any) => n.id !== notifId));
}
