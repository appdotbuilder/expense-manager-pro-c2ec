import { db } from '../db';
import { expensesTable, budgetsTable } from '../db/schema';
import { and, eq, gte, lte, desc, sql, type SQL } from 'drizzle-orm';

export async function getExpenseAnalytics(
    userId: number,
    period: 'month' | 'year' | 'custom',
    startDate?: Date,
    endDate?: Date
): Promise<{
    spending_by_category: Array<{ category: string; amount: number; percentage: number }>;
    spending_trends: Array<{ date: string; amount: number }>;
    budget_performance: Array<{ category: string; budgeted: number; spent: number; remaining: number }>;
    top_expenses: Array<{ title: string; amount: number; date: Date; category: string }>;
    predictions: {
        next_month_spending: number;
        budget_alerts: Array<{ category: string; projected_overspend: number }>;
    };
}> {
    try {
        // Calculate date range based on period
        const { dateFrom, dateTo } = calculateDateRange(period, startDate, endDate);

        // Build expense query conditions
        const conditions: SQL<unknown>[] = [
            eq(expensesTable.user_id, userId),
            gte(expensesTable.expense_date, dateFrom),
            lte(expensesTable.expense_date, dateTo)
        ];

        // Get expenses for the period
        const expenses = await db.select()
            .from(expensesTable)
            .where(and(...conditions))
            .orderBy(desc(expensesTable.expense_date))
            .execute();

        // Convert numeric fields
        const processedExpenses = expenses.map(expense => ({
            ...expense,
            amount: parseFloat(expense.amount)
        }));

        // Get user's budgets
        const budgets = await db.select()
            .from(budgetsTable)
            .where(and(
                eq(budgetsTable.user_id, userId),
                eq(budgetsTable.is_active, true)
            ))
            .execute();

        const processedBudgets = budgets.map(budget => ({
            ...budget,
            monthly_limit: parseFloat(budget.monthly_limit),
            current_spent: parseFloat(budget.current_spent)
        }));

        // Calculate analytics
        const spendingByCategory = calculateSpendingByCategory(processedExpenses);
        const spendingTrends = calculateSpendingTrends(processedExpenses, period);
        const budgetPerformance = calculateBudgetPerformance(processedExpenses, processedBudgets, period);
        const topExpenses = getTopExpenses(processedExpenses);
        const predictions = calculatePredictions(processedExpenses, processedBudgets);

        return {
            spending_by_category: spendingByCategory,
            spending_trends: spendingTrends,
            budget_performance: budgetPerformance,
            top_expenses: topExpenses,
            predictions
        };
    } catch (error) {
        console.error('Expense analytics calculation failed:', error);
        throw error;
    }
}

function calculateDateRange(
    period: 'month' | 'year' | 'custom',
    startDate?: Date,
    endDate?: Date
): { dateFrom: Date; dateTo: Date } {
    const now = new Date();

    if (period === 'custom') {
        if (!startDate || !endDate) {
            throw new Error('Custom period requires startDate and endDate');
        }
        return { dateFrom: startDate, dateTo: endDate };
    }

    if (period === 'month') {
        const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { dateFrom, dateTo };
    }

    // year
    const dateFrom = new Date(now.getFullYear(), 0, 1);
    const dateTo = new Date(now.getFullYear(), 11, 31);
    return { dateFrom, dateTo };
}

function calculateSpendingByCategory(expenses: Array<{ category: string; amount: number }>): Array<{ category: string; amount: number; percentage: number }> {
    const categoryTotals = new Map<string, number>();
    let totalSpending = 0;

    // Calculate totals per category
    expenses.forEach(expense => {
        const current = categoryTotals.get(expense.category) || 0;
        categoryTotals.set(expense.category, current + expense.amount);
        totalSpending += expense.amount;
    });

    // Convert to array with percentages
    const result = Array.from(categoryTotals.entries()).map(([category, amount]) => ({
        category,
        amount,
        percentage: totalSpending > 0 ? (amount / totalSpending) * 100 : 0
    }));

    // Sort by amount descending
    return result.sort((a, b) => b.amount - a.amount);
}

