import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { expensesTable, usersTable, budgetsTable } from '../db/schema';
import { type ApproveExpenseInput } from '../schema';
import { approveExpense } from '../handlers/approve_expense';
import { eq, and } from 'drizzle-orm';

describe('approveExpense', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testManager: any;
  let testAdmin: any;
  let testExpense: any;
  let testBudget: any;

  beforeEach(async () => {
    // Create test users with different roles
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user@test.com',
          username: 'testuser',
          password_hash: 'hash',
          first_name: 'Test',
          last_name: 'User',
          role: 'USER'
        },
        {
          email: 'manager@test.com',
          username: 'testmanager',
          password_hash: 'hash',
          first_name: 'Test',
          last_name: 'Manager',
          role: 'MANAGER'
        },
        {
          email: 'admin@test.com',
          username: 'testadmin',
          password_hash: 'hash',
          first_name: 'Test',
          last_name: 'Admin',
          role: 'ADMIN'
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    testManager = users[1];
    testAdmin = users[2];

    // Create a test expense
    const expenses = await db.insert(expensesTable)
      .values({
        user_id: testUser.id,
        title: 'Test Expense',
        description: 'A test expense for approval',
        amount: '50.00',
        category: 'FOOD_DINING',
        status: 'PENDING',
        expense_date: new Date()
      })
      .returning()
      .execute();

    testExpense = expenses[0];

    // Create a test budget for the user
    const budgets = await db.insert(budgetsTable)
      .values({
        user_id: testUser.id,
        category: 'FOOD_DINING',
        monthly_limit: '200.00',
        current_spent: '25.00',
        alert_threshold: 80,
        is_active: true
      })
      .returning()
      .execute();

    testBudget = budgets[0];
  });

  it('should approve an expense by manager', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testManager.id,
      status: 'APPROVED'
    };

    const result = await approveExpense(input);

    expect(result.id).toEqual(testExpense.id);
    expect(result.status).toEqual('APPROVED');
    expect(result.approved_by).toEqual(testManager.id);
    expect(result.approved_at).toBeInstanceOf(Date);
    expect(typeof result.amount).toBe('number');
    expect(result.amount).toEqual(50);
  });

  it('should approve an expense by admin', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testAdmin.id,
      status: 'APPROVED'
    };

    const result = await approveExpense(input);

    expect(result.status).toEqual('APPROVED');
    expect(result.approved_by).toEqual(testAdmin.id);
    expect(result.approved_at).toBeInstanceOf(Date);
  });

  it('should reject an expense', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testManager.id,
      status: 'REJECTED'
    };

    const result = await approveExpense(input);

    expect(result.status).toEqual('REJECTED');
    expect(result.approved_by).toEqual(testManager.id);
    expect(result.approved_at).toBeNull();
  });

  it('should update budget when expense is approved', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testManager.id,
      status: 'APPROVED'
    };

    await approveExpense(input);

    // Check that budget was updated
    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, testUser.id),
        eq(budgetsTable.category, 'FOOD_DINING')
      ))
      .execute();

    expect(updatedBudgets).toHaveLength(1);
    const updatedBudget = updatedBudgets[0];
    expect(parseFloat(updatedBudget.current_spent)).toEqual(75); // 25 + 50
  });

  it('should not update budget when expense is rejected', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testManager.id,
      status: 'REJECTED'
    };

    await approveExpense(input);

    // Check that budget was not updated
    const updatedBudgets = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, testUser.id),
        eq(budgetsTable.category, 'FOOD_DINING')
      ))
      .execute();

    expect(updatedBudgets).toHaveLength(1);
    const updatedBudget = updatedBudgets[0];
    expect(parseFloat(updatedBudget.current_spent)).toEqual(25); // No change
  });

  it('should throw error when approver does not exist', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: 99999, // Non-existent user ID
      status: 'APPROVED'
    };

    await expect(approveExpense(input)).rejects.toThrow(/approver not found/i);
  });

  it('should throw error when approver has insufficient permissions', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testUser.id, // Regular user trying to approve
      status: 'APPROVED'
    };

    await expect(approveExpense(input)).rejects.toThrow(/insufficient permissions/i);
  });

  it('should throw error when expense does not exist', async () => {
    const input: ApproveExpenseInput = {
      expense_id: 99999, // Non-existent expense ID
      approved_by: testManager.id,
      status: 'APPROVED'
    };

    await expect(approveExpense(input)).rejects.toThrow(/expense not found/i);
  });

  it('should throw error when expense is not in pending status', async () => {
    // First approve the expense
    await db.update(expensesTable)
      .set({ status: 'APPROVED' })
      .where(eq(expensesTable.id, testExpense.id))
      .execute();

    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testManager.id,
      status: 'APPROVED'
    };

    await expect(approveExpense(input)).rejects.toThrow(/not in pending status/i);
  });

  it('should save approval to database', async () => {
    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testManager.id,
      status: 'APPROVED'
    };

    await approveExpense(input);

    // Verify the expense was updated in the database
    const updatedExpenses = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, testExpense.id))
      .execute();

    expect(updatedExpenses).toHaveLength(1);
    const updatedExpense = updatedExpenses[0];
    expect(updatedExpense.status).toEqual('APPROVED');
    expect(updatedExpense.approved_by).toEqual(testManager.id);
    expect(updatedExpense.approved_at).toBeInstanceOf(Date);
    expect(updatedExpense.updated_at).toBeInstanceOf(Date);
  });

  it('should handle expenses without existing budget', async () => {
    // Delete the budget
    await db.delete(budgetsTable)
      .where(eq(budgetsTable.id, testBudget.id))
      .execute();

    const input: ApproveExpenseInput = {
      expense_id: testExpense.id,
      approved_by: testManager.id,
      status: 'APPROVED'
    };

    // Should still work even without a budget
    const result = await approveExpense(input);
    expect(result.status).toEqual('APPROVED');
  });
});