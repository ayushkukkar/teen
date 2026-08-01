// In-memory game state store (single process, sufficient for MVP demo)
const _globalKey = '__teenpatti_store__';
const g = global as any;
if (!g[_globalKey]) {
  g[_globalKey] = { tables: new Map<string, any>() };
}
export const store: { tables: Map<string, any> } = g[_globalKey];

export function getTable(tableId: string): any {
  return store.tables.get(tableId);
}

export function setTable(tableId: string, state: any): void {
  store.tables.set(tableId, state);
}

export function deleteTable(tableId: string): void {
  store.tables.delete(tableId);
}

export function bumpVersion(state: any): void {
  state.version = (state.version || 0) + 1;
  state.updatedAt = Date.now();
}
