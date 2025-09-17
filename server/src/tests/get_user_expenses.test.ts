import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, expensesTable } from '../db/schema';
import { type GetUserExpensesInput } from '../schema';
import { getUserExpenses } from '../handlers/get_user_expenses';

describe('getUserExpenses', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Create test users and expenses
  let testUserId: number;
  let otherUserId: number;

  const setupTestData = async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'test@example.com',
          username: 'testuser',
          password_hash: 'hashedpassword',
          first_name: 'Test',
          last_name: 'User',
          role: 'USER'
        },
        {
          email: 'other@example.com',
          username: 'otheruser',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    testUserId = users[0].id;
    otherUserId = users[1].id;

    // Create test expenses for the main user
    const baseDate = new Date('2024-01-15');
    const expenses = [
      {
        user_id: testUserId,
        title: 'Lunch at Restaurant',
        description: 'Business lunch meeting',
        amount: '25.50',
        category: 'FOOD_DINING' as const,
        status: 'APPROVED' as const,
        expense_date: new Date('2024-01-10'),
        is_recurring: false
      },
      {
        user_id: testUserId,
        title: 'Gas Station',
        description: 'Fuel for company car',
        amount: '45.75',
        category: 'TRANSPORTATION' as const,
        status: 'PENDING' as const,
        expense_date: new Date('2024-01-12'),
        is_recurring: false
      },
      {
        user_id: testUserId,
        title: 'Office Supplies',
        description: 'Notebooks and pens',
        amount: '15.25',
        category: 'BUSINESS' as const,
        status: 'APPROVED' as const,
        expense_date: new Date('2024-01-20'),
        is_recurring: false
      },
      {
        user_id: testUserId,
        title: 'Movie Theater',
        description: 'Weekend entertainment',
        amount: '18.00',
        category: 'ENTERTAINMENT' as const,
        status: 'REJECTED' as const,
        expense_date: new Date('2024-01-25'),
        is_recurring: false
      },
      {
        user_id: otherUserId, // Different user - should not appear in results
        title: 'Other User Expense',
        description: 'Should not appear',
        amount: '100.00',
        category: 'FOOD_DINING' as const,
        status: 'APPROVED' as const,
        expense_date: new Date('2024-01-15'),
        is_recurring: false
      }
    ];

    await db.insert(expensesTable).values(expenses).execute();
  };

  it('should return all expenses for a user with default pagination', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(4);
    expect(result.total).toBe(4);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.total_pages).toBe(1);

    // Verify expenses are ordered by expense_date descending (most recent first)
    expect(result.expenses[0].title).toBe('Movie Theater'); // 2024-01-25
    expect(result.expenses[1].title).toBe('Office Supplies'); // 2024-01-20
    expect(result.expenses[2].title).toBe('Gas Station'); // 2024-01-12
    expect(result.expenses[3].title).toBe('Lunch at Restaurant'); // 2024-01-10

    // Verify numeric conversion
    result.expenses.forEach(expense => {
      expect(typeof expense.amount).toBe('number');
    });
  });

  it('should filter expenses by category', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      category: 'FOOD_DINING',
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.expenses[0].title).toBe('Lunch at Restaurant');
    expect(result.expenses[0].category).toBe('FOOD_DINING');
  });

  it('should filter expenses by status', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      status: 'APPROVED',
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(2);
    expect(result.total).toBe(2);
    result.expenses.forEach(expense => {
      expect(expense.status).toBe('APPROVED');
    });
  });

  it('should filter expenses by date range', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      date_from: new Date('2024-01-11'),
      date_to: new Date('2024-01-20'),
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(2);
    expect(result.total).toBe(2);
    
    // Should include Gas Station (2024-01-12) and Office Supplies (2024-01-20)
    const titles = result.expenses.map(e => e.title).sort();
    expect(titles).toEqual(['Gas Station', 'Office Supplies']);
  });

  it('should search expenses by title', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      search: 'office',
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.expenses[0].title).toBe('Office Supplies');
  });

  it('should handle pagination correctly', async () => {
    await setupTestData();

    // First page with limit 2
    const firstPageInput: GetUserExpensesInput = {
      user_id: testUserId,
      page: 1,
      limit: 2
    };

    const firstPage = await getUserExpenses(firstPageInput);

    expect(firstPage.expenses).toHaveLength(2);
    expect(firstPage.total).toBe(4);
    expect(firstPage.page).toBe(1);
    expect(firstPage.limit).toBe(2);
    expect(firstPage.total_pages).toBe(2);

    // Second page with limit 2
    const secondPageInput: GetUserExpensesInput = {
      user_id: testUserId,
      page: 2,
      limit: 2
    };

    const secondPage = await getUserExpenses(secondPageInput);

    expect(secondPage.expenses).toHaveLength(2);
    expect(secondPage.total).toBe(4);
    expect(secondPage.page).toBe(2);
    expect(secondPage.limit).toBe(2);
    expect(secondPage.total_pages).toBe(2);

    // Verify different expenses on each page
    const firstPageTitles = firstPage.expenses.map(e => e.title);
    const secondPageTitles = secondPage.expenses.map(e => e.title);
    expect(firstPageTitles).not.toEqual(secondPageTitles);
  });

  it('should combine multiple filters', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      category: 'BUSINESS',
      status: 'APPROVED',
      date_from: new Date('2024-01-15'),
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.expenses[0].title).toBe('Office Supplies');
    expect(result.expenses[0].category).toBe('BUSINESS');
    expect(result.expenses[0].status).toBe('APPROVED');
  });

  it('should return empty results for non-existent user', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: 99999,
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.total_pages).toBe(0);
  });

  it('should handle case-insensitive search', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      search: 'RESTAURANT',
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].title).toBe('Lunch at Restaurant');
  });

  it('should exclude expenses from other users', async () => {
    await setupTestData();

    const input: GetUserExpensesInput = {
      user_id: testUserId,
      page: 1,
      limit: 20
    };

    const result = await getUserExpenses(input);

    // Should only return expenses for testUserId, not otherUserId
    result.expenses.forEach(expense => {
      expect(expense.user_id).toBe(testUserId);
      expect(expense.title).not.toBe('Other User Expense');
    });
  });
});