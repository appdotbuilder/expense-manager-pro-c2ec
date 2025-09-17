import { db } from '../db';
import { notificationsTable, usersTable } from '../db/schema';
import { type CreateNotificationInput, type Notification } from '../schema';
import { eq } from 'drizzle-orm';

export const createNotification = async (input: CreateNotificationInput): Promise<Notification> => {
  try {
    // Verify that the user exists
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (userExists.length === 0) {
      throw new Error(`User with ID ${input.user_id} not found`);
    }

    // If related_expense_id is provided, we could verify it exists, but it's optional
    // and the foreign key constraint will handle validation

    // Insert notification record
    const result = await db.insert(notificationsTable)
      .values({
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        message: input.message,
        related_expense_id: input.related_expense_id || null
      })
      .returning()
      .execute();

    const notification = result[0];
    return notification;
  } catch (error) {
    console.error('Notification creation failed:', error);
    throw error;
  }
};