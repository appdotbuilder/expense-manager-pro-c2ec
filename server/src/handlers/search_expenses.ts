import { db } from '../db';
import { expensesTable } from '../db/schema';
import { type Expense } from '../schema';
import { eq, and, gte, lte, ilike, or, sql, type SQL } from 'drizzle-orm';

export async function searchExpenses(
    userId: number, 
    searchTerm: string, 
    filters?: {
        category?: string;
        dateFrom?: Date;
        dateTo?: Date;
        minAmount?: number;
        maxAmount?: number;
    }
): Promise<Expense[]> {
    try {
        // Build conditions array
        const conditions: SQL<unknown>[] = [
            eq(expensesTable.user_id, userId)
        ];

        // Add search term condition (full-text search across title and description)
        if (searchTerm.trim()) {
            const searchPattern = `%${searchTerm.trim()}%`;
            conditions.push(
                or(
                    ilike(expensesTable.title, searchPattern),
                    ilike(expensesTable.description, searchPattern)
                )!
            );
        }

        // Apply additional filters
        if (filters?.category) {
            conditions.push(eq(expensesTable.category, filters.category as any));
        }

        if (filters?.dateFrom) {
            conditions.push(gte(expensesTable.expense_date, filters.dateFrom));
        }

        if (filters?.dateTo) {
            conditions.push(lte(expensesTable.expense_date, filters.dateTo));
        }

        if (filters?.minAmount !== undefined) {
            conditions.push(gte(expensesTable.amount, filters.minAmount.toString()));
        }

        if (filters?.maxAmount !== undefined) {
            conditions.push(lte(expensesTable.amount, filters.maxAmount.toString()));
        }

        // Build and execute the query
        const results = await db.select()
            .from(expensesTable)
            .where(and(...conditions))
            .orderBy(sql`${expensesTable.expense_date} DESC, ${expensesTable.created_at} DESC`)
            .execute();

        // Convert numeric fields back to numbers before returning
        return results.map(expense => ({
            ...expense,
            amount: parseFloat(expense.amount)
        }));
    } catch (error) {
        console.error('Expense search failed:', error);
        throw error;
    }
}