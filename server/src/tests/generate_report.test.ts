import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, expensesTable, teamsTable, teamMembersTable, reportsTable } from '../db/schema';
import { type GenerateReportInput } from '../schema';
import { generateReport } from '../handlers/generate_report';
import { eq } from 'drizzle-orm';

describe('generateReport', () => {
  let testUserId: number;
  let testManagerId: number;
  let testTeamId: number;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const userResults = await db.insert(usersTable)
      .values([
        {
          email: 'testuser@example.com',
          username: 'testuser',
          password_hash: 'hashedpassword',
          first_name: 'Test',
          last_name: 'User',
          role: 'USER'
        },
        {
          email: 'manager@example.com',
          username: 'manager',
          password_hash: 'hashedpassword',
          first_name: 'Test',
          last_name: 'Manager',
          role: 'MANAGER'
        }
      ])
      .returning()
      .execute();

    testUserId = userResults[0].id;
    testManagerId = userResults[1].id;

    // Create test team
    const teamResults = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        description: 'A team for testing',
        manager_id: testManagerId
      })
      .returning()
      .execute();

    testTeamId = teamResults[0].id;

    // Add user to team
    await db.insert(teamMembersTable)
      .values({
        team_id: testTeamId,
        user_id: testUserId
      })
      .execute();

    // Create test expenses
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    await db.insert(expensesTable)
      .values([
        {
          user_id: testUserId,
          title: 'Personal Food Expense',
          description: 'Lunch at restaurant',
          amount: '25.50',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: today,
          is_recurring: false
        },
        {
          user_id: testUserId,
          title: 'Transportation Cost',
          description: 'Metro card',
          amount: '15.00',
          category: 'TRANSPORTATION',
          status: 'PENDING',
          expense_date: today,
          is_recurring: false
        },
        {
          user_id: testUserId,
          team_id: testTeamId,
          title: 'Team Business Expense',
          description: 'Office supplies',
          amount: '100.00',
          category: 'BUSINESS',
          status: 'APPROVED',
          expense_date: today,
          is_recurring: false
        },
        {
          user_id: testManagerId,
          team_id: testTeamId,
          title: 'Manager Team Expense',
          description: 'Team meeting lunch',
          amount: '50.00',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: today,
          is_recurring: false
        },
        {
          user_id: testUserId,
          title: 'Old Expense',
          description: 'Previous month expense',
          amount: '30.00',
          category: 'SHOPPING',
          status: 'APPROVED',
          expense_date: lastMonth,
          is_recurring: false
        }
      ])
      .execute();
  });

  afterEach(resetDB);

  const getBaseInput = (): GenerateReportInput => {
    const startOfYear = new Date();
    startOfYear.setFullYear(startOfYear.getFullYear(), 0, 1);
    startOfYear.setHours(0, 0, 0, 0);
    
    const endOfYear = new Date();
    endOfYear.setFullYear(endOfYear.getFullYear(), 11, 31);
    endOfYear.setHours(23, 59, 59, 999);
    
    return {
      user_id: testUserId,
      type: 'MONTHLY',
      title: 'Monthly Expense Report',
      date_from: startOfYear,
      date_to: endOfYear,
      categories: undefined,
      include_team_expenses: false
    };
  };

  it('should generate a basic monthly report', async () => {
    const result = await generateReport(getBaseInput());

    expect(result.id).toBeDefined();
    expect(result.user_id).toEqual(testUserId);
    expect(result.type).toEqual('MONTHLY');
    expect(result.title).toEqual('Monthly Expense Report');
    expect(result.generated_at).toBeInstanceOf(Date);
    expect(result.expires_at).toBeInstanceOf(Date);
    expect(result.file_url).toMatch(/\/reports\/\d+_\d+_monthly\.pdf/);

    // Verify filters contain aggregated data
    const filters = JSON.parse(result.filters);
    expect(filters.date_from).toBeDefined();
    expect(filters.date_to).toBeDefined();
    expect(filters.include_team_expenses).toBe(false);
    expect(filters.total_expenses).toBeGreaterThan(0);
    expect(filters.total_amount).toBeGreaterThan(0);
    expect(filters.category_breakdown).toBeDefined();
  });

  it('should save report to database', async () => {
    const result = await generateReport(getBaseInput());

    const reports = await db.select()
      .from(reportsTable)
      .where(eq(reportsTable.id, result.id))
      .execute();

    expect(reports).toHaveLength(1);
    expect(reports[0].user_id).toEqual(testUserId);
    expect(reports[0].type).toEqual('MONTHLY');
    expect(reports[0].title).toEqual('Monthly Expense Report');
    expect(reports[0].file_url).toBeDefined();
    expect(reports[0].generated_at).toBeInstanceOf(Date);
    expect(reports[0].expires_at).toBeInstanceOf(Date);
  });

  it('should filter expenses by date range', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of day
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999); // End of day

    const narrowDateInput: GenerateReportInput = {
      ...getBaseInput(),
      date_from: today,
      date_to: endOfDay
    };

    const result = await generateReport(narrowDateInput);
    const filters = JSON.parse(result.filters);

    // Should only include today's expenses (3 user expenses)
    expect(filters.total_expenses).toEqual(3); // User's personal expenses for today
    expect(filters.total_amount).toEqual(140.5); // 25.50 + 15.00 + 100.00
  });

  it('should filter expenses by categories', async () => {
    const categoryFilterInput: GenerateReportInput = {
      ...getBaseInput(),
      categories: ['FOOD_DINING', 'TRANSPORTATION']
    };

    const result = await generateReport(categoryFilterInput);
    const filters = JSON.parse(result.filters);

    expect(filters.categories).toEqual(['FOOD_DINING', 'TRANSPORTATION']);
    expect(filters.category_breakdown['FOOD_DINING']).toBeDefined();
    expect(filters.category_breakdown['TRANSPORTATION']).toBeDefined();
    expect(filters.category_breakdown['BUSINESS']).toBeUndefined();
  });

  it('should include team expenses when requested', async () => {
    const teamExpenseInput: GenerateReportInput = {
      ...getBaseInput(),
      include_team_expenses: true
    };

    const result = await generateReport(teamExpenseInput);
    const filters = JSON.parse(result.filters);

    expect(filters.include_team_expenses).toBe(true);
    // Should include user's personal expenses + team expenses they have access to
    expect(filters.total_expenses).toBeGreaterThan(3);
    expect(filters.total_amount).toBeGreaterThan(40.5);
  });

  it('should set different expiration dates based on report type', async () => {
    const monthlyResult = await generateReport({
      ...getBaseInput(),
      type: 'MONTHLY'
    });

    const yearlyResult = await generateReport({
      ...getBaseInput(),
      type: 'YEARLY'
    });

    const customResult = await generateReport({
      ...getBaseInput(),
      type: 'CUSTOM'
    });

    const now = new Date();

    // Monthly reports expire in ~60 days
    const monthlyDays = Math.floor((monthlyResult.expires_at!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(monthlyDays).toBeGreaterThan(55);
    expect(monthlyDays).toBeLessThan(65);

    // Yearly reports expire in ~365 days
    const yearlyDays = Math.floor((yearlyResult.expires_at!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(yearlyDays).toBeGreaterThan(360);
    expect(yearlyDays).toBeLessThan(370);

    // Custom reports expire in ~30 days
    const customDays = Math.floor((customResult.expires_at!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(customDays).toBeGreaterThan(25);
    expect(customDays).toBeLessThan(35);
  });

  it('should include category breakdown in filters', async () => {
    const result = await generateReport(getBaseInput());
    const filters = JSON.parse(result.filters);

    expect(filters.category_breakdown).toBeDefined();
    expect(typeof filters.category_breakdown).toBe('object');

    // Check that categories have count and amount
    Object.values(filters.category_breakdown).forEach((breakdown: any) => {
      expect(breakdown.count).toBeGreaterThan(0);
      expect(breakdown.amount).toBeGreaterThan(0);
    });
  });

  it('should reject invalid date range', async () => {
    const invalidDateInput: GenerateReportInput = {
      ...getBaseInput(),
      date_from: new Date('2024-12-31'),
      date_to: new Date('2024-01-01')
    };

    expect(generateReport(invalidDateInput)).rejects.toThrow(/invalid date range/i);
  });

  it('should reject non-existent user', async () => {
    const invalidUserInput: GenerateReportInput = {
      ...getBaseInput(),
      user_id: 99999
    };

    expect(generateReport(invalidUserInput)).rejects.toThrow(/user.*not found/i);
  });

  it('should handle empty expense results', async () => {
    // Clear all expenses
    await db.delete(expensesTable).execute();

    const result = await generateReport(getBaseInput());
    const filters = JSON.parse(result.filters);

    expect(filters.total_expenses).toEqual(0);
    expect(filters.total_amount).toEqual(0);
    expect(filters.category_breakdown).toEqual({});
  });

  it('should generate unique file URLs', async () => {
    const result1 = await generateReport(getBaseInput());
    
    // Wait a moment to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 1));
    
    const result2 = await generateReport(getBaseInput());

    expect(result1.file_url).not.toEqual(result2.file_url);
    expect(result1.file_url).toMatch(/\/reports\/\d+_\d+_monthly\.pdf/);
    expect(result2.file_url).toMatch(/\/reports\/\d+_\d+_monthly\.pdf/);
  });
});