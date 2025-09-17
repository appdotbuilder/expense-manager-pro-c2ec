import { db } from '../db';
import { expensesTable, teamsTable, teamMembersTable, usersTable } from '../db/schema';
import { type Expense } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

export const getPendingApprovals = async (managerId: number): Promise<Expense[]> => {
  try {
    // Verify manager exists and has appropriate role
    const manager = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, managerId))
      .execute();

    if (manager.length === 0) {
      throw new Error('Manager not found');
    }

    if (manager[0].role !== 'MANAGER' && manager[0].role !== 'ADMIN') {
      throw new Error('User is not authorized to approve expenses');
    }

    // Get pending expenses from teams managed by this manager
    const results = await db.select()
      .from(expensesTable)
      .innerJoin(teamsTable, eq(expensesTable.team_id, teamsTable.id))
      .where(
        and(
          eq(expensesTable.status, 'PENDING'),
          eq(teamsTable.manager_id, managerId)
        )
      )
      .orderBy(desc(expensesTable.expense_date))
      .execute();

    // Transform joined results back to Expense objects with proper numeric conversion
    return results.map(result => ({
      ...result.expenses,
      amount: parseFloat(result.expenses.amount)
    }));
  } catch (error) {
    console.error('Failed to get pending approvals:', error);
    throw error;
  }
};