function calculateSpendingTrends(
    expenses: Array<{ expense_date: Date; amount: number }>,
    period: 'month' | 'year' | 'custom'
): Array<{ date: string; amount: number }> {
    const dailyTotals = new Map<string, number>();

    // Group expenses by date
    expenses.forEach(expense => {
        const dateKey = expense.expense_date.toISOString().split('T')[0];
        const current = dailyTotals.get(dateKey) || 0;
        dailyTotals.set(dateKey, current + expense.amount);
    });

    // Convert to array and sort by date
    const trends = Array.from(dailyTotals.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // For monthly/yearly periods, aggregate to appropriate intervals
    if (period === 'year') {
        return aggregateByMonth(trends);
    }

    return trends;
}

function aggregateByMonth(dailyTrends: Array<{ date: string; amount: number }>): Array<{ date: string; amount: number }> {
    const monthlyTotals = new Map<string, number>();

    dailyTrends.forEach(({ date, amount }) => {
        const monthKey = date.substring(0, 7); // YYYY-MM format
        const current = monthlyTotals.get(monthKey) || 0;
        monthlyTotals.set(monthKey, current + amount);
    });

    return Array.from(monthlyTotals.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function calculateBudgetPerformance(
    expenses: Array<{ category: string; amount: number }>,
    budgets: Array<{ category: string; monthly_limit: number }>,
    period: 'month' | 'year' | 'custom'
): Array<{ category: string; budgeted: number; spent: number; remaining: number }> {
    const categorySpending = new Map<string, number>();

    // Calculate spending per category
    expenses.forEach(expense => {
        const current = categorySpending.get(expense.category) || 0;
        categorySpending.set(expense.category, current + expense.amount);
    });

    // Calculate budget performance
    const performance = budgets.map(budget => {
        const spent = categorySpending.get(budget.category) || 0;
        const budgeted = period === 'year' ? budget.monthly_limit * 12 : budget.monthly_limit;
        const remaining = budgeted - spent;

        return {
            category: budget.category,
            budgeted,
            spent,
            remaining
        };
    });

    return performance.sort((a, b) => (b.spent / b.budgeted) - (a.spent / a.budgeted));
}

function getTopExpenses(expenses: Array<{ title: string; amount: number; expense_date: Date; category: string }>): Array<{ title: string; amount: number; date: Date; category: string }> {
    return expenses
        .map(expense => ({
            title: expense.title,
            amount: expense.amount,
            date: expense.expense_date,
            category: expense.category
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);
}

function calculatePredictions(
    expenses: Array<{ expense_date: Date; amount: number; category: string }>,
    budgets: Array<{ category: string; monthly_limit: number }>
): { next_month_spending: number; budget_alerts: Array<{ category: string; projected_overspend: number }> } {
    // Calculate average daily spending from recent data
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentExpenses = expenses.filter(expense => expense.expense_date >= thirtyDaysAgo);
    const totalRecentSpending = recentExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    // Calculate based on number of days we have data for
    const daysWithData = recentExpenses.length > 0 
        ? Math.max(1, Math.ceil((now.getTime() - Math.min(...recentExpenses.map(e => e.expense_date.getTime()))) / (24 * 60 * 60 * 1000)))
        : 30;
    
    const averageDailySpending = totalRecentSpending / daysWithData;
    
    // Predict next month spending (30 days)
    const next_month_spending = averageDailySpending * 30;

    // Calculate budget alerts based on category spending trends
    const categorySpending = new Map<string, number>();
    recentExpenses.forEach(expense => {
        const current = categorySpending.get(expense.category) || 0;
        categorySpending.set(expense.category, current + expense.amount);
    });

    const budget_alerts = budgets
        .map(budget => {
            const recentSpending = categorySpending.get(budget.category) || 0;
            const categoryDaysWithData = Math.max(1, daysWithData);
            const projectedMonthlySpending = (recentSpending / categoryDaysWithData) * 30;
            const projected_overspend = Math.max(0, projectedMonthlySpending - budget.monthly_limit);
            
            return {
                category: budget.category,
                projected_overspend
            };
        })
        .filter(alert => alert.projected_overspend > 0)
        .sort((a, b) => b.projected_overspend - a.projected_overspend);

    return {
        next_month_spending,
        budget_alerts
    };
}