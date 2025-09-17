import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type UpdateUserProfileInput } from '../schema';
import { updateUserProfile } from '../handlers/update_user_profile';

describe('updateUserProfile', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test helper to create a user
  const createTestUser = async () => {
    const result = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'John',
        last_name: 'Doe',
        role: 'USER'
      })
      .returning()
      .execute();

    return result[0];
  };

  it('should update first_name only', async () => {
    const testUser = await createTestUser();

    const input: UpdateUserProfileInput = {
      id: testUser.id,
      first_name: 'Jane'
    };

    const result = await updateUserProfile(input);

    expect(result.id).toEqual(testUser.id);
    expect(result.first_name).toEqual('Jane');
    expect(result.last_name).toEqual('Doe'); // Unchanged
    expect(result.email).toEqual(testUser.email); // Unchanged
    expect(result.avatar_url).toBeNull(); // Unchanged
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > testUser.updated_at).toBe(true);
  });

  it('should update last_name only', async () => {
    const testUser = await createTestUser();

    const input: UpdateUserProfileInput = {
      id: testUser.id,
      last_name: 'Smith'
    };

    const result = await updateUserProfile(input);

    expect(result.id).toEqual(testUser.id);
    expect(result.first_name).toEqual('John'); // Unchanged
    expect(result.last_name).toEqual('Smith');
    expect(result.email).toEqual(testUser.email); // Unchanged
    expect(result.avatar_url).toBeNull(); // Unchanged
  });

  it('should update avatar_url only', async () => {
    const testUser = await createTestUser();

    const input: UpdateUserProfileInput = {
      id: testUser.id,
      avatar_url: 'https://example.com/avatar.jpg'
    };

    const result = await updateUserProfile(input);

    expect(result.id).toEqual(testUser.id);
    expect(result.first_name).toEqual('John'); // Unchanged
    expect(result.last_name).toEqual('Doe'); // Unchanged
    expect(result.avatar_url).toEqual('https://example.com/avatar.jpg');
  });

  it('should update multiple fields at once', async () => {
    const testUser = await createTestUser();

    const input: UpdateUserProfileInput = {
      id: testUser.id,
      first_name: 'Jane',
      last_name: 'Smith',
      avatar_url: 'https://example.com/new-avatar.jpg'
    };

    const result = await updateUserProfile(input);

    expect(result.id).toEqual(testUser.id);
    expect(result.first_name).toEqual('Jane');
    expect(result.last_name).toEqual('Smith');
    expect(result.avatar_url).toEqual('https://example.com/new-avatar.jpg');
    expect(result.email).toEqual(testUser.email); // Unchanged
    expect(result.username).toEqual(testUser.username); // Unchanged
  });

  it('should set avatar_url to null when explicitly provided', async () => {
    // Create user with existing avatar
    const userWithAvatar = await db.insert(usersTable)
      .values({
        email: 'avatar@example.com',
        username: 'avataruser',
        password_hash: 'hashed_password',
        first_name: 'Avatar',
        last_name: 'User',
        role: 'USER',
        avatar_url: 'https://example.com/existing-avatar.jpg'
      })
      .returning()
      .execute();

    const input: UpdateUserProfileInput = {
      id: userWithAvatar[0].id,
      avatar_url: null
    };

    const result = await updateUserProfile(input);

    expect(result.avatar_url).toBeNull();
  });

  it('should save changes to database', async () => {
    const testUser = await createTestUser();

    const input: UpdateUserProfileInput = {
      id: testUser.id,
      first_name: 'Updated',
      last_name: 'User'
    };

    await updateUserProfile(input);

    // Verify changes were saved to database
    const updatedUserFromDB = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, testUser.id))
      .execute();

    expect(updatedUserFromDB).toHaveLength(1);
    expect(updatedUserFromDB[0].first_name).toEqual('Updated');
    expect(updatedUserFromDB[0].last_name).toEqual('User');
    expect(updatedUserFromDB[0].updated_at).toBeInstanceOf(Date);
    expect(updatedUserFromDB[0].updated_at > testUser.updated_at).toBe(true);
  });

  it('should throw error when user does not exist', async () => {
    const input: UpdateUserProfileInput = {
      id: 99999, // Non-existent user ID
      first_name: 'Nonexistent'
    };

    await expect(updateUserProfile(input)).rejects.toThrow(/User with id 99999 not found/i);
  });

  it('should update only updated_at when no profile fields are provided', async () => {
    const testUser = await createTestUser();
    const originalUpdatedAt = testUser.updated_at;

    // Wait a small amount to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1));

    const input: UpdateUserProfileInput = {
      id: testUser.id
    };

    const result = await updateUserProfile(input);

    expect(result.id).toEqual(testUser.id);
    expect(result.first_name).toEqual(testUser.first_name);
    expect(result.last_name).toEqual(testUser.last_name);
    expect(result.avatar_url).toEqual(testUser.avatar_url);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > originalUpdatedAt).toBe(true);
  });

  it('should preserve all non-updatable fields', async () => {
    const testUser = await createTestUser();

    const input: UpdateUserProfileInput = {
      id: testUser.id,
      first_name: 'NewFirstName'
    };

    const result = await updateUserProfile(input);

    // Verify non-updatable fields remain unchanged
    expect(result.email).toEqual(testUser.email);
    expect(result.username).toEqual(testUser.username);
    expect(result.password_hash).toEqual(testUser.password_hash);
    expect(result.role).toEqual(testUser.role);
    expect(result.email_verified).toEqual(testUser.email_verified);
    expect(result.is_active).toEqual(testUser.is_active);
    expect(result.created_at).toEqual(testUser.created_at);
  });
});