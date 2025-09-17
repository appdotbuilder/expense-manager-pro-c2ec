import { db } from '../db';
import { expensesTable, teamsTable } from '../db/schema';
import { type Expense } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getTeamExpenses(teamId: number, managerId: number): Promise<Expense[]> {
  try {
    // First, validate that the manager has permission to access this team
    const team = await db.select()
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .execute();

    if (team.length === 0) {
      throw new Error('Team not found');
    }

    if (team[0].manager_id !== managerId) {
      throw new Error('Access denied: You are not the manager of this team');
    }

    // Query all expenses for the team
    const results = await db.select()
      .from(expensesTable)
      .where(eq(expensesTable.team_id, teamId))
      .execute();

    // Convert numeric fields back to numbers before returning
    return results.map(expense => ({
      ...expense,
      amount: parseFloat(expense.amount)
    }));
  } catch (error) {
    console.error('Get team expenses failed:', error);
    throw error;
  }
}