import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
  updated_at: string;
  phone_number?: string;
  supabase_id?: string;
}

export interface ProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  username: string;
  date_of_birth: string; // YYYY-MM-DD
  location: string; // Location / City
  current_work: string; // Current Work / Role
  age: number; // Dynamically calculated from date_of_birth
  address?: string; // Compatibility alias for location
  occupation_status?: string; // Compatibility alias for current_work
  gender?: string;
  phone_number?: string;
  profile_picture?: string;
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

// Secure Salted Password Hashing using PBKDF2
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false;
  try {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch {
    return false;
  }
}

// Detect if running inside a serverless / read-only environment (such as Vercel)
export const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

function findExistingDbFile(): string | null {
  const candidatePaths = [
    path.resolve(process.cwd(), 'server', 'data', 'tia_database.json'),
    path.resolve(__dirname, 'data', 'tia_database.json'),
    path.resolve(__dirname, 'server', 'data', 'tia_database.json'),
    path.resolve(__dirname, '..', 'server', 'data', 'tia_database.json'),
    path.resolve(os.tmpdir(), 'tia_data', 'tia_database.json'),
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Continue
    }
  }
  return null;
}

// Database file path
function getDbFilePath(): string {
  const existing = findExistingDbFile();
  if (existing) {
    return existing;
  }

  // On Vercel / serverless, do NOT attempt mkdirSync in project root (/var/task)
  if (isServerless) {
    return path.resolve(process.cwd(), 'server', 'data', 'tia_database.json');
  }

  try {
    const currentDir = process.cwd();
    const dataDir = path.resolve(currentDir, 'server', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.resolve(dataDir, 'tia_database.json');
  } catch {
    try {
      const tmpDir = path.resolve(os.tmpdir(), 'tia_data');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      return path.resolve(tmpDir, 'tia_database.json');
    } catch {
      return path.resolve(os.tmpdir(), 'tia_database.json');
    }
  }
}

let cachedDb: DatabaseSchema | null = null;

// Initial Seed Data for verification and testing
function getInitialSeedData(): DatabaseSchema {
  const anuragUserId = 'usr-anurag-001';
  const rahulUserId = 'usr-rahul-002';
  const now = new Date().toISOString();

  // Create hashed passwords for default seed accounts
  const anuragAuth = hashPassword('password123');
  const rahulAuth = hashPassword('password123');

  return {
    users: [
      {
        id: anuragUserId,
        username: 'anurag',
        password_hash: anuragAuth.hash,
        salt: anuragAuth.salt,
        phone_number: '+919876543210',
        created_at: now,
        updated_at: now,
      },
      {
        id: rahulUserId,
        username: 'rahul',
        password_hash: rahulAuth.hash,
        salt: rahulAuth.salt,
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
        username: 'anurag',
        date_of_birth: '2000-05-15',
        location: 'Patna, India',
        current_work: 'Startup',
        address: 'Patna, India',
        occupation_status: 'Startup',
        age: calculateAge('2000-05-15'),
        phone_number: '+919876543210',
        gender: 'Male',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'prof-rahul-002',
        user_id: rahulUserId,
        full_name: 'Rahul',
        username: 'rahul',
        date_of_birth: '2003-08-20',
        location: 'Delhi, India',
        current_work: 'Student',
        address: 'Delhi, India',
        occupation_status: 'Student',
        age: calculateAge('2003-08-20'),
        phone_number: '+919876543211',
        gender: 'Male',
        created_at: now,
        updated_at: now,
      },
    ],
    user_memories: [
      {
        id: 'mem-anurag-1',
        user_id: anuragUserId,
        memory_key: 'owner_identity',
        memory_value: 'Anurag is the creator and owner of Tia.',
        memory_type: 'identity',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mem-anurag-2',
        user_id: anuragUserId,
        memory_key: 'location',
        memory_value: 'Anurag lives in Patna, India and is working on a startup.',
        memory_type: 'personal',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mem-rahul-1',
        user_id: rahulUserId,
        memory_key: 'owner_identity',
        memory_value: 'Rahul is a student living in Delhi, India.',
        memory_type: 'identity',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mem-rahul-2',
        user_id: rahulUserId,
        memory_key: 'education',
        memory_value: 'Rahul is currently studying computer science.',
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
        // Migration check: ensure every user has a username & password hash
        let modified = false;

        // Ensure default demo accounts (anurag and rahul) exist for immediate testing
        const hasAnurag = parsed.users.some((u: any) => u.username === 'anurag' || u.id === 'usr-anurag-001');
        const hasRahul = parsed.users.some((u: any) => u.username === 'rahul' || u.id === 'usr-rahul-002');
        if (!hasAnurag || !hasRahul) {
          const seed = getInitialSeedData();
          if (!hasAnurag) {
            const anuragUser = seed.users.find((u) => u.username === 'anurag')!;
            const anuragProf = seed.profiles.find((p) => p.username === 'anurag')!;
            parsed.users.push(anuragUser);
            parsed.profiles.push(anuragProf);
            parsed.user_memories.push(...seed.user_memories.filter((m) => m.user_id === anuragUser.id));
            modified = true;
          }
          if (!hasRahul) {
            const rahulUser = seed.users.find((u) => u.username === 'rahul')!;
            const rahulProf = seed.profiles.find((p) => p.username === 'rahul')!;
            parsed.users.push(rahulUser);
            parsed.profiles.push(rahulProf);
            parsed.user_memories.push(...seed.user_memories.filter((m) => m.user_id === rahulUser.id));
            modified = true;
          }
        }
        parsed.users = parsed.users.map((u: any) => {
          if (!u.username) {
            u.username = u.id === 'usr-anurag-001' ? 'anurag' : (u.id === 'usr-rahul-002' ? 'rahul' : `user_${u.id.slice(-4)}`);
            modified = true;
          }
          if (!u.password_hash || !u.salt) {
            const defAuth = hashPassword('password123');
            u.password_hash = defAuth.hash;
            u.salt = defAuth.salt;
            modified = true;
          }
          return u;
        });

        parsed.profiles = parsed.profiles.map((p: any) => {
          if (!p.username) {
            const matchedUser = parsed.users.find((u: any) => u.id === p.user_id);
            p.username = matchedUser ? matchedUser.username : (p.full_name ? p.full_name.toLowerCase().replace(/\s+/g, '_') : 'user');
            modified = true;
          }
          if (!p.location && p.address) {
            p.location = p.address;
            modified = true;
          }
          if (!p.address && p.location) {
            p.address = p.location;
            modified = true;
          }
          if (!p.current_work && p.occupation_status) {
            p.current_work = p.occupation_status;
            modified = true;
          }
          if (!p.occupation_status && p.current_work) {
            p.occupation_status = p.current_work;
            modified = true;
          }
          p.age = calculateAge(p.date_of_birth);
          return p;
        });

        const schema = parsed as DatabaseSchema;
        cachedDb = schema;
        if (modified) {
          saveDatabase(schema);
        }
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

// Persist database to disk (environment-aware: memory-only on Vercel serverless, filesystem in AI Studio/local)
export function saveDatabase(db: DatabaseSchema): boolean {
  cachedDb = db;

  if (isServerless) {
    // In Vercel serverless environment, filesystem is read-only (/var/task).
    // State is preserved in-memory for the function invocation without attempting disk writes.
    return true;
  }

  const filePath = getDbFilePath();
  try {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.warn('Failed to persist database to disk (gracefully kept in memory):', err);
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
// USER & USERNAME LOOKUPS
// ==========================================

export function findUserByUsername(username: string): { user: UserRecord; profile: ProfileRecord } | null {
  const db = loadDatabase();
  const clean = username.trim().toLowerCase();
  const user = db.users.find((u) => u.username?.toLowerCase() === clean);
  if (!user) return null;

  let profile = db.profiles.find((p) => p.user_id === user.id);
  if (!profile) {
    profile = {
      id: generateId('prof'),
      user_id: user.id,
      full_name: user.username,
      username: user.username,
      date_of_birth: '2000-01-01',
      location: '',
      current_work: '',
      address: '',
      occupation_status: '',
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

export function isUsernameAvailable(username: string): boolean {
  const db = loadDatabase();
  const clean = username.trim().toLowerCase();
  return !db.users.some((u) => u.username?.toLowerCase() === clean);
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
      full_name: user.username,
      username: user.username,
      date_of_birth: '2000-01-01',
      location: '',
      current_work: '',
      address: '',
      occupation_status: '',
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

// Backward-compatible phone lookup for legacy helpers
export function findUserByPhone(phone: string): { user: UserRecord; profile: ProfileRecord } | null {
  const db = loadDatabase();
  const user = db.users.find((u) => u.phone_number === phone);
  if (!user) return null;
  return findUserById(user.id);
}

export function getOrCreateUserByPhone(
  phone: string,
  signupData?: any
): { user: UserRecord; profile: ProfileRecord; isNewUser: boolean } {
  const existing = findUserByPhone(phone);
  if (existing) {
    return { user: existing.user, profile: existing.profile, isNewUser: false };
  }
  const cleanUsername = `user_${Date.now().toString().slice(-4)}`;
  const created = createUserAccount({
    full_name: signupData?.full_name || 'Tia Friend',
    username: cleanUsername,
    password: 'password123',
    date_of_birth: signupData?.date_of_birth || '2000-01-01',
    location: signupData?.address || signupData?.location || '',
    current_work: signupData?.occupation_status || signupData?.current_work || '',
  });
  return { user: created.user as any, profile: created.profile, isNewUser: true };
}

// ==========================================
// CREATE ACCOUNT & AUTHENTICATION
// ==========================================

export function createUserAccount(params: {
  full_name: string;
  username: string;
  password: string;
  date_of_birth: string;
  location?: string;
  current_work?: string;
}): {
  user: Omit<UserRecord, 'password_hash' | 'salt'>;
  profile: ProfileRecord;
  token: string;
} {
  const db = loadDatabase();
  const now = new Date().toISOString();

  const cleanName = (params.full_name || '').trim();
  const cleanUsername = (params.username || '').trim().toLowerCase();
  const password = params.password || '';
  const dob = (params.date_of_birth || '').trim();
  const cleanLocation = (params.location || '').trim();
  const cleanWork = (params.current_work || '').trim();

  // Validations
  if (!cleanName) {
    throw new Error('Full Name is required.');
  }
  if (!cleanUsername) {
    throw new Error('Username is required.');
  }
  if (cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
    throw new Error('Username can only contain letters, numbers, underscores, and dashes.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  if (!dob) {
    throw new Error('Date of Birth is required.');
  }

  // Check username uniqueness (case-insensitive)
  const existingUser = db.users.find(
    (u) => u.username?.toLowerCase() === cleanUsername
  );
  if (existingUser) {
    throw new Error('This username is already taken. Please choose another username.');
  }

  // Hash password
  const { hash, salt } = hashPassword(password);
  const userId = generateId('usr');
  const profileId = generateId('prof');

  const newUser: UserRecord = {
    id: userId,
    username: cleanUsername,
    password_hash: hash,
    salt,
    created_at: now,
    updated_at: now,
  };

  const newProfile: ProfileRecord = {
    id: profileId,
    user_id: userId,
    full_name: cleanName,
    username: cleanUsername,
    date_of_birth: dob,
    location: cleanLocation,
    current_work: cleanWork,
    address: cleanLocation,
    occupation_status: cleanWork,
    age: calculateAge(dob),
    created_at: now,
    updated_at: now,
  };

  db.users.push(newUser);
  db.profiles.push(newProfile);
  saveDatabase(db);

  // Private Tia memory setup strictly linked to this user's userId
  addUserMemory(
    userId,
    `${cleanName} is the owner and companion of Tia.`,
    'identity',
    'owner_identity'
  );

  if (cleanLocation) {
    addUserMemory(
      userId,
      `${cleanName} lives in ${cleanLocation}.`,
      'personal',
      'location'
    );
  }

  if (cleanWork) {
    addUserMemory(
      userId,
      `${cleanName}'s current work is ${cleanWork}.`,
      'work',
      'occupation'
    );
  }

  // Create active session
  const token = createUserSession(userId);

  return {
    user: {
      id: newUser.id,
      username: newUser.username,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
    },
    profile: newProfile,
    token,
  };
}

export function loginUser(
  usernameInput: string,
  passwordInput: string
): {
  user: Omit<UserRecord, 'password_hash' | 'salt'>;
  profile: ProfileRecord;
  memories: UserMemoryRecord[];
  token: string;
} {
  const db = loadDatabase();
  const cleanUsername = (usernameInput || '').trim().toLowerCase();

  if (!cleanUsername || !passwordInput) {
    throw new Error('Please enter both username and password.');
  }

  const user = db.users.find(
    (u) => u.username?.toLowerCase() === cleanUsername
  );
  if (!user) {
    throw new Error('Invalid username or password.');
  }

  const isValid = verifyPassword(passwordInput, user.password_hash, user.salt);
  if (!isValid) {
    throw new Error('Invalid username or password.');
  }

  let profile = db.profiles.find((p) => p.user_id === user.id);
  const now = new Date().toISOString();

  if (!profile) {
    profile = {
      id: generateId('prof'),
      user_id: user.id,
      full_name: user.username,
      username: user.username,
      date_of_birth: '2000-01-01',
      location: '',
      current_work: '',
      address: '',
      occupation_status: '',
      age: calculateAge('2000-01-01'),
      created_at: now,
      updated_at: now,
    };
    db.profiles.push(profile);
    saveDatabase(db);
  } else {
    profile.age = calculateAge(profile.date_of_birth);
  }

  const token = createUserSession(user.id);
  const memories = getUserMemories(user.id);

  return {
    user: {
      id: user.id,
      username: user.username,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    profile,
    memories,
    token,
  };
}

// ==========================================
// SESSIONS & ROW-LEVEL ISOLATION
// ==========================================

export function createUserSession(userId: string): string {
  const db = loadDatabase();
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30-day session

  // Purge expired sessions
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

export function getUserByToken(
  token: string
): { user: Omit<UserRecord, 'password_hash' | 'salt'>; profile: ProfileRecord } | null {
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
      full_name: user.username,
      username: user.username,
      date_of_birth: '2000-01-01',
      location: '',
      current_work: '',
      address: '',
      occupation_status: '',
      age: calculateAge('2000-01-01'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.profiles.push(profile);
    saveDatabase(db);
  } else {
    profile.age = calculateAge(profile.date_of_birth);
  }

  // Safe projection without passwords or salts
  const safeUser: Omit<UserRecord, 'password_hash' | 'salt'> = {
    id: user.id,
    username: user.username,
    created_at: user.created_at,
    updated_at: user.updated_at,
    phone_number: user.phone_number,
  };

  return { user: safeUser, profile };
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
  if (updates.location !== undefined) {
    profile.location = updates.location.trim();
    profile.address = updates.location.trim();
  }
  if (updates.address !== undefined) {
    profile.location = updates.address.trim();
    profile.address = updates.address.trim();
  }
  if (updates.current_work !== undefined) {
    profile.current_work = updates.current_work.trim();
    profile.occupation_status = updates.current_work.trim();
  }
  if (updates.occupation_status !== undefined) {
    profile.current_work = updates.occupation_status.trim();
    profile.occupation_status = updates.occupation_status.trim();
  }
  if (updates.gender !== undefined) profile.gender = updates.gender;
  if (updates.profile_picture !== undefined) profile.profile_picture = updates.profile_picture;
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

