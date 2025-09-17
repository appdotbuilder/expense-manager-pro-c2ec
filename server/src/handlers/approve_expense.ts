import { db } from '../db';
import { expensesTable, usersTable, budgetsTable } from '../db/schema';
import { type ApproveExpenseInput, type Expense } from '../schema';
import { eq, and } from 'drizzle-orm';

export const approveExpense = async (input: ApproveExpenseInput): Promise<Expense> => {
  try {
    // First, verify the approver exists and has proper permissions (ADMIN or MANAGER)
    const approver = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.approved_by))
      .execute();

    if (approver.length === 0) {
      throw new Error('Approver not found');
    }

    if (!['ADMIN', 'MANAGER'].includes(approver[0].role)) {
      throw new Error('Insufficient permissions to approve expenses');
    }

    // Get the expense to verify it exists and is in pending status
    const existingExpense = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, input.expense_id))
      .execute();

    if (existingExpense.length === 0) {
      throw new Error('Expense not found');
    }

    if (existingExpense[0].status !== 'PENDING') {
      throw new Error('Expense is not in pending status');
    }

    // Update the expense with approval status
    const updatedExpense = await db.update(expensesTable)
      .set({
        status: input.status,
        approved_by: input.approved_by,
        approved_at: input.status === 'APPROVED' ? new Date() : null,
        updated_at: new Date()
      })
      .where(eq(expensesTable.id, input.expense_id))
      .returning()
      .execute();

    // If approved, update budget tracking
    if (input.status === 'APPROVED') {
      const expense = updatedExpense[0];
      const expenseAmount = parseFloat(expense.amount);

      // Update the user's budget for this category
      // First get the current budget to calculate new spent amount
      const currentBudget = await db.select()
        .from(budgetsTable)
        .where(and(
          eq(budgetsTable.user_id, expense.user_id),
          eq(budgetsTable.category, expense.category),
          eq(budgetsTable.is_active, true)
        ))
        .execute();

      if (currentBudget.length > 0) {
        const newSpentAmount = parseFloat(currentBudget[0].current_spent) + expenseAmount;
        
        await db.update(budgetsTable)
          .set({
            current_spent: newSpentAmount.toString(),
            updated_at: new Date()
          })
          .where(eq(budgetsTable.id, currentBudget[0].id))
          .execute();
      }
    }

    // Convert numeric fields back to numbers before returning
    const result = updatedExpense[0];
    return {
      ...result,
      amount: parseFloat(result.amount)
    };
  } catch (error) {
    console.error('Expense approval failed:', error);
    throw error;
  }
};