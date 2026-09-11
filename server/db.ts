import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface UserRecord {
  id: string;
  phone_number: string;
  created_at: string;
  updated_at: string;
  supabase_id?: string;
}

export interface ProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string;
  date_of_birth: string; // YYYY-MM-DD
  address: string; // Location / City
  age: number; // Dynamically calculated from date_of_birth
  gender?: string;
  profile_picture?: string;
  occupation_status?: string; // Current Work / Role
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

// Initial Seed Data for verification and testing
function getInitialSeedData(): DatabaseSchema {
  const anuragUserId = 'usr-anurag-001';
  const testUserId = 'usr-testuser-002';
  const now = new Date().toISOString();

  return {
    users: [
      {
        id: anuragUserId,
        phone_number: '+919876543210',
        created_at: now,
        updated_at: now,
      },
      {
        id: testUserId,
        phone_number: '+919876543211',
        created_at: now,
        updated_at: now,
      },
    ],
    profiles: [
      {
        id: 'prof-anurag-001',
        user_id: anuragUserId,
        full_name: 'Anurag',
        phone_number: '+919876543210',
        date_of_birth: '2000-05-15',
        address: 'Patna, India',
        age: calculateAge('2000-05-15'),
        gender: 'Male',
        occupation_status: 'Startup',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'prof-test-002',
        user_id: testUserId,
        full_name: 'Test User',
        phone_number: '+919876543211',
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
  const filePath = getDbFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.profiles)) {
        // Ensure every user has phone_number
        parsed.users = parsed.users.map((u: any) => {
          if (!u.phone_number) {
            u.phone_number = u.email === 'anurag@tia.ai' ? '+919876543210' : '+919876543211';
          }
          return u;
        });
        parsed.profiles = parsed.profiles.map((p: any) => {
          if (!p.phone_number) {
            p.phone_number = p.user_id === 'usr-anurag-001' ? '+919876543210' : '+919876543211';
          }
          return p;
        });

        const schema = parsed as DatabaseSchema;
        cachedDb = schema;
        return schema;
      }
    }
  } catch (err) {
    console.warn('Error reading database file, initializing with seed data:', err);
  }

  // Initialize with seed data
  if (cachedDb) return cachedDb;
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
// USER & PHONE LOOKUPS
// ==========================================

