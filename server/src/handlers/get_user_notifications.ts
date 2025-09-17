import { db } from '../db';
import { notificationsTable } from '../db/schema';
import { type Notification } from '../schema';
import { eq, desc, and } from 'drizzle-orm';

export async function getUserNotifications(userId: number, unreadOnly: boolean = false): Promise<Notification[]> {
  try {
    // Build conditions array
    const conditions = [eq(notificationsTable.user_id, userId)];
    
    // Add unread filter if requested
    if (unreadOnly) {
      conditions.push(eq(notificationsTable.is_read, false));
    }
    
    // Build and execute query in one go
    const results = await db.select()
      .from(notificationsTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(notificationsTable.created_at))
      .limit(50)
      .execute();
    
    // Return results as-is since they already match the Notification type
    return results;
  } catch (error) {
    console.error('Get user notifications failed:', error);
    throw error;
  }
}