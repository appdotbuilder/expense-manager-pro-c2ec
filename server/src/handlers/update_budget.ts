import { db } from '../db';
import { budgetsTable } from '../db/schema';
import { type UpdateBudgetInput, type Budget } from '../schema';
import { eq } from 'drizzle-orm';

export const updateBudget = async (input: UpdateBudgetInput): Promise<Budget> => {
  try {
    // First, verify the budget exists
    const existingBudgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, input.id))
      .execute();

    if (existingBudgets.length === 0) {
      throw new Error('Budget not found');
    }

    const existingBudget = existingBudgets[0];

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.monthly_limit !== undefined) {
      updateData.monthly_limit = input.monthly_limit.toString();
    }

    if (input.alert_threshold !== undefined) {
      updateData.alert_threshold = input.alert_threshold;
    }

    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    // Update the budget
    const result = await db.update(budgetsTable)
      .set(updateData)
      .where(eq(budgetsTable.id, input.id))
      .returning()
      .execute();

    const updatedBudget = result[0];

    // Convert numeric fields back to numbers
    return {
      ...updatedBudget,
      monthly_limit: parseFloat(updatedBudget.monthly_limit),
      current_spent: parseFloat(updatedBudget.current_spent)
    };
  } catch (error) {
    console.error('Budget update failed:', error);
    throw error;
  }
};