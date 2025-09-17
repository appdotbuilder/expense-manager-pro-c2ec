import { db } from '../db';
import { expensesTable, budgetsTable } from '../db/schema';
import { type UpdateExpenseInput, type Expense } from '../schema';
import { eq, and, sql } from 'drizzle-orm';

export const updateExpense = async (input: UpdateExpenseInput): Promise<Expense> => {
  try {
    // First, get the existing expense to validate it exists and get current values
    const existingExpenses = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.id, input.id))
      .execute();

    if (existingExpenses.length === 0) {
      throw new Error(`Expense with id ${input.id} not found`);
    }

    const existingExpense = existingExpenses[0];
    const oldAmount = parseFloat(existingExpense.amount);
    const oldCategory = existingExpense.category;

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.amount !== undefined) updateData.amount = input.amount.toString();
    if (input.category !== undefined) updateData.category = input.category;
    if (input.receipt_url !== undefined) updateData.receipt_url = input.receipt_url;
    if (input.expense_date !== undefined) updateData.expense_date = input.expense_date;
    if (input.is_recurring !== undefined) updateData.is_recurring = input.is_recurring;
    if (input.recurring_frequency !== undefined) updateData.recurring_frequency = input.recurring_frequency;
    if (input.tags !== undefined) updateData.tags = JSON.stringify(input.tags);

    // Update the expense
    const updatedExpenses = await db.update(expensesTable)
      .set(updateData)
      .where(eq(expensesTable.id, input.id))
      .returning()
      .execute();

    const updatedExpense = updatedExpenses[0];
    const newAmount = parseFloat(updatedExpense.amount);
    const newCategory = updatedExpense.category;

    // Update budget impacts if amount or category changed
    if (input.amount !== undefined || input.category !== undefined) {
      // If category changed, we need to update both old and new category budgets
      if (input.category !== undefined && oldCategory !== newCategory) {
        // Decrease old category budget
        await db.update(budgetsTable)
          .set({
            current_spent: sql`current_spent - ${oldAmount}::numeric`,
            updated_at: new Date()
          })
          .where(and(
            eq(budgetsTable.user_id, updatedExpense.user_id),
            eq(budgetsTable.category, oldCategory)
          ))
          .execute();

        // Increase new category budget
        await db.update(budgetsTable)
          .set({
            current_spent: sql`current_spent + ${newAmount}::numeric`,
            updated_at: new Date()
          })
          .where(and(
            eq(budgetsTable.user_id, updatedExpense.user_id),
            eq(budgetsTable.category, newCategory)
          ))
          .execute();
      } else if (input.amount !== undefined) {
        // Only amount changed, update the difference
        const amountDifference = newAmount - oldAmount;
        await db.update(budgetsTable)
          .set({
            current_spent: sql`current_spent + ${amountDifference}::numeric`,
            updated_at: new Date()
          })
          .where(and(
            eq(budgetsTable.user_id, updatedExpense.user_id),
            eq(budgetsTable.category, newCategory)
          ))
          .execute();
      }
    }

    // Convert numeric fields back to numbers before returning
    return {
      ...updatedExpense,
      amount: parseFloat(updatedExpense.amount)
    };
  } catch (error) {
    console.error('Expense update failed:', error);
    throw error;
  }
};