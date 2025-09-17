import { db } from '../db';
import { usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type UpdateUserProfileInput, type User } from '../schema';

export async function updateUserProfile(input: UpdateUserProfileInput): Promise<User> {
  try {
    // First, verify the user exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.id))
      .execute();

    if (existingUser.length === 0) {
      throw new Error(`User with id ${input.id} not found`);
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date()
    };

    if (input.first_name !== undefined) {
      updateData['first_name'] = input.first_name;
    }
    
    if (input.last_name !== undefined) {
      updateData['last_name'] = input.last_name;
    }
    
    if (input.avatar_url !== undefined) {
      updateData['avatar_url'] = input.avatar_url;
    }

    // Update the user record
    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User profile update failed:', error);
    throw error;
  }
}