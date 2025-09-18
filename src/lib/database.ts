import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Application {
  id?: number;
  name: string;
  url: string;
  createdAt: number;
}

export interface StatusLog {
  id?: number;
  appId: number;
  timestamp: number;
  status: 'UP' | 'DOWN' | 'CHECKING';
  statusCode: number;
  responseTime: number;
}

interface VigilDB extends DBSchema {
  applications: {
    key: number;
    value: Application;
    indexes: { 'by-url': string };
  };
  status_logs: {
    key: number;
    value: StatusLog;
    indexes: { 
      'by-app': number;
      'by-app-timestamp': [number, number];
    };
  };
}

let dbInstance: IDBPDatabase<VigilDB> | null = null;

export async function initializeDatabase(): Promise<IDBPDatabase<VigilDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<VigilDB>('VigilDB', 1, {
    upgrade(db) {
      // Applications store
      const appsStore = db.createObjectStore('applications', {
        keyPath: 'id',
        autoIncrement: true,
      });
      appsStore.createIndex('by-url', 'url', { unique: true });

      // Status logs store
      const logsStore = db.createObjectStore('status_logs', {
        keyPath: 'id',
        autoIncrement: true,
      });
      logsStore.createIndex('by-app', 'appId');
      logsStore.createIndex('by-app-timestamp', ['appId', 'timestamp']);
    },
  });

  return dbInstance;
}

export async function addApplication(app: Omit<Application, 'id' | 'createdAt'>): Promise<number> {
  const db = await initializeDatabase();
  const application: Omit<Application, 'id'> = {
    ...app,
    createdAt: Date.now(),
  };
  return await db.add('applications', application);
}

export async function getApplications(): Promise<Application[]> {
  const db = await initializeDatabase();
  return await db.getAll('applications');
}

export async function updateApplication(id: number, updates: Partial<Application>): Promise<void> {
  const db = await initializeDatabase();
  const app = await db.get('applications', id);
  if (app) {
    await db.put('applications', { ...app, ...updates });
  }
}

export async function deleteApplication(id: number): Promise<void> {
  const db = await initializeDatabase();
  const tx = db.transaction(['applications', 'status_logs'], 'readwrite');
  
  // Delete the application
  await tx.objectStore('applications').delete(id);
  
  // Delete all associated logs
  const logsStore = tx.objectStore('status_logs');
  const logIndex = logsStore.index('by-app');
  const logs = await logIndex.getAllKeys(id);
  
  for (const logKey of logs) {
    await logsStore.delete(logKey);
  }
  
  await tx.done;
}

export async function addStatusLog(log: Omit<StatusLog, 'id'>): Promise<number> {
  const db = await initializeDatabase();
  return await db.add('status_logs', log);
}

export async function getStatusLogs(appId: number, limit?: number): Promise<StatusLog[]> {
  const db = await initializeDatabase();
  const index = db.transaction('status_logs').store.index('by-app-timestamp');
  const range = IDBKeyRange.bound([appId, 0], [appId, Date.now()]);
  
  let logs = await index.getAll(range);
  logs = logs.sort((a, b) => b.timestamp - a.timestamp);
  
  return limit ? logs.slice(0, limit) : logs;
}

export async function getLatestStatusLog(appId: number): Promise<StatusLog | undefined> {
  const logs = await getStatusLogs(appId, 1);
  return logs[0];
}

export async function calculateUptime(appId: number, hours = 24): Promise<number> {
  const db = await initializeDatabase();
  const since = Date.now() - (hours * 60 * 60 * 1000);
  
  const index = db.transaction('status_logs').store.index('by-app-timestamp');
  const range = IDBKeyRange.bound([appId, since], [appId, Date.now()]);
  const logs = await index.getAll(range);
  
  if (logs.length === 0) return 0;
  
  const upLogs = logs.filter(log => log.status === 'UP');
  return (upLogs.length / logs.length) * 100;
}