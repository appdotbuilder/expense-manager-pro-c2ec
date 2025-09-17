import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, expensesTable, budgetsTable } from '../db/schema';
import { type UpdateExpenseInput } from '../schema';
import { updateExpense } from '../handlers/update_expense';
import { eq, and } from 'drizzle-orm';

describe('updateExpense', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test user
  const createTestUser = async () => {
    const users = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();
    return users[0];
  };

  // Helper function to create test expense
  const createTestExpense = async (userId: number) => {
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: userId,
        title: 'Original Expense',
        description: 'Original description',
        amount: '100.00',
        category: 'FOOD_DINING',
        expense_date: new Date('2024-01-15'),
        is_recurring: false,
        tags: JSON.stringify(['tag1', 'tag2'])
      })
      .returning()
      .execute();
    return expenses[0];
  };

  // Helper function to create test budget
  const createTestBudget = async (userId: number, category: string) => {
    const budgets = await db.insert(budgetsTable)
      .values({
        user_id: userId,
        category: category as any,
        monthly_limit: '500.00',
        current_spent: '100.00'
      })
      .returning()
      .execute();
    return budgets[0];
  };

  it('should update expense with all fields', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      title: 'Updated Expense',
      description: 'Updated description',
      amount: 150.50,
      category: 'TRANSPORTATION',
      receipt_url: 'https://example.com/receipt.jpg',
      expense_date: new Date('2024-02-01'),
      is_recurring: true,
      recurring_frequency: 'monthly',
      tags: ['updated', 'tags']
    };

    const result = await updateExpense(updateInput);

    expect(result.id).toEqual(expense.id);
    expect(result.title).toEqual('Updated Expense');
    expect(result.description).toEqual('Updated description');
    expect(result.amount).toEqual(150.50);
    expect(typeof result.amount).toBe('number');
    expect(result.category).toEqual('TRANSPORTATION');
    expect(result.receipt_url).toEqual('https://example.com/receipt.jpg');
    expect(result.expense_date).toEqual(new Date('2024-02-01'));
    expect(result.is_recurring).toEqual(true);
    expect(result.recurring_frequency).toEqual('monthly');
    expect(result.tags).toEqual(JSON.stringify(['updated', 'tags']));
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update expense with partial fields', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      title: 'Partially Updated',
      amount: 75.25
    };

    const result = await updateExpense(updateInput);

    expect(result.title).toEqual('Partially Updated');
    expect(result.amount).toEqual(75.25);
    expect(result.description).toEqual('Original description'); // Should remain unchanged
    expect(result.category).toEqual('FOOD_DINING'); // Should remain unchanged
  });

  it('should save updated expense to database', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      title: 'Database Updated',
      amount: 200.00
    };

    await updateExpense(updateInput);

    const savedExpenses = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expense.id))
      .execute();

    expect(savedExpenses).toHaveLength(1);
    const savedExpense = savedExpenses[0];
    expect(savedExpense.title).toEqual('Database Updated');
    expect(parseFloat(savedExpense.amount)).toEqual(200.00);
    expect(savedExpense.updated_at).toBeInstanceOf(Date);
    expect(savedExpense.updated_at.getTime()).toBeGreaterThan(expense.updated_at.getTime());
  });

  it('should update budget when amount changes', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);
    const budget = await createTestBudget(user.id, 'FOOD_DINING');

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      amount: 150.00 // Increase by 50
    };

    await updateExpense(updateInput);

    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, user.id),
        eq(budgetsTable.category, 'FOOD_DINING')
      ))
      .execute();

    expect(updatedBudgets).toHaveLength(1);
    expect(parseFloat(updatedBudgets[0].current_spent)).toEqual(150.00); // Original 100 + 50 difference
  });

  it('should update budgets when category changes', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);
    
    // Create budgets for both categories
    await createTestBudget(user.id, 'FOOD_DINING');
    await db.insert(budgetsTable)
      .values({
        user_id: user.id,
        category: 'TRANSPORTATION',
        monthly_limit: '300.00',
        current_spent: '50.00'
      })
      .execute();

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      category: 'TRANSPORTATION'
    };

    await updateExpense(updateInput);

    // Check old category budget (should decrease by 100)
    const oldCategoryBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, user.id),
        eq(budgetsTable.category, 'FOOD_DINING')
      ))
      .execute();
    expect(parseFloat(oldCategoryBudgets[0].current_spent)).toEqual(0.00); // 100 - 100

    // Check new category budget (should increase by 100)
    const newCategoryBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, user.id),
        eq(budgetsTable.category, 'TRANSPORTATION')
      ))
      .execute();
    expect(parseFloat(newCategoryBudgets[0].current_spent)).toEqual(150.00); // 50 + 100
  });

  it('should update budgets when both amount and category change', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);
    
    // Create budgets for both categories
    await createTestBudget(user.id, 'FOOD_DINING');
    await db.insert(budgetsTable)
      .values({
        user_id: user.id,
        category: 'ENTERTAINMENT',
        monthly_limit: '400.00',
        current_spent: '25.00'
      })
      .execute();

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      amount: 75.00,
      category: 'ENTERTAINMENT'
    };

    await updateExpense(updateInput);

    // Check old category budget (should decrease by original amount: 100)
    const oldCategoryBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, user.id),
        eq(budgetsTable.category, 'FOOD_DINING')
      ))
      .execute();
    expect(parseFloat(oldCategoryBudgets[0].current_spent)).toEqual(0.00); // 100 - 100

    // Check new category budget (should increase by new amount: 75)
    const newCategoryBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, user.id),
        eq(budgetsTable.category, 'ENTERTAINMENT')
      ))
      .execute();
    expect(parseFloat(newCategoryBudgets[0].current_spent)).toEqual(100.00); // 25 + 75
  });

  it('should handle nullable fields correctly', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      description: null,
      receipt_url: null,
      recurring_frequency: null
    };

    const result = await updateExpense(updateInput);

    expect(result.description).toBeNull();
    expect(result.receipt_url).toBeNull();
    expect(result.recurring_frequency).toBeNull();
  });

  it('should handle empty tags array', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      tags: []
    };

    const result = await updateExpense(updateInput);

    expect(result.tags).toEqual('[]');
  });

  it('should throw error when expense does not exist', async () => {
    const updateInput: UpdateExpenseInput = {
      id: 99999,
      title: 'Non-existent expense'
    };

    expect(updateExpense(updateInput)).rejects.toThrow(/not found/i);
  });

  it('should not update budget if no amount or category changes', async () => {
    const user = await createTestUser();
    const expense = await createTestExpense(user.id);
    const budget = await createTestBudget(user.id, 'FOOD_DINING');
    const originalSpent = parseFloat(budget.current_spent);

    const updateInput: UpdateExpenseInput = {
      id: expense.id,
      title: 'Just title change',
      description: 'Just description change'
    };

    await updateExpense(updateInput);

    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, user.id),
        eq(budgetsTable.category, 'FOOD_DINING')
      ))
      .execute();

    expect(parseFloat(updatedBudgets[0].current_spent)).toEqual(originalSpent);
  });
});