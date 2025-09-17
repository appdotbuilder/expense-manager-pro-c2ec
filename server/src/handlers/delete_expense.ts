import { db } from '../db';
import { expensesTable, budgetsTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function deleteExpense(expenseId: number, userId: number): Promise<{ success: boolean; message: string }> {
  try {
    // First, verify the expense exists and belongs to the user
    const expense = await db.select()
      .from(expensesTable)
      .where(and(
        eq(expensesTable.id, expenseId),
        eq(expensesTable.user_id, userId)
      ))
      .limit(1)
      .execute();

    if (expense.length === 0) {
      return {
        success: false,
        message: 'Expense not found or you do not have permission to delete it'
      };
    }

    const expenseToDelete = expense[0];
    const expenseAmount = parseFloat(expenseToDelete.amount);

    // Delete the expense
    const deleteResult = await db.delete(expensesTable)
      .where(and(
        eq(expensesTable.id, expenseId),
        eq(expensesTable.user_id, userId)
      ))
      .execute();

    if (deleteResult.rowCount === 0) {
      return {
        success: false,
        message: 'Failed to delete expense'
      };
    }

    // Update budget calculations - subtract the deleted expense amount from current_spent
    // Only update if the expense was approved (contributed to budget spending)
    if (expenseToDelete.status === 'APPROVED') {
      const budget = await db.select()
        .from(budgetsTable)
        .where(and(
          eq(budgetsTable.user_id, userId),
          eq(budgetsTable.category, expenseToDelete.category),
          eq(budgetsTable.is_active, true)
        ))
        .limit(1)
        .execute();

      if (budget.length > 0) {
        const currentBudget = budget[0];
        const newCurrentSpent = Math.max(0, parseFloat(currentBudget.current_spent) - expenseAmount);

        await db.update(budgetsTable)
          .set({
            current_spent: newCurrentSpent.toString(),
            updated_at: new Date()
          })
          .where(eq(budgetsTable.id, currentBudget.id))
          .execute();
      }
    }

    return {
      success: true,
      message: 'Expense deleted successfully'
    };
  } catch (error) {
    console.error('Expense deletion failed:', error);
    throw error;
  }
}