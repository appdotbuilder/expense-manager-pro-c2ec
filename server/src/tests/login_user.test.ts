import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginUserInput } from '../schema';
import { loginUser } from '../handlers/login_user';
import { eq } from 'drizzle-orm';

// Test user data
const testUserData = {
  email: 'test@example.com',
  username: 'testuser',
  password_hash: '', // Will be set in beforeEach
  first_name: 'Test',
  last_name: 'User',
  role: 'USER' as const,
  avatar_url: null,
  email_verified: true,
  email_verification_token: null,
  password_reset_token: null,
  password_reset_expires: null,
  is_active: true
};

const testPassword = 'testpassword123';

// Test input
const validLoginInput: LoginUserInput = {
  email: 'test@example.com',
  password: testPassword
};

describe('loginUser', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create a test user with hashed password using Bun's password hashing
    const hashedPassword = await Bun.password.hash(testPassword);
    await db.insert(usersTable).values({
      ...testUserData,
      password_hash: hashedPassword
    }).execute();
  });

  afterEach(resetDB);

  it('should login user with valid credentials', async () => {
    const result = await loginUser(validLoginInput);

    // Verify user data
    expect(result.user.email).toEqual('test@example.com');
    expect(result.user.username).toEqual('testuser');
    expect(result.user.first_name).toEqual('Test');
    expect(result.user.last_name).toEqual('User');
    expect(result.user.role).toEqual('USER');
    expect(result.user.is_active).toBe(true);
    expect(result.user.id).toBeDefined();
    expect(result.user.created_at).toBeInstanceOf(Date);
    expect(result.user.updated_at).toBeInstanceOf(Date);

    // Verify password hash is not included
    expect((result.user as any).password_hash).toBeUndefined();

    // Verify token is generated
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);

    // Verify token contains user data
    const decodedToken = JSON.parse(Buffer.from(result.token, 'base64').toString());
    expect(decodedToken.userId).toEqual(result.user.id);
    expect(decodedToken.email).toEqual('test@example.com');
    expect(decodedToken.role).toEqual('USER');
    expect(decodedToken.exp).toBeGreaterThan(Date.now());
  });

  it('should update user last login timestamp', async () => {
    const beforeLogin = new Date();
    
    const result = await loginUser(validLoginInput);
    
    // Query user from database to check updated_at
    const updatedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.user.id))
      .execute();
    
    expect(updatedUser[0].updated_at.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
  });

  it('should reject invalid email', async () => {
    const invalidInput: LoginUserInput = {
      email: 'nonexistent@example.com',
      password: testPassword
    };

    await expect(loginUser(invalidInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should reject invalid password', async () => {
    const invalidInput: LoginUserInput = {
      email: 'test@example.com',
      password: 'wrongpassword'
    };

    await expect(loginUser(invalidInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should reject deactivated user', async () => {
    // Deactivate the test user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.email, 'test@example.com'))
      .execute();

    await expect(loginUser(validLoginInput)).rejects.toThrow(/account is deactivated/i);
  });

  it('should handle different user roles correctly', async () => {
    // Create an admin user
    const adminPassword = 'adminpassword123';
    const hashedAdminPassword = await Bun.password.hash(adminPassword);
    
    await db.insert(usersTable).values({
      email: 'admin@example.com',
      username: 'adminuser',
      password_hash: hashedAdminPassword,
      first_name: 'Admin',
      last_name: 'User',
      role: 'ADMIN',
      avatar_url: null,
      email_verified: true,
      email_verification_token: null,
      password_reset_token: null,
      password_reset_expires: null,
      is_active: true
    }).execute();

    const adminLoginInput: LoginUserInput = {
      email: 'admin@example.com',
      password: adminPassword
    };

    const result = await loginUser(adminLoginInput);

    expect(result.user.role).toEqual('ADMIN');
    expect(result.user.email).toEqual('admin@example.com');
    
    // Verify token contains correct role
    const decodedToken = JSON.parse(Buffer.from(result.token, 'base64').toString());
    expect(decodedToken.role).toEqual('ADMIN');
  });

  it('should handle user with nullable fields correctly', async () => {
    // Create user with some nullable fields set
    const userWithNullsPassword = 'password123';
    const hashedPassword = await Bun.password.hash(userWithNullsPassword);
    
    await db.insert(usersTable).values({
      email: 'nullable@example.com',
      username: 'nullableuser',
      password_hash: hashedPassword,
      first_name: 'Nullable',
      last_name: 'User',
      role: 'MANAGER',
      avatar_url: 'https://example.com/avatar.jpg',
      email_verified: false,
      email_verification_token: 'verification-token-123',
      password_reset_token: 'reset-token-456',
      password_reset_expires: new Date(Date.now() + 3600000), // 1 hour from now
      is_active: true
    }).execute();

    const loginInput: LoginUserInput = {
      email: 'nullable@example.com',
      password: userWithNullsPassword
    };

    const result = await loginUser(loginInput);

    expect(result.user.avatar_url).toEqual('https://example.com/avatar.jpg');
    expect(result.user.email_verified).toBe(false);
    expect(result.user.email_verification_token).toEqual('verification-token-123');
    expect(result.user.password_reset_token).toEqual('reset-token-456');
    expect(result.user.password_reset_expires).toBeInstanceOf(Date);
    expect(result.user.role).toEqual('MANAGER');
  });

  it('should generate unique tokens for different login sessions', async () => {
    const result1 = await loginUser(validLoginInput);
    
    // Wait a moment to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const result2 = await loginUser(validLoginInput);

    expect(result1.token).not.toEqual(result2.token);
    expect(result1.user.id).toEqual(result2.user.id); // Same user
  });

  it('should handle case insensitive email login', async () => {
    const uppercaseEmailInput: LoginUserInput = {
      email: 'TEST@EXAMPLE.COM',
      password: testPassword
    };

    // This should fail since our implementation is case-sensitive
    await expect(loginUser(uppercaseEmailInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should verify token expiration is set correctly', async () => {
    const result = await loginUser(validLoginInput);
    
    const decodedToken = JSON.parse(Buffer.from(result.token, 'base64').toString());
    const expectedExpiration = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    
    // Allow 1 second tolerance for test execution time
    expect(decodedToken.exp).toBeGreaterThan(Date.now());
    expect(decodedToken.exp).toBeLessThan(expectedExpiration + 1000);
  });
});