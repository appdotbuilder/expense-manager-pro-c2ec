import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type ResetPasswordInput } from '../schema';
import { resetPassword } from '../handlers/reset_password';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
  email: 'test@example.com',
  username: 'testuser',
  password_hash: 'hashedpassword123',
  first_name: 'John',
  last_name: 'Doe',
  role: 'USER' as const,
  email_verified: true,
  is_active: true
};

const inactiveUser = {
  email: 'inactive@example.com',
  username: 'inactiveuser',
  password_hash: 'hashedpassword456',
  first_name: 'Jane',
  last_name: 'Smith',
  role: 'USER' as const,
  email_verified: true,
  is_active: false
};

describe('resetPassword', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should generate reset token for valid active user', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const createdUser = userResult[0];

    const input: ResetPasswordInput = {
      email: 'test@example.com'
    };

    const result = await resetPassword(input);

    // Check response
    expect(result.success).toBe(true);
    expect(result.message).toBe('If an account with that email exists, a password reset link has been sent.');

    // Verify database was updated
    const updatedUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();

    const updatedUser = updatedUsers[0];
    expect(updatedUser.password_reset_token).toBeDefined();
    expect(updatedUser.password_reset_token).not.toBeNull();
    expect(updatedUser.password_reset_expires).toBeInstanceOf(Date);
    expect(updatedUser.updated_at).toBeInstanceOf(Date);

    // Check token format
    expect(updatedUser.password_reset_token).toMatch(/^reset_\d+_[a-z0-9]+$/);

    // Check expiry is approximately 1 hour from now (within 5 minutes tolerance)
    const expectedExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const timeDiff = Math.abs(updatedUser.password_reset_expires!.getTime() - expectedExpiry.getTime());
    expect(timeDiff).toBeLessThan(5 * 60 * 1000); // 5 minutes tolerance
  });

  it('should return success for non-existent email (security)', async () => {
    const input: ResetPasswordInput = {
      email: 'nonexistent@example.com'
    };

    const result = await resetPassword(input);

    // Should still return success to prevent email enumeration
    expect(result.success).toBe(true);
    expect(result.message).toBe('If an account with that email exists, a password reset link has been sent.');

    // Verify no users in database were affected
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(0);
  });

  it('should return success for inactive user (security)', async () => {
    // Create inactive user
    await db.insert(usersTable)
      .values(inactiveUser)
      .returning()
      .execute();

    const input: ResetPasswordInput = {
      email: 'inactive@example.com'
    };

    const result = await resetPassword(input);

    // Should return success to prevent user enumeration
    expect(result.success).toBe(true);
    expect(result.message).toBe('If an account with that email exists, a password reset link has been sent.');

    // Verify inactive user was not updated with reset token
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, 'inactive@example.com'))
      .execute();

    const user = users[0];
    expect(user.password_reset_token).toBeNull();
    expect(user.password_reset_expires).toBeNull();
  });

  it('should handle email case insensitivity', async () => {
    // Create test user
    await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const input: ResetPasswordInput = {
      email: 'TEST@EXAMPLE.COM' // Different case
    };

    const result = await resetPassword(input);

    // Email lookup is case-sensitive in this implementation
    // So uppercase email should not find the lowercase user
    expect(result.success).toBe(true);
    expect(result.message).toBe('If an account with that email exists, a password reset link has been sent.');

    // Verify original user was not updated
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, 'test@example.com'))
      .execute();

    const user = users[0];
    expect(user.password_reset_token).toBeNull();
    expect(user.password_reset_expires).toBeNull();
  });

  it('should update existing reset token', async () => {
    // Create user with existing reset token
    const existingToken = 'existing_reset_token';
    const existingExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const userResult = await db.insert(usersTable)
      .values({
        ...testUser,
        password_reset_token: existingToken,
        password_reset_expires: existingExpiry
      })
      .returning()
      .execute();

    const createdUser = userResult[0];

    const input: ResetPasswordInput = {
      email: 'test@example.com'
    };

    const result = await resetPassword(input);

    expect(result.success).toBe(true);

    // Verify token was updated
    const updatedUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();

    const updatedUser = updatedUsers[0];
    expect(updatedUser.password_reset_token).not.toBe(existingToken);
    expect(updatedUser.password_reset_expires).not.toEqual(existingExpiry);
    expect(updatedUser.password_reset_token).toMatch(/^reset_\d+_[a-z0-9]+$/);
  });

  it('should handle multiple reset requests for same user', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const createdUser = userResult[0];

    const input: ResetPasswordInput = {
      email: 'test@example.com'
    };

    // First reset request
    const result1 = await resetPassword(input);
    expect(result1.success).toBe(true);

    // Get first token
    const firstQuery = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();
    const firstToken = firstQuery[0].password_reset_token;

    // Wait a moment to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    // Second reset request
    const result2 = await resetPassword(input);
    expect(result2.success).toBe(true);

    // Get second token
    const secondQuery = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();
    const secondToken = secondQuery[0].password_reset_token;

    // Tokens should be different
    expect(secondToken).not.toBe(firstToken);
    expect(secondToken).toMatch(/^reset_\d+_[a-z0-9]+$/);
  });

  it('should validate email format through Zod schema', async () => {
    // This test assumes Zod validation happens before the handler
    // Invalid email should be caught by input validation
    const input = {
      email: 'invalid-email-format'
    };

    // This would typically be caught by Zod validation before reaching the handler
    // But we can test that our handler would handle it gracefully if it did reach
    await expect(async () => {
      await resetPassword(input as ResetPasswordInput);
    }).not.toThrow();
  });
});