import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, notificationsTable } from '../db/schema';
import { type MarkNotificationReadInput } from '../schema';
import { markNotificationRead } from '../handlers/mark_notification_read';
import { eq } from 'drizzle-orm';

// Test input
const testInput: MarkNotificationReadInput = {
  notification_id: 1,
  user_id: 1
};

describe('markNotificationRead', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should mark notification as read when notification exists and belongs to user', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning({ id: usersTable.id })
      .execute();

    const userId = userResult[0].id;

    // Create test notification
    const notificationResult = await db.insert(notificationsTable)
      .values({
        user_id: userId,
        type: 'BUDGET_ALERT',
        title: 'Test Notification',
        message: 'This is a test notification',
        is_read: false
      })
      .returning({ id: notificationsTable.id })
      .execute();

    const notificationId = notificationResult[0].id;

    // Mark notification as read
    const result = await markNotificationRead({
      notification_id: notificationId,
      user_id: userId
    });

    // Should return success
    expect(result.success).toBe(true);

    // Verify notification is marked as read in database
    const updatedNotifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, notificationId))
      .execute();

    expect(updatedNotifications).toHaveLength(1);
    expect(updatedNotifications[0].is_read).toBe(true);
  });

  it('should return false when notification does not exist', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning({ id: usersTable.id })
      .execute();

    const userId = userResult[0].id;

    // Try to mark non-existent notification as read
    const result = await markNotificationRead({
      notification_id: 999, // Non-existent ID
      user_id: userId
    });

    // Should return false since notification doesn't exist
    expect(result.success).toBe(false);
  });

  it('should return false when notification belongs to different user', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable)
      .values({
        email: 'user1@example.com',
        username: 'testuser1',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User1'
      })
      .returning({ id: usersTable.id })
      .execute();

    const user2Result = await db.insert(usersTable)
      .values({
        email: 'user2@example.com',
        username: 'testuser2',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User2'
      })
      .returning({ id: usersTable.id })
      .execute();

    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    // Create notification for user1
    const notificationResult = await db.insert(notificationsTable)
      .values({
        user_id: user1Id,
        type: 'EXPENSE_APPROVAL',
        title: 'Test Notification',
        message: 'This notification belongs to user1',
        is_read: false
      })
      .returning({ id: notificationsTable.id })
      .execute();

    const notificationId = notificationResult[0].id;

    // Try to mark notification as read using user2's ID
    const result = await markNotificationRead({
      notification_id: notificationId,
      user_id: user2Id
    });

    // Should return false since notification doesn't belong to user2
    expect(result.success).toBe(false);

    // Verify notification remains unread
    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, notificationId))
      .execute();

    expect(notifications).toHaveLength(1);
    expect(notifications[0].is_read).toBe(false);
  });

  it('should work when notification is already read', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning({ id: usersTable.id })
      .execute();

    const userId = userResult[0].id;

    // Create notification that's already read
    const notificationResult = await db.insert(notificationsTable)
      .values({
        user_id: userId,
        type: 'SYSTEM_UPDATE',
        title: 'Already Read Notification',
        message: 'This notification was already read',
        is_read: true
      })
      .returning({ id: notificationsTable.id })
      .execute();

    const notificationId = notificationResult[0].id;

    // Mark already-read notification as read again
    const result = await markNotificationRead({
      notification_id: notificationId,
      user_id: userId
    });

    // Should still return success
    expect(result.success).toBe(true);

    // Verify notification remains read
    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, notificationId))
      .execute();

    expect(notifications).toHaveLength(1);
    expect(notifications[0].is_read).toBe(true);
  });

  it('should handle notification without related expense', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning({ id: usersTable.id })
      .execute();

    const userId = userResult[0].id;

    // Create notification without related expense ID
    const notificationResult = await db.insert(notificationsTable)
      .values({
        user_id: userId,
        type: 'EXPENSE_REMINDER',
        title: 'Expense Reminder',
        message: 'Please submit your expense report',
        is_read: false,
        related_expense_id: null
      })
      .returning({ id: notificationsTable.id })
      .execute();

    const notificationId = notificationResult[0].id;

    // Mark notification as read
    const result = await markNotificationRead({
      notification_id: notificationId,
      user_id: userId
    });

    // Should work normally
    expect(result.success).toBe(true);

    // Verify notification is marked as read
    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, notificationId))
      .execute();

    expect(notifications).toHaveLength(1);
    expect(notifications[0].is_read).toBe(true);
    expect(notifications[0].related_expense_id).toBeNull();
  });
});