export function findUserByPhone(phone: string): { user: UserRecord; profile: ProfileRecord } | null {
  const db = loadDatabase();
  const user = db.users.find((u) => u.phone_number === phone);
  if (!user) return null;

  let profile = db.profiles.find((p) => p.user_id === user.id);
  if (!profile) {
    profile = {
      id: generateId('prof'),
      user_id: user.id,
      full_name: 'Owner',
      phone_number: user.phone_number,
      date_of_birth: '2000-01-01',
      address: 'India',
      age: calculateAge('2000-01-01'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.profiles.push(profile);
    saveDatabase(db);
  } else {
    profile.age = calculateAge(profile.date_of_birth);
  }

  return { user, profile };
}

export function findUserById(userId: string): { user: UserRecord; profile: ProfileRecord } | null {
  const db = loadDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;

  let profile = db.profiles.find((p) => p.user_id === user.id);
  if (!profile) {
    profile = {
      id: generateId('prof'),
      user_id: user.id,
      full_name: 'Owner',
      phone_number: user.phone_number,
      date_of_birth: '2000-01-01',
      address: 'India',
      age: calculateAge('2000-01-01'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.profiles.push(profile);
    saveDatabase(db);
  } else {
    profile.age = calculateAge(profile.date_of_birth);
  }

  return { user, profile };
}

/**
 * Gets existing user by phone, or creates a new user and profile.
 * If user already exists, returns existing user and profile without duplicating.
 */
export function getOrCreateUserByPhone(
  phone: string,
  signupData?: {
    full_name?: string;
    date_of_birth?: string;
    address?: string;
    occupation_status?: string;
    gender?: string;
    supabase_user_id?: string;
  }
): { user: UserRecord; profile: ProfileRecord; isNewUser: boolean } {
  const db = loadDatabase();
  const now = new Date().toISOString();

  // Check if user exists by phone or by supabase_user_id
  let existingUser = db.users.find((u) => u.phone_number === phone);
  if (!existingUser && signupData?.supabase_user_id) {
    existingUser = db.users.find((u) => u.id === signupData.supabase_user_id || u.supabase_id === signupData.supabase_user_id);
  }

  if (existingUser) {
    let profile = db.profiles.find((p) => p.user_id === existingUser!.id);
    if (!profile) {
      profile = {
        id: generateId('prof'),
        user_id: existingUser.id,
        full_name: signupData?.full_name?.trim() || 'Owner',
        phone_number: phone,
        date_of_birth: signupData?.date_of_birth || '2000-01-01',
        address: signupData?.address?.trim() || 'India',
        age: calculateAge(signupData?.date_of_birth || '2000-01-01'),
        gender: signupData?.gender || 'unspecified',
        occupation_status: signupData?.occupation_status?.trim() || 'Explorer',
        created_at: now,
        updated_at: now,
      };
      db.profiles.push(profile);
      saveDatabase(db);
    } else {
      // If user had existing profile but supplied newer info during signup, update it
      if (signupData?.full_name) profile.full_name = signupData.full_name.trim();
      if (signupData?.date_of_birth) {
        profile.date_of_birth = signupData.date_of_birth;
        profile.age = calculateAge(signupData.date_of_birth);
      }
      if (signupData?.address) profile.address = signupData.address.trim();
      if (signupData?.occupation_status) profile.occupation_status = signupData.occupation_status.trim();
      profile.phone_number = phone;
      profile.updated_at = now;
      saveDatabase(db);
    }

    return { user: existingUser, profile, isNewUser: false };
  }

  // Create new user
  const userId = signupData?.supabase_user_id || generateId('usr');
  const profileId = generateId('prof');
  const dob = signupData?.date_of_birth || '2000-01-01';
  const cleanName = signupData?.full_name?.trim() || 'Owner';

  const newUser: UserRecord = {
    id: userId,
    phone_number: phone,
    supabase_id: signupData?.supabase_user_id,
    created_at: now,
    updated_at: now,
  };

  const newProfile: ProfileRecord = {
    id: profileId,
    user_id: userId,
    full_name: cleanName,
    phone_number: phone,
    date_of_birth: dob,
    address: signupData?.address?.trim() || '',
    age: calculateAge(dob),
    gender: signupData?.gender || 'unspecified',
    occupation_status: signupData?.occupation_status?.trim() || 'Explorer',
    created_at: now,
    updated_at: now,
  };

  db.users.push(newUser);
  db.profiles.push(newProfile);
  saveDatabase(db);

  // Seed initial user memories
  addUserMemory(
    userId,
    `${cleanName} is the owner and companion of Tia.`,
    'identity',
    'owner_identity'
  );
  if (signupData?.address?.trim()) {
    addUserMemory(
      userId,
      `${cleanName} lives in ${signupData.address.trim()}.`,
      'personal',
      'location'
    );
  }
  if (signupData?.occupation_status?.trim()) {
    addUserMemory(
      userId,
      `${cleanName} is currently ${signupData.occupation_status.trim()}.`,
      'work',
      'occupation'
    );
  }

  return { user: newUser, profile: newProfile, isNewUser: true };
}

// ==========================================
// AUTHENTICATION & ROW-LEVEL SECURITY (RLS)
// ==========================================

export function createUserSession(userId: string): string {
  const db = loadDatabase();
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30-day session

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
    profile = {
      id: generateId('prof'),
      user_id: user.id,
      full_name: 'Owner',
      phone_number: user.phone_number,
      date_of_birth: '2000-01-01',
      address: 'India',
      age: calculateAge('2000-01-01'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.profiles.push(profile);
    saveDatabase(db);
  } else {
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
  if (updates.phone_number !== undefined) profile.phone_number = updates.phone_number.trim();

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
