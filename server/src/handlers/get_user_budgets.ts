import { db } from '../db';
import { budgetsTable, expensesTable } from '../db/schema';
import { type Budget } from '../schema';
import { eq, and, gte, lt, sum } from 'drizzle-orm';

export async function getUserBudgets(userId: number): Promise<Budget[]> {
  try {
    // Get current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Fetch all budgets for the user
    const budgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.user_id, userId))
      .execute();

    // For each budget, calculate current spent amount for this month
    const budgetsWithSpending = await Promise.all(
      budgets.map(async (budget) => {
        // Get total spending for this category this month
        const spendingResult = await db.select({
          totalSpent: sum(expensesTable.amount)
        })
          .from(expensesTable)
          .where(
            and(
              eq(expensesTable.user_id, userId),
              eq(expensesTable.category, budget.category),
              eq(expensesTable.status, 'APPROVED'),
              gte(expensesTable.expense_date, monthStart),
              lt(expensesTable.expense_date, nextMonth)
            )
          )
          .execute();

        const currentSpent = spendingResult[0]?.totalSpent ? parseFloat(spendingResult[0].totalSpent) : 0;

        // Update the budget's current_spent field
        await db.update(budgetsTable)
          .set({
            current_spent: currentSpent.toString(),
            updated_at: new Date()
          })
          .where(eq(budgetsTable.id, budget.id))
          .execute();

        // Return budget with proper numeric conversions
        return {
          ...budget,
          monthly_limit: parseFloat(budget.monthly_limit),
          current_spent: currentSpent,
          updated_at: new Date()
        };
      })
    );

    return budgetsWithSpending;
  } catch (error) {
    console.error('Failed to get user budgets:', error);
    throw error;
  }
}