import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  created_at: string;
  updated_at: string;
}

export interface ProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string; // YYYY-MM-DD
  address: string;
  age: number; // Dynamically calculated or synced
  gender?: string;
  profile_picture?: string;
  occupation_status?: string;
  created_at: string;
  updated_at: string;
}

export interface UserMemoryRecord {
  id: string;
  user_id: string;
  memory_key: string;
  memory_value: string;
  memory_type: 'preference' | 'identity' | 'work' | 'personal' | 'general' | 'user_requested';
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export interface ConversationRecord {
  id: string;
  user_id: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    emotion?: string;
    detectedLanguage?: string;
    voiceName?: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface DatabaseSchema {
  users: UserRecord[];
  profiles: ProfileRecord[];
  user_memories: UserMemoryRecord[];
  sessions: SessionRecord[];
  conversations: ConversationRecord[];
}

// Age calculation helper based on Date of Birth
export function calculateAge(dobString: string): number {
  if (!dobString) return 0;
  const birthDate = new Date(dobString);
  if (isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
}

// Password hashing using PBKDF2
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, s, 10000, 64, 'sha512').toString('hex');
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const { hash: testHash } = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
  } catch {
    return false;
  }
}

// Database file path
function getDbFilePath(): string {
  try {
    const currentDir = process.cwd();
    const dataDir = path.resolve(currentDir, 'server', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.resolve(dataDir, 'tia_database.json');
  } catch {
    const dataDir = path.resolve('/server', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.resolve(dataDir, 'tia_database.json');
  }
}

let cachedDb: DatabaseSchema | null = null;

// Initial Seed Data for verification and immediate testing
function getInitialSeedData(): DatabaseSchema {
  const anuragSalt = '8a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d';
  const anuragHash = crypto
    .pbkdf2Sync('password123', anuragSalt, 10000, 64, 'sha512')
    .toString('hex');

  const testSalt = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
  const testHash = crypto
    .pbkdf2Sync('password123', testSalt, 10000, 64, 'sha512')
    .toString('hex');

  const anuragUserId = 'usr-anurag-001';
  const testUserId = 'usr-testuser-002';

  const now = new Date().toISOString();

  return {
    users: [
      {
        id: anuragUserId,
        email: 'anurag@tia.ai',
        password_hash: anuragHash,
        salt: anuragSalt,
        created_at: now,
        updated_at: now,
      },
      {
        id: testUserId,
        email: 'test@tia.ai',
        password_hash: testHash,
        salt: testSalt,
        created_at: now,
        updated_at: now,
      },
    ],
    profiles: [
      {
        id: 'prof-anurag-001',
        user_id: anuragUserId,
        full_name: 'Anurag',
        date_of_birth: '2000-05-15',
        address: 'Patna, India',
        age: calculateAge('2000-05-15'),
        gender: 'Male',
        occupation_status: 'working on a startup',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'prof-test-002',
        user_id: testUserId,
        full_name: 'Test User',
        date_of_birth: '2003-08-20',
        address: 'Delhi, India',
        age: calculateAge('2003-08-20'),
        gender: 'Female',
        occupation_status: 'Student',
        created_at: now,
        updated_at: now,
      },
    ],
    user_memories: [
      {
        id: 'mem-anurag-1',
        user_id: anuragUserId,
        memory_key: 'identity',
        memory_value: 'Anurag is the creator and owner of Tia.',
        memory_type: 'identity',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mem-anurag-2',
        user_id: anuragUserId,
        memory_key: 'work',
        memory_value: 'Anurag lives in Patna, India and is working on a startup.',
        memory_type: 'work',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mem-test-1',
        user_id: testUserId,
        memory_key: 'identity',
        memory_value: 'Test User is a student living in Delhi, India.',
        memory_type: 'identity',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mem-test-2',
        user_id: testUserId,
        memory_key: 'education',
        memory_value: 'Test User is currently studying computer science.',
        memory_type: 'work',
        created_at: now,
        updated_at: now,
      },
    ],
    sessions: [],
    conversations: [],
  };
}

// Load database from disk
export function loadDatabase(): DatabaseSchema {
  if (cachedDb) {
    return cachedDb;
  }

  const filePath = getDbFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.profiles)) {
        const schema = parsed as DatabaseSchema;
        cachedDb = schema;
        return schema;
      }
    }
  } catch (err) {
    console.warn('Error reading database file, initializing with seed data:', err);
  }

  // Initialize with seed data
  const seed = getInitialSeedData();
  cachedDb = seed;
  saveDatabase(cachedDb);
  return seed;
}

// Persist database to disk
export function saveDatabase(db: DatabaseSchema): boolean {
  cachedDb = db;
  const filePath = getDbFilePath();
  try {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error('Failed to save database to disk:', err);
    return false;
  }
}

// Generate secure tokens
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

// ==========================================
// AUTHENTICATION & ROW-LEVEL SECURITY (RLS)
// ==========================================

