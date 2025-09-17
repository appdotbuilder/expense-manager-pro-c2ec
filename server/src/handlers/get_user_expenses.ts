import { db } from '../db';
import { expensesTable } from '../db/schema';
import { type GetUserExpensesInput, type PaginatedExpenses } from '../schema';
import { eq, and, gte, lte, ilike, count, desc, SQL } from 'drizzle-orm';

export async function getUserExpenses(input: GetUserExpensesInput): Promise<PaginatedExpenses> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [
      eq(expensesTable.user_id, input.user_id)
    ];

    // Add optional filters
    if (input.category) {
      conditions.push(eq(expensesTable.category, input.category));
    }

    if (input.status) {
      conditions.push(eq(expensesTable.status, input.status));
    }

    if (input.date_from) {
      conditions.push(gte(expensesTable.expense_date, input.date_from));
    }

    if (input.date_to) {
      conditions.push(lte(expensesTable.expense_date, input.date_to));
    }

    if (input.search) {
      conditions.push(
        ilike(expensesTable.title, `%${input.search}%`)
      );
    }

    // Apply where condition
    const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions);

    // Apply pagination
    const offset = (input.page - 1) * input.limit;

    // Execute main query with all conditions applied at once
    const expenses = await db.select()
      .from(expensesTable)
      .where(whereCondition)
      .orderBy(desc(expensesTable.expense_date))
      .limit(input.limit)
      .offset(offset)
      .execute();

    // Execute count query
    const totalResult = await db.select({ count: count() })
      .from(expensesTable)
      .where(whereCondition)
      .execute();

    const total = totalResult[0].count;
    const total_pages = Math.ceil(total / input.limit);

    // Convert numeric fields back to numbers
    const formattedExpenses = expenses.map(expense => ({
      ...expense,
      amount: parseFloat(expense.amount)
    }));

    return {
      expenses: formattedExpenses,
      total,
      page: input.page,
      limit: input.limit,
      total_pages
    };
  } catch (error) {
    console.error('Failed to get user expenses:', error);
    throw error;
  }
}