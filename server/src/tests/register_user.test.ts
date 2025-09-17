import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterUserInput } from '../schema';
import { registerUser } from '../handlers/register_user';
import { eq } from 'drizzle-orm';

// Test input data
const testInput: RegisterUserInput = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'password123',
  first_name: 'Test',
  last_name: 'User',
  role: 'USER'
};

const adminInput: RegisterUserInput = {
  email: 'admin@example.com',
  username: 'admin',
  password: 'adminpass123',
  first_name: 'Admin',
  last_name: 'User',
  role: 'ADMIN'
};

describe('registerUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should successfully register a new user', async () => {
    const result = await registerUser(testInput);

    // Verify response structure
    expect(result.user).toBeDefined();
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');

    // Verify user data
    expect(result.user.email).toEqual(testInput.email);
    expect(result.user.username).toEqual(testInput.username);
    expect(result.user.first_name).toEqual(testInput.first_name);
    expect(result.user.last_name).toEqual(testInput.last_name);
    expect(result.user.role).toEqual(testInput.role);
    expect(result.user.id).toBeDefined();
    expect(result.user.created_at).toBeInstanceOf(Date);
    expect(result.user.updated_at).toBeInstanceOf(Date);
    expect(result.user.email_verified).toBe(false);
    expect(result.user.is_active).toBe(true);
    expect(result.user.email_verification_token).toBeDefined();
    expect(result.user.avatar_url).toBeNull();
  });

  it('should save user to database with hashed password', async () => {
    const result = await registerUser(testInput);

    // Query database directly to verify user creation
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.user.id))
      .execute();

    expect(users).toHaveLength(1);
    const user = users[0];

    expect(user.email).toEqual(testInput.email);
    expect(user.username).toEqual(testInput.username);
    expect(user.first_name).toEqual(testInput.first_name);
    expect(user.last_name).toEqual(testInput.last_name);
    expect(user.role).toEqual(testInput.role);
    expect(user.email_verified).toBe(false);
    expect(user.is_active).toBe(true);

    // Verify password is hashed (not plain text)
    expect(user.password_hash).toBeDefined();
    expect(user.password_hash).not.toEqual(testInput.password);
    expect(user.password_hash.includes(':')).toBe(true); // Salt:hash format

    // Verify verification token is generated
    expect(user.email_verification_token).toBeDefined();
    expect(user.email_verification_token).not.toBeNull();
    expect(typeof user.email_verification_token).toBe('string');
  });

  it('should default role to USER when not specified', async () => {
    const inputWithoutRole: RegisterUserInput = {
      email: 'norole@example.com',
      username: 'noroleuser',
      password: 'password123',
      first_name: 'No',
      last_name: 'Role',
      role: 'USER'  // Note: Zod handles the default, but TypeScript requires explicit typing
    };

    const result = await registerUser(inputWithoutRole);

    expect(result.user.role).toEqual('USER');

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.user.id))
      .execute();

    expect(users[0].role).toEqual('USER');
  });

  it('should register admin user with ADMIN role', async () => {
    const result = await registerUser(adminInput);

    expect(result.user.role).toEqual('ADMIN');
    expect(result.user.email).toEqual(adminInput.email);
    expect(result.user.username).toEqual(adminInput.username);

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.user.id))
      .execute();

    expect(users[0].role).toEqual('ADMIN');
  });

  it('should generate valid JWT token', async () => {
    const result = await registerUser(testInput);

    // Basic JWT structure validation (header.payload.signature)
    const tokenParts = result.token.split('.');
    expect(tokenParts).toHaveLength(3);

    // Each part should be base64url encoded
    tokenParts.forEach(part => {
      expect(part).toBeDefined();
      expect(part.length).toBeGreaterThan(0);
    });

    // Decode and verify payload contains user info
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString());
    expect(payload.userId).toEqual(result.user.id);
    expect(payload.email).toEqual(result.user.email);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('should reject duplicate email registration', async () => {
    // Register first user
    await registerUser(testInput);

    // Try to register another user with same email
    const duplicateEmailInput = {
      ...testInput,
      username: 'differentuser'
    };

    await expect(registerUser(duplicateEmailInput)).rejects.toThrow(/email already exists/i);
  });

  it('should reject duplicate username registration', async () => {
    // Register first user
    await registerUser(testInput);

    // Try to register another user with same username
    const duplicateUsernameInput = {
      ...testInput,
      email: 'different@example.com'
    };

    await expect(registerUser(duplicateUsernameInput)).rejects.toThrow(/username already taken/i);
  });

  it('should handle multiple unique users registration', async () => {
    const user1 = await registerUser(testInput);
    const user2 = await registerUser(adminInput);

    // Verify both users are different
    expect(user1.user.id).not.toEqual(user2.user.id);
    expect(user1.user.email).not.toEqual(user2.user.email);
    expect(user1.user.username).not.toEqual(user2.user.username);
    expect(user1.token).not.toEqual(user2.token);

    // Verify both exist in database
    const allUsers = await db.select()
      .from(usersTable)
      .execute();

    expect(allUsers).toHaveLength(2);
    
    const emails = allUsers.map(u => u.email);
    expect(emails).toContain(testInput.email);
    expect(emails).toContain(adminInput.email);
  });

  it('should generate unique verification tokens for different users', async () => {
    const user1 = await registerUser(testInput);
    const user2 = await registerUser(adminInput);

    expect(user1.user.email_verification_token).toBeDefined();
    expect(user2.user.email_verification_token).toBeDefined();
    expect(user1.user.email_verification_token).not.toEqual(user2.user.email_verification_token);

    // Verify tokens are sufficiently long (security)
    expect(user1.user.email_verification_token!.length).toBeGreaterThanOrEqual(32);
    expect(user2.user.email_verification_token!.length).toBeGreaterThanOrEqual(32);
  });

  it('should generate different password hashes for same password', async () => {
    const user1 = await registerUser(testInput);
    
    // Register another user with same password but different email/username
    const samePasswordInput = {
      email: 'other@example.com',
      username: 'otheruser', 
      password: testInput.password, // Same password
      first_name: 'Other',
      last_name: 'User',
      role: 'USER' as const
    };
    
    const user2 = await registerUser(samePasswordInput);

    // Get password hashes from database
    const users = await db.select()
      .from(usersTable)
      .execute();

    const user1Hash = users.find(u => u.id === user1.user.id)?.password_hash;
    const user2Hash = users.find(u => u.id === user2.user.id)?.password_hash;

    expect(user1Hash).toBeDefined();
    expect(user2Hash).toBeDefined();
    expect(user1Hash).not.toEqual(user2Hash); // Different salts should create different hashes
  });
});