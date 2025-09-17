import { db } from '../db';
import { notificationsTable } from '../db/schema';
import { type MarkNotificationReadInput } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function markNotificationRead(input: MarkNotificationReadInput): Promise<{ success: boolean }> {
  try {
    // Update notification to mark it as read, but only if it belongs to the user
    const result = await db.update(notificationsTable)
      .set({ is_read: true })
      .where(and(
        eq(notificationsTable.id, input.notification_id),
        eq(notificationsTable.user_id, input.user_id)
      ))
      .returning({ id: notificationsTable.id })
      .execute();

    // Return success true if notification was found and updated
    return { success: result.length > 0 };
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    throw error;
  }
}