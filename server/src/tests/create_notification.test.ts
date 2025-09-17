import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, notificationsTable, expensesTable, teamsTable } from '../db/schema';
import { type CreateNotificationInput } from '../schema';
import { createNotification } from '../handlers/create_notification';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
  email: 'testuser@example.com',
  username: 'testuser',
  password_hash: 'hashedpassword123',
  first_name: 'Test',
  last_name: 'User',
  role: 'USER' as const
};

// Test notification input
const testNotificationInput: CreateNotificationInput = {
  user_id: 1, // Will be set dynamically
  type: 'BUDGET_ALERT',
  title: 'Budget Alert',
  message: 'You have exceeded 80% of your monthly budget for FOOD_DINING category'
};

describe('createNotification', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a notification successfully', async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;
    const input = { ...testNotificationInput, user_id: userId };

    const result = await createNotification(input);

    // Verify notification fields
    expect(result.id).toBeDefined();
    expect(result.user_id).toEqual(userId);
    expect(result.type).toEqual('BUDGET_ALERT');
    expect(result.title).toEqual('Budget Alert');
    expect(result.message).toEqual(testNotificationInput.message);
    expect(result.is_read).toEqual(false);
    expect(result.related_expense_id).toBeNull();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save notification to database', async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;
    const input = { ...testNotificationInput, user_id: userId };

    const result = await createNotification(input);

    // Query database to verify
    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, result.id))
      .execute();

    expect(notifications).toHaveLength(1);
    expect(notifications[0].user_id).toEqual(userId);
    expect(notifications[0].type).toEqual('BUDGET_ALERT');
    expect(notifications[0].title).toEqual('Budget Alert');
    expect(notifications[0].message).toEqual(testNotificationInput.message);
    expect(notifications[0].is_read).toEqual(false);
    expect(notifications[0].created_at).toBeInstanceOf(Date);
  });

  it('should create notification with related expense ID', async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create team for expense
    const teamResult = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        description: 'A team for testing',
        manager_id: userId
      })
      .returning()
      .execute();

    const teamId = teamResult[0].id;

    // Create expense
    const expenseResult = await db.insert(expensesTable)
      .values({
        user_id: userId,
        team_id: teamId,
        title: 'Test Expense',
        amount: '50.00',
        category: 'FOOD_DINING',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expenseId = expenseResult[0].id;

    const input: CreateNotificationInput = {
      user_id: userId,
      type: 'EXPENSE_APPROVAL',
      title: 'Expense Approved',
      message: 'Your expense has been approved',
      related_expense_id: expenseId
    };

    const result = await createNotification(input);

    expect(result.related_expense_id).toEqual(expenseId);
    expect(result.type).toEqual('EXPENSE_APPROVAL');
    expect(result.title).toEqual('Expense Approved');
  });

  it('should create different types of notifications', async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const notificationTypes = [
      {
        type: 'BUDGET_ALERT' as const,
        title: 'Budget Alert',
        message: 'Budget threshold exceeded'
      },
      {
        type: 'EXPENSE_REMINDER' as const,
        title: 'Expense Reminder',
        message: 'Don\'t forget to submit your expenses'
      },
      {
        type: 'SYSTEM_UPDATE' as const,
        title: 'System Update',
        message: 'New features available'
      }
    ];

    for (const notificationData of notificationTypes) {
      const input: CreateNotificationInput = {
        user_id: userId,
        ...notificationData
      };

      const result = await createNotification(input);

      expect(result.user_id).toEqual(userId);
      expect(result.type).toEqual(notificationData.type);
      expect(result.title).toEqual(notificationData.title);
      expect(result.message).toEqual(notificationData.message);
      expect(result.is_read).toEqual(false);
    }
  });

  it('should handle optional related_expense_id correctly', async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Test without related_expense_id
    const inputWithoutExpense: CreateNotificationInput = {
      user_id: userId,
      type: 'SYSTEM_UPDATE',
      title: 'System Maintenance',
      message: 'System will be down for maintenance'
    };

    const resultWithoutExpense = await createNotification(inputWithoutExpense);
    expect(resultWithoutExpense.related_expense_id).toBeNull();

    // Test with explicit null related_expense_id
    const inputWithNullExpense: CreateNotificationInput = {
      user_id: userId,
      type: 'BUDGET_ALERT',
      title: 'Budget Warning',
      message: 'Approaching budget limit',
      related_expense_id: null
    };

    const resultWithNullExpense = await createNotification(inputWithNullExpense);
    expect(resultWithNullExpense.related_expense_id).toBeNull();
  });

  it('should throw error for non-existent user', async () => {
    const input: CreateNotificationInput = {
      user_id: 9999, // Non-existent user ID
      type: 'BUDGET_ALERT',
      title: 'Test Notification',
      message: 'Test message'
    };

    await expect(createNotification(input)).rejects.toThrow(/User with ID 9999 not found/i);
  });

  it('should handle long notification messages', async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const longMessage = 'This is a very long notification message that contains detailed information about the user\'s expense tracking activity and budget status. '.repeat(5);

    const input: CreateNotificationInput = {
      user_id: userId,
      type: 'BUDGET_ALERT',
      title: 'Detailed Budget Alert',
      message: longMessage
    };

    const result = await createNotification(input);

    expect(result.message).toEqual(longMessage);
    expect(result.message.length).toBeGreaterThan(100);
  });

  it('should create multiple notifications for the same user', async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create multiple notifications
    const notifications = [];
    for (let i = 1; i <= 3; i++) {
      const input: CreateNotificationInput = {
        user_id: userId,
        type: 'SYSTEM_UPDATE',
        title: `Notification ${i}`,
        message: `This is notification number ${i}`
      };

      const result = await createNotification(input);
      notifications.push(result);
    }

    // Verify all notifications were created
    expect(notifications).toHaveLength(3);
    
    // Verify each notification has unique ID but same user_id
    const ids = notifications.map(n => n.id);
    expect(new Set(ids).size).toEqual(3); // All unique IDs
    
    notifications.forEach(notification => {
      expect(notification.user_id).toEqual(userId);
      expect(notification.type).toEqual('SYSTEM_UPDATE');
    });

    // Verify in database
    const dbNotifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.user_id, userId))
      .execute();

    expect(dbNotifications).toHaveLength(3);
  });
});