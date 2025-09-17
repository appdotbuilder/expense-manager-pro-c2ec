import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, notificationsTable, expensesTable } from '../db/schema';
import { getUserNotifications } from '../handlers/get_user_notifications';

describe('getUserNotifications', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser1Id: number;
  let testUser2Id: number;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@example.com',
          username: 'testuser1',
          password_hash: 'hashedpassword1',
          first_name: 'Test',
          last_name: 'User1',
          role: 'USER'
        },
        {
          email: 'user2@example.com',
          username: 'testuser2',
          password_hash: 'hashedpassword2',
          first_name: 'Test',
          last_name: 'User2',
          role: 'USER'
        }
      ])
      .returning({ id: usersTable.id })
      .execute();

    testUser1Id = users[0].id;
    testUser2Id = users[1].id;
  });

  it('should return all notifications for a user', async () => {
    // Create test notifications for user 1
    await db.insert(notificationsTable)
      .values([
        {
          user_id: testUser1Id,
          type: 'BUDGET_ALERT',
          title: 'Budget Alert',
          message: 'You have exceeded your budget limit',
          is_read: false
        },
        {
          user_id: testUser1Id,
          type: 'EXPENSE_APPROVAL',
          title: 'Expense Approved',
          message: 'Your expense has been approved',
          is_read: true
        },
        {
          user_id: testUser2Id,
          type: 'SYSTEM_UPDATE',
          title: 'System Update',
          message: 'System maintenance scheduled',
          is_read: false
        }
      ])
      .execute();

    const result = await getUserNotifications(testUser1Id, false);

    expect(result).toHaveLength(2);
    expect(result[0].user_id).toEqual(testUser1Id);
    expect(result[1].user_id).toEqual(testUser1Id);
    expect(result.some(n => n.type === 'BUDGET_ALERT')).toBe(true);
    expect(result.some(n => n.type === 'EXPENSE_APPROVAL')).toBe(true);
    expect(result.some(n => n.user_id === testUser2Id)).toBe(false);
  });

  it('should return only unread notifications when unreadOnly is true', async () => {
    // Create mix of read and unread notifications
    await db.insert(notificationsTable)
      .values([
        {
          user_id: testUser1Id,
          type: 'BUDGET_ALERT',
          title: 'Unread Budget Alert',
          message: 'Budget limit reached',
          is_read: false
        },
        {
          user_id: testUser1Id,
          type: 'EXPENSE_APPROVAL',
          title: 'Read Expense Approval',
          message: 'Expense approved',
          is_read: true
        },
        {
          user_id: testUser1Id,
          type: 'EXPENSE_REMINDER',
          title: 'Unread Reminder',
          message: 'Submit your expenses',
          is_read: false
        }
      ])
      .execute();

    const result = await getUserNotifications(testUser1Id, true);

    expect(result).toHaveLength(2);
    expect(result.every(n => n.is_read === false)).toBe(true);
    expect(result.some(n => n.title === 'Unread Budget Alert')).toBe(true);
    expect(result.some(n => n.title === 'Unread Reminder')).toBe(true);
    expect(result.some(n => n.title === 'Read Expense Approval')).toBe(false);
  });

  it('should return notifications ordered by creation date descending', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // Insert notifications with specific timestamps
    await db.insert(notificationsTable)
      .values([
        {
          user_id: testUser1Id,
          type: 'BUDGET_ALERT',
          title: 'Oldest Notification',
          message: 'This is the oldest',
          is_read: false,
          created_at: twoDaysAgo
        },
        {
          user_id: testUser1Id,
          type: 'EXPENSE_APPROVAL',
          title: 'Newest Notification',
          message: 'This is the newest',
          is_read: false,
          created_at: now
        },
        {
          user_id: testUser1Id,
          type: 'EXPENSE_REMINDER',
          title: 'Middle Notification',
          message: 'This is in the middle',
          is_read: false,
          created_at: yesterday
        }
      ])
      .execute();

    const result = await getUserNotifications(testUser1Id, false);

    expect(result).toHaveLength(3);
    expect(result[0].title).toEqual('Newest Notification');
    expect(result[1].title).toEqual('Middle Notification');
    expect(result[2].title).toEqual('Oldest Notification');
    
    // Verify dates are in descending order
    expect(result[0].created_at >= result[1].created_at).toBe(true);
    expect(result[1].created_at >= result[2].created_at).toBe(true);
  });

  it('should return empty array for user with no notifications', async () => {
    const result = await getUserNotifications(testUser1Id, false);
    expect(result).toHaveLength(0);
  });

  it('should return empty array for non-existent user', async () => {
    const nonExistentUserId = 99999;
    const result = await getUserNotifications(nonExistentUserId, false);
    expect(result).toHaveLength(0);
  });

  it('should limit results to 50 notifications', async () => {
    // Create more than 50 notifications
    const notifications = Array.from({ length: 60 }, (_, i) => ({
      user_id: testUser1Id,
      type: 'SYSTEM_UPDATE' as const,
      title: `Notification ${i + 1}`,
      message: `Message ${i + 1}`,
      is_read: false
    }));

    await db.insert(notificationsTable)
      .values(notifications)
      .execute();

    const result = await getUserNotifications(testUser1Id, false);

    expect(result).toHaveLength(50);
  });

  it('should handle notifications with related_expense_id', async () => {
    // First create an expense to reference
    const expense = await db.insert(expensesTable)
      .values([
        {
          user_id: testUser1Id,
          title: 'Test Expense',
          amount: '100.50',
          category: 'BUSINESS',
          expense_date: new Date()
        }
      ])
      .returning({ id: expensesTable.id })
      .execute();

    const expenseId = expense[0].id;

    await db.insert(notificationsTable)
      .values([
        {
          user_id: testUser1Id,
          type: 'EXPENSE_APPROVAL',
          title: 'Expense Approved',
          message: 'Your expense has been approved',
          is_read: false,
          related_expense_id: expenseId
        }
      ])
      .execute();

    const result = await getUserNotifications(testUser1Id, false);

    expect(result).toHaveLength(1);
    expect(result[0].related_expense_id).toEqual(expenseId);
    expect(result[0].type).toEqual('EXPENSE_APPROVAL');
  });

  it('should verify all notification fields are returned correctly', async () => {
    await db.insert(notificationsTable)
      .values([
        {
          user_id: testUser1Id,
          type: 'BUDGET_ALERT',
          title: 'Test Notification',
          message: 'Test message content',
          is_read: true,
          related_expense_id: null
        }
      ])
      .execute();

    const result = await getUserNotifications(testUser1Id, false);

    expect(result).toHaveLength(1);
    const notification = result[0];
    
    expect(notification.id).toBeDefined();
    expect(notification.user_id).toEqual(testUser1Id);
    expect(notification.type).toEqual('BUDGET_ALERT');
    expect(notification.title).toEqual('Test Notification');
    expect(notification.message).toEqual('Test message content');
    expect(notification.is_read).toBe(true);
    expect(notification.related_expense_id).toBeNull();
    expect(notification.created_at).toBeInstanceOf(Date);
  });
});