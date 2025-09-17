import { db } from '../db';
import { reportsTable, expensesTable, usersTable, teamsTable, teamMembersTable } from '../db/schema';
import { type GenerateReportInput, type Report } from '../schema';
import { and, eq, gte, lte, inArray, or, SQL } from 'drizzle-orm';

export const generateReport = async (input: GenerateReportInput): Promise<Report> => {
  try {
    // Validate date range
    if (input.date_from > input.date_to) {
      throw new Error('Invalid date range: date_from must be before or equal to date_to');
    }

    // Verify user exists
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (users.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    // Build base query based on whether we need team data
    let expenseQuery;
    const conditions: SQL<unknown>[] = [];

    // Always filter by date range
    conditions.push(gte(expensesTable.expense_date, input.date_from));
    conditions.push(lte(expensesTable.expense_date, input.date_to));

    // Filter by categories if provided
    if (input.categories && input.categories.length > 0) {
      conditions.push(inArray(expensesTable.category, input.categories));
    }

    if (input.include_team_expenses) {
      // Query with joins to include team expenses
      expenseQuery = db.select()
        .from(expensesTable)
        .leftJoin(teamsTable, eq(expensesTable.team_id, teamsTable.id))
        .leftJoin(teamMembersTable, eq(teamsTable.id, teamMembersTable.team_id));

      // Include user's own expenses OR expenses from teams they're a member of
      const teamCondition = or(
        eq(expensesTable.user_id, input.user_id),
        eq(teamMembersTable.user_id, input.user_id)
      );
      if (teamCondition) {
        conditions.push(teamCondition);
      }
    } else {
      // Simple query for user's own expenses only
      expenseQuery = db.select().from(expensesTable);
      conditions.push(eq(expensesTable.user_id, input.user_id));
    }

    // Apply all conditions
    const finalQuery = expenseQuery.where(and(...conditions));
    const expenseResults = await finalQuery.execute();

    // Process results - handle different result structures
    let expenses;
    if (input.include_team_expenses) {
      // Results have joined structure
      expenses = expenseResults.map(result => ({
        ...(result as any).expenses,
        amount: parseFloat((result as any).expenses.amount)
      }));
    } else {
      // Results are direct expense records
      expenses = expenseResults.map(result => ({
        ...(result as any),
        amount: parseFloat((result as any).amount)
      }));
    }

    // Aggregate data for report
    const totalExpenses = expenses.length;
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    const categoryBreakdown = expenses.reduce((acc, expense) => {
      const category = expense.category;
      if (!acc[category]) {
        acc[category] = { count: 0, amount: 0 };
      }
      acc[category].count++;
      acc[category].amount += expense.amount;
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    // Create filter metadata for storage
    const filterMetadata = {
      date_from: input.date_from.toISOString(),
      date_to: input.date_to.toISOString(),
      categories: input.categories || [],
      include_team_expenses: input.include_team_expenses || false,
      total_expenses: totalExpenses,
      total_amount: totalAmount,
      category_breakdown: categoryBreakdown
    };

    // Set expiration date based on report type
    let expiresAt: Date;
    switch (input.type) {
      case 'MONTHLY':
        expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
        break;
      case 'YEARLY':
        expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
        break;
      case 'CUSTOM':
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        break;
      default:
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // Generate file URL (placeholder for actual file generation)
    const fileUrl = `/reports/${input.user_id}_${Date.now()}_${input.type.toLowerCase()}.pdf`;

    // Insert report record
    const result = await db.insert(reportsTable)
      .values({
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        filters: JSON.stringify(filterMetadata),
        file_url: fileUrl,
        expires_at: expiresAt
      })
      .returning()
      .execute();

    const report = result[0];
    
    return {
      ...report,
      generated_at: report.generated_at,
      expires_at: report.expires_at
    };
  } catch (error) {
    console.error('Report generation failed:', error);
    throw error;
  }
};