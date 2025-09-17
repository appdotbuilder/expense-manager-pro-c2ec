import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterUserInput, type AuthResponse } from '../schema';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

// Simple password hashing using Node.js crypto (for production, use bcrypt)
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Simple JWT token generation (for production, use proper JWT library)
function generateJWT(userId: number, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ 
    userId, 
    email, 
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', 'secret-key')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

// Generate email verification token
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function registerUser(input: RegisterUserInput): Promise<AuthResponse> {
  try {
    // Check if user already exists with email or username
    const existingUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (existingUsers.length > 0) {
      throw new Error('User with this email already exists');
    }

    const existingUsernames = await db.select()
      .from(usersTable)
      .where(eq(usersTable.username, input.username))
      .execute();

    if (existingUsernames.length > 0) {
      throw new Error('Username already taken');
    }

    // Hash password and generate verification token
    const passwordHash = hashPassword(input.password);
    const verificationToken = generateVerificationToken();

    // Create user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        username: input.username,
        password_hash: passwordHash,
        first_name: input.first_name,
        last_name: input.last_name,
        role: input.role || 'USER',
        email_verification_token: verificationToken,
        email_verified: false,
        is_active: true
      })
      .returning()
      .execute();

    const user = result[0];

    // Generate JWT token
    const token = generateJWT(user.id, user.email);

    // Return user data without password hash
    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      avatar_url: user.avatar_url,
      email_verified: user.email_verified,
      email_verification_token: user.email_verification_token,
      password_reset_token: user.password_reset_token,
      password_reset_expires: user.password_reset_expires,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return {
      user: userResponse,
      token: token
    };
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}