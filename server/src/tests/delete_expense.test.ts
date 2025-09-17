import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, expensesTable, budgetsTable } from '../db/schema';
import { deleteExpense } from '../handlers/delete_expense';
import { eq, and } from 'drizzle-orm';

describe('deleteExpense', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let otherUser: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'test@example.com',
          username: 'testuser',
          password_hash: 'hashed_password',
          first_name: 'Test',
          last_name: 'User',
          role: 'USER'
        },
        {
          email: 'other@example.com',
          username: 'otheruser',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    otherUser = users[1];
  });

  it('should successfully delete an expense belonging to the user', async () => {
    // Create test expense
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: testUser.id,
        title: 'Test Expense',
        description: 'A test expense',
        amount: '100.00',
        category: 'FOOD_DINING',
        status: 'PENDING',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expense = expenses[0];

    const result = await deleteExpense(expense.id, testUser.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Expense deleted successfully');

    // Verify expense was deleted from database
    const deletedExpenses = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expense.id))
      .execute();

    expect(deletedExpenses).toHaveLength(0);
  });

  it('should fail when expense does not exist', async () => {
    const nonExistentExpenseId = 99999;

    const result = await deleteExpense(nonExistentExpenseId, testUser.id);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Expense not found or you do not have permission to delete it');
  });

  it('should fail when user tries to delete expense belonging to another user', async () => {
    // Create expense for other user
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: otherUser.id,
        title: 'Other User Expense',
        description: 'An expense by another user',
        amount: '50.00',
        category: 'TRANSPORTATION',
        status: 'PENDING',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expense = expenses[0];

    const result = await deleteExpense(expense.id, testUser.id);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Expense not found or you do not have permission to delete it');

    // Verify expense still exists in database
    const existingExpenses = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expense.id))
      .execute();

    expect(existingExpenses).toHaveLength(1);
  });

  it('should update budget when deleting an approved expense', async () => {
    // Create budget first
    const budgets = await db.insert(budgetsTable)
      .values({
        user_id: testUser.id,
        category: 'FOOD_DINING',
        monthly_limit: '500.00',
        current_spent: '200.00',
        alert_threshold: 80,
        is_active: true
      })
      .returning()
      .execute();

    const budget = budgets[0];

    // Create approved expense
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: testUser.id,
        title: 'Approved Expense',
        description: 'An approved expense',
        amount: '75.00',
        category: 'FOOD_DINING',
        status: 'APPROVED',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expense = expenses[0];

    const result = await deleteExpense(expense.id, testUser.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Expense deleted successfully');

    // Verify budget was updated (current_spent reduced by expense amount)
    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, budget.id))
      .execute();

    const updatedBudget = updatedBudgets[0];
    expect(parseFloat(updatedBudget.current_spent)).toBe(125.00); // 200 - 75
    expect(typeof parseFloat(updatedBudget.current_spent)).toBe('number');
  });

  it('should not update budget when deleting a pending expense', async () => {
    // Create budget first
    const budgets = await db.insert(budgetsTable)
      .values({
        user_id: testUser.id,
        category: 'ENTERTAINMENT',
        monthly_limit: '300.00',
        current_spent: '150.00',
        alert_threshold: 80,
        is_active: true
      })
      .returning()
      .execute();

    const budget = budgets[0];

    // Create pending expense
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: testUser.id,
        title: 'Pending Expense',
        description: 'A pending expense',
        amount: '50.00',
        category: 'ENTERTAINMENT',
        status: 'PENDING',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expense = expenses[0];

    const result = await deleteExpense(expense.id, testUser.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Expense deleted successfully');

    // Verify budget was not updated (current_spent should remain the same)
    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, budget.id))
      .execute();

    const updatedBudget = updatedBudgets[0];
    expect(parseFloat(updatedBudget.current_spent)).toBe(150.00); // Should remain unchanged
  });

  it('should not update budget when deleting a rejected expense', async () => {
    // Create budget first
    const budgets = await db.insert(budgetsTable)
      .values({
        user_id: testUser.id,
        category: 'SHOPPING',
        monthly_limit: '400.00',
        current_spent: '100.00',
        alert_threshold: 75,
        is_active: true
      })
      .returning()
      .execute();

    const budget = budgets[0];

    // Create rejected expense
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: testUser.id,
        title: 'Rejected Expense',
        description: 'A rejected expense',
        amount: '80.00',
        category: 'SHOPPING',
        status: 'REJECTED',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expense = expenses[0];

    const result = await deleteExpense(expense.id, testUser.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Expense deleted successfully');

    // Verify budget was not updated
    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, budget.id))
      .execute();

    const updatedBudget = updatedBudgets[0];
    expect(parseFloat(updatedBudget.current_spent)).toBe(100.00); // Should remain unchanged
  });

  it('should work correctly when no budget exists for the category', async () => {
    // Create approved expense without corresponding budget
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: testUser.id,
        title: 'Expense Without Budget',
        description: 'An expense without budget',
        amount: '60.00',
        category: 'HEALTHCARE',
        status: 'APPROVED',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expense = expenses[0];

    const result = await deleteExpense(expense.id, testUser.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Expense deleted successfully');

    // Verify expense was deleted
    const deletedExpenses = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expense.id))
      .execute();

    expect(deletedExpenses).toHaveLength(0);
  });

  it('should handle budget current_spent not going below zero', async () => {
    // Create budget with low current_spent
    const budgets = await db.insert(budgetsTable)
      .values({
        user_id: testUser.id,
        category: 'TRAVEL',
        monthly_limit: '1000.00',
        current_spent: '25.00',
        alert_threshold: 90,
        is_active: true
      })
      .returning()
      .execute();

    const budget = budgets[0];

    // Create approved expense with higher amount than current_spent
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: testUser.id,
        title: 'Large Expense',
        description: 'An expense larger than current spent',
        amount: '50.00',
        category: 'TRAVEL',
        status: 'APPROVED',
        expense_date: new Date()
      })
      .returning()
      .execute();

    const expense = expenses[0];

    const result = await deleteExpense(expense.id, testUser.id);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Expense deleted successfully');

    // Verify budget current_spent is 0 (not negative)
    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, budget.id))
      .execute();

    const updatedBudget = updatedBudgets[0];
    expect(parseFloat(updatedBudget.current_spent)).toBe(0.00); // Should be 0, not negative
  });
});