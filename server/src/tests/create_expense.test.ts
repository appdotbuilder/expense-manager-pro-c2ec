import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, teamsTable, expensesTable, budgetsTable } from '../db/schema';
import { type CreateExpenseInput } from '../schema';
import { createExpense } from '../handlers/create_expense';
import { eq, and } from 'drizzle-orm';

describe('createExpense', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data
  let testUserId: number;
  let testTeamId: number;
  let testManagerId: number;

  const createTestUser = async (role: 'USER' | 'MANAGER' = 'USER') => {
    const result = await db.insert(usersTable)
      .values({
        email: `test${Date.now()}@example.com`,
        username: `testuser${Date.now()}`,
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User',
        role: role
      })
      .returning()
      .execute();
    return result[0].id;
  };

  const createTestTeam = async (managerId: number) => {
    const result = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        description: 'A test team',
        manager_id: managerId
      })
      .returning()
      .execute();
    return result[0].id;
  };

  const createTestBudget = async (userId: number, category: any, monthlyLimit: number = 1000) => {
    return await db.insert(budgetsTable)
      .values({
        user_id: userId,
        category: category,
        monthly_limit: monthlyLimit.toString(),
        alert_threshold: 80
      })
      .returning()
      .execute();
  };

  it('should create a basic expense successfully', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'Test Expense',
      description: 'A test expense',
      amount: 50.99,
      category: 'FOOD_DINING',
      expense_date: new Date('2024-01-15'),
      is_recurring: false,
      tags: ['work', 'lunch']
    };

    const result = await createExpense(testInput);

    // Verify expense fields
    expect(result.id).toBeGreaterThan(0);
    expect(result.user_id).toEqual(testUserId);
    expect(result.team_id).toBeNull();
    expect(result.title).toEqual('Test Expense');
    expect(result.description).toEqual('A test expense');
    expect(result.amount).toEqual(50.99);
    expect(typeof result.amount).toEqual('number');
    expect(result.category).toEqual('FOOD_DINING');
    expect(result.status).toEqual('PENDING');
    expect(result.expense_date).toBeInstanceOf(Date);
    expect(result.is_recurring).toEqual(false);
    expect(result.tags).toEqual('["work","lunch"]');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create expense with team_id when provided', async () => {
    testManagerId = await createTestUser('MANAGER');
    testUserId = await createTestUser();
    testTeamId = await createTestTeam(testManagerId);

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      team_id: testTeamId,
      title: 'Team Expense',
      amount: 100.00,
      category: 'BUSINESS',
      expense_date: new Date(),
      is_recurring: false
    };

    const result = await createExpense(testInput);

    expect(result.team_id).toEqual(testTeamId);
    expect(result.title).toEqual('Team Expense');
    expect(result.amount).toEqual(100.00);
    expect(result.category).toEqual('BUSINESS');
  });

  it('should create expense with minimal required fields', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'Minimal Expense',
      amount: 25.50,
      category: 'TRANSPORTATION',
      expense_date: new Date(),
      is_recurring: false
    };

    const result = await createExpense(testInput);

    expect(result.title).toEqual('Minimal Expense');
    expect(result.description).toBeNull();
    expect(result.amount).toEqual(25.50);
    expect(result.team_id).toBeNull();
    expect(result.receipt_url).toBeNull();
    expect(result.is_recurring).toEqual(false);
    expect(result.recurring_frequency).toBeNull();
    expect(result.tags).toBeNull();
  });

  it('should handle recurring expense', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'Monthly Subscription',
      amount: 29.99,
      category: 'BILLS_UTILITIES',
      expense_date: new Date(),
      is_recurring: true,
      recurring_frequency: 'monthly'
    };

    const result = await createExpense(testInput);

    expect(result.is_recurring).toEqual(true);
    expect(result.recurring_frequency).toEqual('monthly');
  });

  it('should save expense to database correctly', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'Database Test',
      amount: 75.25,
      category: 'SHOPPING',
      expense_date: new Date('2024-02-01'),
      is_recurring: false
    };

    const result = await createExpense(testInput);

    // Query database to verify expense was saved
    const savedExpense = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, result.id))
      .execute();

    expect(savedExpense).toHaveLength(1);
    expect(savedExpense[0].title).toEqual('Database Test');
    expect(parseFloat(savedExpense[0].amount)).toEqual(75.25);
    expect(savedExpense[0].category).toEqual('SHOPPING');
    expect(savedExpense[0].status).toEqual('PENDING');
  });

  it('should update budget current_spent when budget exists', async () => {
    testUserId = await createTestUser();
    
    // Create budget for FOOD_DINING category
    await createTestBudget(testUserId, 'FOOD_DINING', 500);

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'Food Expense',
      amount: 45.50,
      category: 'FOOD_DINING',
      expense_date: new Date(),
      is_recurring: false
    };

    await createExpense(testInput);

    // Check budget was updated
    const budget = await db.select()
      .from(budgetsTable)
      .where(
        and(
          eq(budgetsTable.user_id, testUserId),
          eq(budgetsTable.category, 'FOOD_DINING')
        )
      )
      .execute();

    expect(budget).toHaveLength(1);
    expect(parseFloat(budget[0].current_spent)).toEqual(45.50);
  });

  it('should update budget current_spent correctly with multiple expenses', async () => {
    testUserId = await createTestUser();
    
    // Create budget for TRANSPORTATION category
    await createTestBudget(testUserId, 'TRANSPORTATION', 300);

    // Create first expense
    await createExpense({
      user_id: testUserId,
      title: 'Bus Fare',
      amount: 25.00,
      category: 'TRANSPORTATION',
      expense_date: new Date(),
      is_recurring: false
    });

    // Create second expense
    await createExpense({
      user_id: testUserId,
      title: 'Taxi Ride',
      amount: 35.50,
      category: 'TRANSPORTATION',
      expense_date: new Date(),
      is_recurring: false
    });

    // Check budget current_spent is cumulative
    const budget = await db.select()
      .from(budgetsTable)
      .where(
        and(
          eq(budgetsTable.user_id, testUserId),
          eq(budgetsTable.category, 'TRANSPORTATION')
        )
      )
      .execute();

    expect(budget).toHaveLength(1);
    expect(parseFloat(budget[0].current_spent)).toEqual(60.50);
  });

  it('should not update budget if no budget exists for category', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'No Budget Category',
      amount: 100.00,
      category: 'ENTERTAINMENT',
      expense_date: new Date(),
      is_recurring: false
    };

    // This should not throw an error even without a budget
    const result = await createExpense(testInput);
    expect(result.amount).toEqual(100.00);
  });

  it('should throw error for non-existent user', async () => {
    const testInput: CreateExpenseInput = {
      user_id: 99999, // Non-existent user
      title: 'Invalid User Expense',
      amount: 50.00,
      category: 'FOOD_DINING',
      expense_date: new Date(),
      is_recurring: false
    };

    await expect(createExpense(testInput)).rejects.toThrow(/User with id 99999 not found/i);
  });

  it('should throw error for non-existent team', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      team_id: 99999, // Non-existent team
      title: 'Invalid Team Expense',
      amount: 50.00,
      category: 'BUSINESS',
      expense_date: new Date(),
      is_recurring: false
    };

    await expect(createExpense(testInput)).rejects.toThrow(/Team with id 99999 not found/i);
  });

  it('should handle large decimal amounts correctly', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'Large Amount',
      amount: 9999.99,
      category: 'BUSINESS',
      expense_date: new Date(),
      is_recurring: false
    };

    const result = await createExpense(testInput);

    expect(result.amount).toEqual(9999.99);
    expect(typeof result.amount).toEqual('number');

    // Verify in database
    const savedExpense = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, result.id))
      .execute();

    expect(parseFloat(savedExpense[0].amount)).toEqual(9999.99);
  });

  it('should handle complex tags array', async () => {
    testUserId = await createTestUser();

    const testInput: CreateExpenseInput = {
      user_id: testUserId,
      title: 'Tagged Expense',
      amount: 42.00,
      category: 'EDUCATION',
      expense_date: new Date(),
      is_recurring: false,
      tags: ['conference', 'professional-development', 'training', 'online-course']
    };

    const result = await createExpense(testInput);

    expect(result.tags).toEqual('["conference","professional-development","training","online-course"]');

    // Verify tags can be parsed back
    const parsedTags = JSON.parse(result.tags!);
    expect(parsedTags).toEqual(['conference', 'professional-development', 'training', 'online-course']);
  });
});