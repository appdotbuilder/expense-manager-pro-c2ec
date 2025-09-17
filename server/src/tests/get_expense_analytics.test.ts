import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, expensesTable, budgetsTable } from '../db/schema';
import { getExpenseAnalytics } from '../handlers/get_expense_analytics';

describe('getExpenseAnalytics', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;
  });

  it('should return empty analytics for user with no expenses', async () => {
    const result = await getExpenseAnalytics(testUserId, 'month');

    expect(result.spending_by_category).toEqual([]);
    expect(result.spending_trends).toEqual([]);
    expect(result.budget_performance).toEqual([]);
    expect(result.top_expenses).toEqual([]);
    expect(result.predictions.next_month_spending).toBe(0);
    expect(result.predictions.budget_alerts).toEqual([]);
  });

  it('should calculate spending by category correctly', async () => {
    const now = new Date();
    
    // Create test expenses
    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Grocery',
          amount: '100.50',
          category: 'FOOD_DINING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Gas',
          amount: '50.25',
          category: 'TRANSPORTATION' as const,
          expense_date: now,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Restaurant',
          amount: '75.00',
          category: 'FOOD_DINING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'month');

    expect(result.spending_by_category).toHaveLength(2);
    expect(result.spending_by_category[0]).toEqual({
      category: 'FOOD_DINING',
      amount: 175.50,
      percentage: expect.closeTo(77.73, 1) // 175.50 / 225.75 * 100
    });
    expect(result.spending_by_category[1]).toEqual({
      category: 'TRANSPORTATION',
      amount: 50.25,
      percentage: expect.closeTo(22.27, 1)
    });
  });

  it('should calculate spending trends by date', async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Expense 1',
          amount: '100.00',
          category: 'FOOD_DINING' as const,
          expense_date: today,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Expense 2',
          amount: '50.00',
          category: 'FOOD_DINING' as const,
          expense_date: today,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Expense 3',
          amount: '75.00',
          category: 'TRANSPORTATION' as const,
          expense_date: yesterday,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'month');

    expect(result.spending_trends).toHaveLength(2);
    
    // Should be sorted by date
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    const todayKey = today.toISOString().split('T')[0];
    
    expect(result.spending_trends[0].date).toBe(yesterdayKey);
    expect(result.spending_trends[0].amount).toBe(75);
    expect(result.spending_trends[1].date).toBe(todayKey);
    expect(result.spending_trends[1].amount).toBe(150);
  });

  it('should calculate budget performance', async () => {
    const now = new Date();
    
    // Create budget
    await db.insert(budgetsTable)
      .values({
        user_id: testUserId,
        category: 'FOOD_DINING' as const,
        monthly_limit: '500.00',
        alert_threshold: 80,
        is_active: true
      })
      .execute();

    // Create expenses
    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Grocery',
          amount: '300.00',
          category: 'FOOD_DINING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'month');

    expect(result.budget_performance).toHaveLength(1);
    expect(result.budget_performance[0]).toEqual({
      category: 'FOOD_DINING',
      budgeted: 500,
      spent: 300,
      remaining: 200
    });
  });

  it('should handle yearly period budget calculation', async () => {
    const now = new Date();
    
    // Create budget
    await db.insert(budgetsTable)
      .values({
        user_id: testUserId,
        category: 'FOOD_DINING' as const,
        monthly_limit: '500.00',
        alert_threshold: 80,
        is_active: true
      })
      .execute();

    // Create expenses
    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Grocery',
          amount: '1200.00',
          category: 'FOOD_DINING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'year');

    expect(result.budget_performance).toHaveLength(1);
    expect(result.budget_performance[0]).toEqual({
      category: 'FOOD_DINING',
      budgeted: 6000, // 500 * 12 months
      spent: 1200,
      remaining: 4800
    });
  });

  it('should return top expenses sorted by amount', async () => {
    const now = new Date();
    
    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Big Purchase',
          amount: '500.00',
          category: 'SHOPPING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Small Purchase',
          amount: '25.00',
          category: 'FOOD_DINING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Medium Purchase',
          amount: '100.00',
          category: 'ENTERTAINMENT' as const,
          expense_date: now,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'month');

    expect(result.top_expenses).toHaveLength(3);
    expect(result.top_expenses[0]).toEqual({
      title: 'Big Purchase',
      amount: 500,
      date: expect.any(Date),
      category: 'SHOPPING'
    });
    expect(result.top_expenses[1].amount).toBe(100);
    expect(result.top_expenses[2].amount).toBe(25);
  });

  it('should limit top expenses to 10 items', async () => {
    const now = new Date();
    const expenses = [];
    
    // Create 15 expenses
    for (let i = 1; i <= 15; i++) {
      expenses.push({
        user_id: testUserId,
        title: `Expense ${i}`,
        amount: `${i * 10}.00`,
        category: 'FOOD_DINING' as const,
        expense_date: now,
        status: 'APPROVED' as const
      });
    }
    
    await db.insert(expensesTable)
      .values(expenses)
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'month');

    expect(result.top_expenses).toHaveLength(10);
    expect(result.top_expenses[0].amount).toBe(150); // Highest amount
  });

  it('should calculate spending predictions with budget alerts', async () => {
    const now = new Date();
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    
    // Create budget for alerts - set a very low limit to guarantee alert
    await db.insert(budgetsTable)
      .values({
        user_id: testUserId,
        category: 'FOOD_DINING' as const,
        monthly_limit: '100.00', // Very low limit to trigger alert
        alert_threshold: 80,
        is_active: true
      })
      .execute();

    // Create recent expenses that will definitely exceed the budget
    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Recent Expense 1',
          amount: '80.00',
          category: 'FOOD_DINING' as const,
          expense_date: twentyDaysAgo,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Recent Expense 2',
          amount: '70.00',
          category: 'FOOD_DINING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'month');

    expect(result.predictions.next_month_spending).toBeGreaterThan(0);
    expect(result.predictions.budget_alerts.length).toBeGreaterThanOrEqual(1);
    if (result.predictions.budget_alerts.length > 0) {
      expect(result.predictions.budget_alerts[0].category).toBe('FOOD_DINING');
      expect(result.predictions.budget_alerts[0].projected_overspend).toBeGreaterThan(0);
    }
  });

  it('should handle custom date range', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const withinRange = new Date('2024-01-15');
    const outsideRange = new Date('2024-02-15');

    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Within Range',
          amount: '100.00',
          category: 'FOOD_DINING' as const,
          expense_date: withinRange,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Outside Range',
          amount: '200.00',
          category: 'FOOD_DINING' as const,
          expense_date: outsideRange,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'custom', startDate, endDate);

    expect(result.spending_by_category[0].amount).toBe(100);
    expect(result.top_expenses).toHaveLength(1);
    expect(result.top_expenses[0].title).toBe('Within Range');
  });

  it('should throw error for custom period without dates', async () => {
    await expect(getExpenseAnalytics(testUserId, 'custom'))
      .rejects.toThrow(/Custom period requires startDate and endDate/i);
  });

  it('should aggregate spending trends by month for yearly period', async () => {
    // Use current year to ensure data falls within year period
    const currentYear = new Date().getFullYear();
    const jan15 = new Date(currentYear, 0, 15); // January 15
    const jan20 = new Date(currentYear, 0, 20); // January 20
    const feb10 = new Date(currentYear, 1, 10); // February 10

    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Jan Expense 1',
          amount: '100.00',
          category: 'FOOD_DINING' as const,
          expense_date: jan15,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Jan Expense 2',
          amount: '50.00',
          category: 'FOOD_DINING' as const,
          expense_date: jan20,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Feb Expense',
          amount: '75.00',
          category: 'FOOD_DINING' as const,
          expense_date: feb10,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'year');

    expect(result.spending_trends).toHaveLength(2);
    expect(result.spending_trends[0].date).toBe(`${currentYear}-01`);
    expect(result.spending_trends[0].amount).toBe(150);
    expect(result.spending_trends[1].date).toBe(`${currentYear}-02`);
    expect(result.spending_trends[1].amount).toBe(75);
  });

  it('should only include active budgets in performance calculation', async () => {
    const now = new Date();

    // Create active and inactive budgets
    await db.insert(budgetsTable)
      .values([
        {
          user_id: testUserId,
          category: 'FOOD_DINING' as const,
          monthly_limit: '500.00',
          alert_threshold: 80,
          is_active: true
        },
        {
          user_id: testUserId,
          category: 'TRANSPORTATION' as const,
          monthly_limit: '300.00',
          alert_threshold: 80,
          is_active: false
        }
      ])
      .execute();

    // Create expenses for both categories
    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Food',
          amount: '100.00',
          category: 'FOOD_DINING' as const,
          expense_date: now,
          status: 'APPROVED' as const
        },
        {
          user_id: testUserId,
          title: 'Transport',
          amount: '50.00',
          category: 'TRANSPORTATION' as const,
          expense_date: now,
          status: 'APPROVED' as const
        }
      ])
      .execute();

    const result = await getExpenseAnalytics(testUserId, 'month');

    // Should only include active budget (FOOD_DINING)
    expect(result.budget_performance).toHaveLength(1);
    expect(result.budget_performance[0].category).toBe('FOOD_DINING');
  });
});