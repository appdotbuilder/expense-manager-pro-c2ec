import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, expensesTable, budgetsTable } from '../db/schema';
import { type GetDashboardDataInput } from '../schema';
import { getDashboardData } from '../handlers/get_dashboard_data';

// Test user data
const testUser = {
  email: 'testuser@example.com',
  username: 'testuser',
  password_hash: 'hashed_password',
  first_name: 'Test',
  last_name: 'User',
  role: 'USER' as const
};

describe('getDashboardData', () => {
  let userId: number;
  
  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    userId = userResult[0].id;
  });
  
  afterEach(resetDB);

  it('should return empty dashboard data for user with no expenses', async () => {
    const input: GetDashboardDataInput = {
      user_id: userId
    };

    const result = await getDashboardData(input);

    expect(result.total_expenses).toBe(0);
    expect(result.monthly_spending).toBe(0);
    expect(result.budget_utilization).toBe(0);
    expect(result.category_breakdown).toHaveLength(0);
    expect(result.spending_trends).toHaveLength(0);
    expect(result.recent_expenses).toHaveLength(0);
    expect(result.budget_alerts).toHaveLength(0);
  });

  it('should calculate dashboard data with expenses and budgets', async () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    // Create test expenses
    await db.insert(expensesTable).values([
      {
        user_id: userId,
        title: 'Lunch',
        amount: '25.50',
        category: 'FOOD_DINING',
        expense_date: new Date(currentYear, currentMonth - 1, 15),
        status: 'APPROVED'
      },
      {
        user_id: userId,
        title: 'Gas',
        amount: '45.00',
        category: 'TRANSPORTATION',
        expense_date: new Date(currentYear, currentMonth - 1, 10),
        status: 'PENDING'
      },
      {
        user_id: userId,
        title: 'Coffee',
        amount: '4.50',
        category: 'FOOD_DINING',
        expense_date: new Date(currentYear, currentMonth - 1, 20),
        status: 'APPROVED'
      }
    ]).execute();

    // Create test budgets
    await db.insert(budgetsTable).values([
      {
        user_id: userId,
        category: 'FOOD_DINING',
        monthly_limit: '100.00',
        current_spent: '30.00',
        alert_threshold: 80,
        is_active: true
      },
      {
        user_id: userId,
        category: 'TRANSPORTATION',
        monthly_limit: '200.00',
        current_spent: '45.00',
        alert_threshold: 70,
        is_active: true
      }
    ]).execute();

    const input: GetDashboardDataInput = {
      user_id: userId,
      month: currentMonth,
      year: currentYear
    };

    const result = await getDashboardData(input);

    // Verify total expenses count
    expect(result.total_expenses).toBe(3);
    
    // Verify monthly spending (25.50 + 45.00 + 4.50 = 75.00)
    expect(result.monthly_spending).toBe(75.00);
    
    // Verify budget utilization (75 / 300 * 100 = 25%)
    expect(result.budget_utilization).toBe(25);
    
    // Verify category breakdown
    expect(result.category_breakdown).toHaveLength(2);
    
    const foodCategory = result.category_breakdown.find(cat => cat.category === 'FOOD_DINING');
    expect(foodCategory).toBeDefined();
    expect(foodCategory!.amount).toBe(30.00); // 25.50 + 4.50
    expect(foodCategory!.count).toBe(2);
    
    const transportCategory = result.category_breakdown.find(cat => cat.category === 'TRANSPORTATION');
    expect(transportCategory).toBeDefined();
    expect(transportCategory!.amount).toBe(45.00);
    expect(transportCategory!.count).toBe(1);
    
    // Verify recent expenses
    expect(result.recent_expenses).toHaveLength(3);
    expect(typeof result.recent_expenses[0].amount).toBe('number');
    
    // Verify spending trends
    expect(result.spending_trends.length).toBeGreaterThanOrEqual(1);
    expect(typeof result.spending_trends[0].amount).toBe('number');
    
    // Verify no budget alerts (under 80% threshold)
    expect(result.budget_alerts).toHaveLength(0);
  });

  it('should generate budget alerts for high utilization', async () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    // Create expense that will trigger budget alert
    await db.insert(expensesTable).values({
      user_id: userId,
      title: 'Expensive Dinner',
      amount: '85.00',
      category: 'FOOD_DINING',
      expense_date: new Date(currentYear, currentMonth - 1, 15),
      status: 'APPROVED'
    }).execute();

    // Create budget with low limit to trigger alert
    await db.insert(budgetsTable).values({
      user_id: userId,
      category: 'FOOD_DINING',
      monthly_limit: '100.00',
      current_spent: '0.00',
      alert_threshold: 80,
      is_active: true
    }).execute();

    const input: GetDashboardDataInput = {
      user_id: userId,
      month: currentMonth,
      year: currentYear
    };

    const result = await getDashboardData(input);

    // Verify budget alert is generated
    expect(result.budget_alerts).toHaveLength(1);
    expect(result.budget_alerts[0].category).toBe('FOOD_DINING');
    expect(result.budget_alerts[0].current).toBe(85.00);
    expect(result.budget_alerts[0].limit).toBe(100.00);
    expect(result.budget_alerts[0].percentage).toBe(85);
  });

  it('should handle specific month and year parameters', async () => {
    // Create expenses in different months
    await db.insert(expensesTable).values([
      {
        user_id: userId,
        title: 'January Expense',
        amount: '100.00',
        category: 'FOOD_DINING',
        expense_date: new Date(2024, 0, 15), // January 2024
        status: 'APPROVED'
      },
      {
        user_id: userId,
        title: 'February Expense',
        amount: '200.00',
        category: 'FOOD_DINING',
        expense_date: new Date(2024, 1, 15), // February 2024
        status: 'APPROVED'
      }
    ]).execute();

    // Query for January 2024
    const input: GetDashboardDataInput = {
      user_id: userId,
      month: 1,
      year: 2024
    };

    const result = await getDashboardData(input);

    expect(result.monthly_spending).toBe(100.00);
    expect(result.category_breakdown).toHaveLength(1);
    expect(result.category_breakdown[0].amount).toBe(100.00);
  });

  it('should handle inactive budgets correctly', async () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    await db.insert(expensesTable).values({
      user_id: userId,
      title: 'Test Expense',
      amount: '50.00',
      category: 'FOOD_DINING',
      expense_date: new Date(currentYear, currentMonth - 1, 15),
      status: 'APPROVED'
    }).execute();

    // Create inactive budget
    await db.insert(budgetsTable).values({
      user_id: userId,
      category: 'FOOD_DINING',
      monthly_limit: '100.00',
      current_spent: '0.00',
      alert_threshold: 80,
      is_active: false // Inactive budget
    }).execute();

    const input: GetDashboardDataInput = {
      user_id: userId,
      month: currentMonth,
      year: currentYear
    };

    const result = await getDashboardData(input);

    // Budget utilization should be 0 since no active budgets
    expect(result.budget_utilization).toBe(0);
    expect(result.budget_alerts).toHaveLength(0);
  });

  it('should limit recent expenses to 5 items', async () => {
    // Create 7 expenses
    const expenses = Array.from({ length: 7 }, (_, i) => ({
      user_id: userId,
      title: `Expense ${i + 1}`,
      amount: '10.00',
      category: 'FOOD_DINING' as const,
      expense_date: new Date(),
      status: 'APPROVED' as const
    }));

    await db.insert(expensesTable).values(expenses).execute();

    const input: GetDashboardDataInput = {
      user_id: userId
    };

    const result = await getDashboardData(input);

    expect(result.recent_expenses).toHaveLength(5);
    expect(result.total_expenses).toBe(7);
  });

  it('should calculate spending trends over 12 months', async () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // Create expenses across different months
    await db.insert(expensesTable).values([
      {
        user_id: userId,
        title: 'January Expense',
        amount: '100.00',
        category: 'FOOD_DINING',
        expense_date: new Date(currentYear, 0, 15),
        status: 'APPROVED'
      },
      {
        user_id: userId,
        title: 'March Expense',
        amount: '200.00',
        category: 'TRANSPORTATION',
        expense_date: new Date(currentYear, 2, 15),
        status: 'APPROVED'
      },
      {
        user_id: userId,
        title: 'Previous Year Expense',
        amount: '50.00',
        category: 'FOOD_DINING',
        expense_date: new Date(currentYear - 1, 11, 15), // December previous year
        status: 'APPROVED'
      }
    ]).execute();

    const input: GetDashboardDataInput = {
      user_id: userId,
      month: 6, // June
      year: currentYear
    };

    const result = await getDashboardData(input);

    expect(result.spending_trends.length).toBeGreaterThanOrEqual(1);
    
    // Verify trend data structure
    result.spending_trends.forEach(trend => {
      expect(trend.date).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM format
      expect(typeof trend.amount).toBe('number');
    });
  });

  it('should handle user with no data gracefully', async () => {
    // Create another user with no expenses or budgets
    const anotherUser = await db.insert(usersTable)
      .values({
        ...testUser,
        email: 'another@example.com',
        username: 'anotheruser'
      })
      .returning()
      .execute();

    const input: GetDashboardDataInput = {
      user_id: anotherUser[0].id
    };

    const result = await getDashboardData(input);

    expect(result.total_expenses).toBe(0);
    expect(result.monthly_spending).toBe(0);
    expect(result.budget_utilization).toBe(0);
    expect(result.category_breakdown).toHaveLength(0);
    expect(result.spending_trends).toHaveLength(0);
    expect(result.recent_expenses).toHaveLength(0);
    expect(result.budget_alerts).toHaveLength(0);
  });
});