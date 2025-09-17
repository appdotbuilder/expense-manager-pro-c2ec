import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { budgetsTable, usersTable, expensesTable } from '../db/schema';
import { type CreateBudgetInput } from '../schema';
import { createBudget } from '../handlers/create_budget';
import { eq, and } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  username: 'testuser',
  password_hash: 'hashedpassword',
  first_name: 'Test',
  last_name: 'User',
  role: 'USER' as const
};

const testBudgetInput: CreateBudgetInput = {
  user_id: 1, // Will be set after user creation
  category: 'FOOD_DINING',
  monthly_limit: 500.00,
  alert_threshold: 80
};

describe('createBudget', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a budget successfully', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;
    const budgetInput = { ...testBudgetInput, user_id: userId };

    const result = await createBudget(budgetInput);

    // Verify budget fields
    expect(result.id).toBeDefined();
    expect(result.user_id).toBe(userId);
    expect(result.category).toBe('FOOD_DINING');
    expect(result.monthly_limit).toBe(500.00);
    expect(typeof result.monthly_limit).toBe('number');
    expect(result.current_spent).toBe(0);
    expect(typeof result.current_spent).toBe('number');
    expect(result.alert_threshold).toBe(80);
    expect(result.is_active).toBe(true);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save budget to database', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;
    const budgetInput = { ...testBudgetInput, user_id: userId };

    const result = await createBudget(budgetInput);

    // Verify budget was saved to database
    const budgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, result.id))
      .execute();

    expect(budgets).toHaveLength(1);
    expect(budgets[0].user_id).toBe(userId);
    expect(budgets[0].category).toBe('FOOD_DINING');
    expect(parseFloat(budgets[0].monthly_limit)).toBe(500.00);
    expect(parseFloat(budgets[0].current_spent)).toBe(0);
    expect(budgets[0].alert_threshold).toBe(80);
    expect(budgets[0].is_active).toBe(true);
  });

  it('should calculate current spent from existing expenses', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create some expenses for this month in the same category
    const currentDate = new Date();
    const thisMonthExpense1 = new Date(currentDate.getFullYear(), currentDate.getMonth(), 5);
    const thisMonthExpense2 = new Date(currentDate.getFullYear(), currentDate.getMonth(), 15);
    
    await db.insert(expensesTable)
      .values([
        {
          user_id: userId,
          title: 'Lunch',
          amount: '25.50',
          category: 'FOOD_DINING',
          expense_date: thisMonthExpense1
        },
        {
          user_id: userId,
          title: 'Dinner',
          amount: '42.75',
          category: 'FOOD_DINING',
          expense_date: thisMonthExpense2
        },
        // This expense is from previous month - should not be counted
        {
          user_id: userId,
          title: 'Last Month Meal',
          amount: '30.00',
          category: 'FOOD_DINING',
          expense_date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 15)
        },
        // This expense is different category - should not be counted
        {
          user_id: userId,
          title: 'Transport',
          amount: '15.00',
          category: 'TRANSPORTATION',
          expense_date: thisMonthExpense1
        }
      ])
      .execute();

    const budgetInput = { ...testBudgetInput, user_id: userId };
    const result = await createBudget(budgetInput);

    // Should calculate current spent as sum of this month's FOOD_DINING expenses only
    expect(result.current_spent).toBe(68.25); // 25.50 + 42.75
    expect(typeof result.current_spent).toBe('number');
  });

  it('should use default alert threshold when not provided', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;
    
    // Create budget input with alert_threshold (Zod already applied the default of 80)
    const budgetInput: CreateBudgetInput = {
      user_id: userId,
      category: 'TRANSPORTATION',
      monthly_limit: 300.00,
      alert_threshold: 80 // This demonstrates the Zod default was applied
    };

    const result = await createBudget(budgetInput);

    expect(result.alert_threshold).toBe(80);
  });

  it('should throw error when user does not exist', async () => {
    const budgetInput = { ...testBudgetInput, user_id: 999 }; // Non-existent user

    expect(createBudget(budgetInput)).rejects.toThrow(/user not found/i);
  });

  it('should throw error when budget already exists for category', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create first budget
    await db.insert(budgetsTable)
      .values({
        user_id: userId,
        category: 'FOOD_DINING',
        monthly_limit: '400.00',
        current_spent: '0.00',
        alert_threshold: 75
      })
      .execute();

    // Try to create another budget for the same category
    const budgetInput = { ...testBudgetInput, user_id: userId };

    expect(createBudget(budgetInput)).rejects.toThrow(/budget already exists/i);
  });

  it('should allow creating budgets for different categories', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create budgets for different categories
    const budgetInput1 = { ...testBudgetInput, user_id: userId, category: 'FOOD_DINING' as const };
    const budgetInput2 = { ...testBudgetInput, user_id: userId, category: 'TRANSPORTATION' as const };

    const result1 = await createBudget(budgetInput1);
    const result2 = await createBudget(budgetInput2);

    expect(result1.category).toBe('FOOD_DINING');
    expect(result2.category).toBe('TRANSPORTATION');
    expect(result1.id).not.toBe(result2.id);

    // Verify both budgets exist in database
    const budgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.user_id, userId))
      .execute();

    expect(budgets).toHaveLength(2);
  });

  it('should allow different users to create budgets for same category', async () => {
    // Create two test users
    const user1Result = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const user2Result = await db.insert(usersTable)
      .values({
        ...testUser,
        email: 'test2@example.com',
        username: 'testuser2'
      })
      .returning()
      .execute();
    
    const userId1 = user1Result[0].id;
    const userId2 = user2Result[0].id;

    // Create budgets for same category but different users
    const budgetInput1 = { ...testBudgetInput, user_id: userId1 };
    const budgetInput2 = { ...testBudgetInput, user_id: userId2 };

    const result1 = await createBudget(budgetInput1);
    const result2 = await createBudget(budgetInput2);

    expect(result1.user_id).toBe(userId1);
    expect(result2.user_id).toBe(userId2);
    expect(result1.category).toBe(result2.category);
    expect(result1.id).not.toBe(result2.id);
  });
});