export function createUserSession(userId: string): string {
  const db = loadDatabase();
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days session

  // Remove existing sessions for this user if desired or append
  db.sessions = db.sessions.filter((s) => new Date(s.expires_at) > now);
  db.sessions.push({
    token,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  saveDatabase(db);
  return token;
}

export function getUserByToken(token: string): { user: UserRecord; profile: ProfileRecord } | null {
  if (!token) return null;
  const db = loadDatabase();
  const now = new Date();

  const session = db.sessions.find(
    (s) => s.token === token && new Date(s.expires_at) > now
  );
  if (!session) return null;

  const user = db.users.find((u) => u.id === session.user_id);
  if (!user) return null;

  let profile = db.profiles.find((p) => p.user_id === user.id);
  if (!profile) {
    // Create fallback profile if missing
    profile = {
      id: generateId('prof'),
      user_id: user.id,
      full_name: user.email.split('@')[0],
      date_of_birth: '2000-01-01',
      address: 'India',
      age: calculateAge('2000-01-01'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.profiles.push(profile);
    saveDatabase(db);
  } else {
    // Ensure age is always computed accurately
    profile.age = calculateAge(profile.date_of_birth);
  }

  return { user, profile };
}

export function destroyUserSession(token: string): boolean {
  if (!token) return false;
  const db = loadDatabase();
  const initialCount = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.token !== token);
  saveDatabase(db);
  return db.sessions.length !== initialCount;
}

// STRICT ROW-LEVEL ACCESS: User Memories
export function getUserMemories(userId: string): UserMemoryRecord[] {
  const db = loadDatabase();
  return db.user_memories.filter((m) => m.user_id === userId);
}

export function addUserMemory(
  userId: string,
  memoryValue: string,
  memoryType: UserMemoryRecord['memory_type'] = 'general',
  memoryKey?: string
): UserMemoryRecord {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const key = memoryKey || memoryValue.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_');

  const newMemory: UserMemoryRecord = {
    id: generateId('mem'),
    user_id: userId,
    memory_key: key,
    memory_value: memoryValue,
    memory_type: memoryType,
    created_at: now,
    updated_at: now,
  };

  db.user_memories.push(newMemory);
  saveDatabase(db);
  return newMemory;
}

export function deleteUserMemory(userId: string, memoryId: string): boolean {
  const db = loadDatabase();
  const initialLength = db.user_memories.length;
  // STRICT RLS: Only delete if user_id matches
  db.user_memories = db.user_memories.filter(
    (m) => !(m.id === memoryId && m.user_id === userId)
  );
  if (db.user_memories.length !== initialLength) {
    saveDatabase(db);
    return true;
  }
  return false;
}

export function forgetUserMemoryByQuery(userId: string, query: string): number {
  const db = loadDatabase();
  const q = query.toLowerCase().trim();
  const initialLength = db.user_memories.length;
  db.user_memories = db.user_memories.filter(
    (m) => !(m.user_id === userId && (m.memory_value.toLowerCase().includes(q) || m.memory_key.toLowerCase().includes(q)))
  );
  const removedCount = initialLength - db.user_memories.length;
  if (removedCount > 0) {
    saveDatabase(db);
  }
  return removedCount;
}

// STRICT ROW-LEVEL ACCESS: User Profile
export function getUserProfile(userId: string): ProfileRecord | null {
  const db = loadDatabase();
  const profile = db.profiles.find((p) => p.user_id === userId);
  if (profile) {
    profile.age = calculateAge(profile.date_of_birth);
  }
  return profile || null;
}

export function updateUserProfile(
  userId: string,
  updates: Partial<Omit<ProfileRecord, 'id' | 'user_id' | 'created_at'>>
): ProfileRecord | null {
  const db = loadDatabase();
  const profile = db.profiles.find((p) => p.user_id === userId);
  if (!profile) return null;

  if (updates.full_name !== undefined) profile.full_name = updates.full_name.trim();
  if (updates.date_of_birth !== undefined) {
    profile.date_of_birth = updates.date_of_birth;
    profile.age = calculateAge(updates.date_of_birth);
  }
  if (updates.address !== undefined) profile.address = updates.address.trim();
  if (updates.gender !== undefined) profile.gender = updates.gender;
  if (updates.profile_picture !== undefined) profile.profile_picture = updates.profile_picture;
  if (updates.occupation_status !== undefined) profile.occupation_status = updates.occupation_status.trim();

  profile.updated_at = new Date().toISOString();
  saveDatabase(db);
  return profile;
}

// STRICT ROW-LEVEL ACCESS: User Conversations
export function getUserConversation(userId: string): ConversationRecord | null {
  const db = loadDatabase();
  const conv = db.conversations.find((c) => c.user_id === userId);
  return conv || null;
}

export function saveUserConversation(
  userId: string,
  messages: ConversationRecord['messages']
): ConversationRecord {
  const db = loadDatabase();
  const now = new Date().toISOString();
  let conv = db.conversations.find((c) => c.user_id === userId);

  if (!conv) {
    conv = {
      id: generateId('conv'),
      user_id: userId,
      messages,
      created_at: now,
      updated_at: now,
    };
    db.conversations.push(conv);
  } else {
    conv.messages = messages;
    conv.updated_at = now;
  }

  saveDatabase(db);
  return conv;
}

export function clearUserConversation(userId: string): boolean {
  const db = loadDatabase();
  const conv = db.conversations.find((c) => c.user_id === userId);
  if (conv) {
    conv.messages = [];
    conv.updated_at = new Date().toISOString();
    saveDatabase(db);
    return true;
  }
  return false;
}
