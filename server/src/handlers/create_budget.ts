import { db } from '../db';
import { budgetsTable, usersTable, expensesTable } from '../db/schema';
import { type CreateBudgetInput, type Budget } from '../schema';
import { eq, and, gte, lt, sum } from 'drizzle-orm';

export const createBudget = async (input: CreateBudgetInput): Promise<Budget> => {
  try {
    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Check for existing budget for this user and category
    const existingBudget = await db.select()
      .from(budgetsTable)
      .where(and(
        eq(budgetsTable.user_id, input.user_id),
        eq(budgetsTable.category, input.category)
      ))
      .execute();

    if (existingBudget.length > 0) {
      throw new Error('Budget already exists for this category');
    }

    // Calculate current spent amount for this month in the category
    const currentDate = new Date();
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const currentSpentResult = await db.select({
      total: sum(expensesTable.amount)
    })
      .from(expensesTable)
      .where(and(
        eq(expensesTable.user_id, input.user_id),
        eq(expensesTable.category, input.category),
        gte(expensesTable.expense_date, monthStart),
        lt(expensesTable.expense_date, monthEnd)
      ))
      .execute();

    const currentSpent = currentSpentResult[0]?.total ? parseFloat(currentSpentResult[0].total) : 0;

    // Insert new budget record
    const result = await db.insert(budgetsTable)
      .values({
        user_id: input.user_id,
        category: input.category,
        monthly_limit: input.monthly_limit.toString(),
        current_spent: currentSpent.toString(),
        alert_threshold: input.alert_threshold
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers
    const budget = result[0];
    return {
      ...budget,
      monthly_limit: parseFloat(budget.monthly_limit),
      current_spent: parseFloat(budget.current_spent)
    };
  } catch (error) {
    console.error('Budget creation failed:', error);
    throw error;
  }
};