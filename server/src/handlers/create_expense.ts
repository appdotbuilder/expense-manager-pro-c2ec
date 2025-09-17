import { db } from '../db';
import { expensesTable, usersTable, teamsTable, budgetsTable } from '../db/schema';
import { type CreateExpenseInput, type Expense } from '../schema';
import { eq, and, sql } from 'drizzle-orm';

export const createExpense = async (input: CreateExpenseInput): Promise<Expense> => {
  try {
    // Validate user exists
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (userExists.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    // Validate team exists if team_id is provided
    if (input.team_id) {
      const teamExists = await db.select({ id: teamsTable.id })
        .from(teamsTable)
        .where(eq(teamsTable.id, input.team_id))
        .execute();

      if (teamExists.length === 0) {
        throw new Error(`Team with id ${input.team_id} not found`);
      }
    }

    // Insert expense record
    const result = await db.insert(expensesTable)
      .values({
        user_id: input.user_id,
        team_id: input.team_id || null,
        title: input.title,
        description: input.description || null,
        amount: input.amount.toString(), // Convert number to string for numeric column
        category: input.category,
        receipt_url: input.receipt_url || null,
        status: 'PENDING',
        expense_date: input.expense_date,
        is_recurring: input.is_recurring || false,
        recurring_frequency: input.recurring_frequency || null,
        tags: input.tags ? JSON.stringify(input.tags) : null,
      })
      .returning()
      .execute();

    // Update budget current_spent if budget exists for this category
    if (result[0]) {
      await db.update(budgetsTable)
        .set({
          current_spent: sql`current_spent + ${input.amount.toString()}`,
          updated_at: new Date()
        })
        .where(
          and(
            eq(budgetsTable.user_id, input.user_id),
            eq(budgetsTable.category, input.category),
            eq(budgetsTable.is_active, true)
          )
        )
        .execute();
    }

    // Convert numeric fields back to numbers before returning
    const expense = result[0];
    return {
      ...expense,
      amount: parseFloat(expense.amount) // Convert string back to number
    };
  } catch (error) {
    console.error('Expense creation failed:', error);
    throw error;
  }
};