import { db } from '../db';
import { expensesTable, budgetsTable } from '../db/schema';
import { type GetDashboardDataInput, type DashboardStats } from '../schema';
import { eq, sql, and, gte, lte, desc } from 'drizzle-orm';

export async function getDashboardData(input: GetDashboardDataInput): Promise<DashboardStats> {
  try {
    const { user_id, month, year } = input;
    
    // Default to current month/year if not provided
    const currentDate = new Date();
    const targetMonth = month || (currentDate.getMonth() + 1);
    const targetYear = year || currentDate.getFullYear();
    
    // Calculate date ranges
    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    // 1. Get total expenses count for user
    const totalExpensesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(expensesTable)
      .where(eq(expensesTable.user_id, user_id))
      .execute();

    const total_expenses = Number(totalExpensesResult[0]?.count || 0);

    // 2. Get monthly spending
    const monthlySpendingResult = await db
      .select({ total: sql<string>`coalesce(sum(${expensesTable.amount}), 0)` })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.user_id, user_id),
          gte(expensesTable.expense_date, monthStart),
          lte(expensesTable.expense_date, monthEnd)
        )
      )
      .execute();

    const monthly_spending = parseFloat(monthlySpendingResult[0]?.total || '0');

    // 3. Get user's budgets and calculate utilization
    const budgetsResult = await db
      .select()
      .from(budgetsTable)
      .where(
        and(
          eq(budgetsTable.user_id, user_id),
          eq(budgetsTable.is_active, true)
        )
      )
      .execute();

    const budgets = budgetsResult.map(budget => ({
      ...budget,
      monthly_limit: parseFloat(budget.monthly_limit),
      current_spent: parseFloat(budget.current_spent)
    }));

    const totalBudgetLimit = budgets.reduce((sum, budget) => sum + budget.monthly_limit, 0);
    const budget_utilization = totalBudgetLimit > 0 ? (monthly_spending / totalBudgetLimit) * 100 : 0;

    // 4. Get category breakdown for the month
    const categoryBreakdownResult = await db
      .select({
        category: expensesTable.category,
        amount: sql<string>`coalesce(sum(${expensesTable.amount}), 0)`,
        count: sql<number>`count(*)`
      })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.user_id, user_id),
          gte(expensesTable.expense_date, monthStart),
          lte(expensesTable.expense_date, monthEnd)
        )
      )
      .groupBy(expensesTable.category)
      .execute();

    const category_breakdown = categoryBreakdownResult.map(item => ({
      category: item.category,
      amount: parseFloat(item.amount),
      count: Number(item.count)
    }));

    // 5. Get spending trends for the last 12 months
    const trendsResult = await db
      .select({
        month: sql<string>`to_char(${expensesTable.expense_date}, 'YYYY-MM')`,
        amount: sql<string>`coalesce(sum(${expensesTable.amount}), 0)`
      })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.user_id, user_id),
          gte(expensesTable.expense_date, new Date(targetYear - 1, targetMonth - 1, 1)),
          lte(expensesTable.expense_date, monthEnd)
        )
      )
      .groupBy(sql`to_char(${expensesTable.expense_date}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${expensesTable.expense_date}, 'YYYY-MM')`)
      .execute();

    const spending_trends = trendsResult.map(item => ({
      date: item.month,
      amount: parseFloat(item.amount)
    }));

    // 6. Get recent expenses (last 5)
    const recentExpensesResult = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.user_id, user_id))
      .orderBy(desc(expensesTable.created_at))
      .limit(5)
      .execute();

    const recent_expenses = recentExpensesResult.map(expense => ({
      ...expense,
      amount: parseFloat(expense.amount)
    }));

    // 7. Generate budget alerts
    const budget_alerts = budgets
      .map(budget => {
        const categorySpendingResult = categoryBreakdownResult.find(
          item => item.category === budget.category
        );
        const currentSpending = categorySpendingResult ? parseFloat(categorySpendingResult.amount) : 0;
        const percentage = budget.monthly_limit > 0 ? (currentSpending / budget.monthly_limit) * 100 : 0;
        
        return {
          category: budget.category,
          current: currentSpending,
          limit: budget.monthly_limit,
          percentage
        };
      })
      .filter(alert => alert.percentage >= 80); // Only show alerts for budgets over 80% utilization

    return {
      total_expenses,
      monthly_spending,
      budget_utilization: Math.round(budget_utilization * 100) / 100, // Round to 2 decimal places
      category_breakdown,
      spending_trends,
      recent_expenses,
      budget_alerts
    };
  } catch (error) {
    console.error('Dashboard data retrieval failed:', error);
    throw error;
  }
}