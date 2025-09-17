import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, teamsTable, expensesTable } from '../db/schema';
import { getTeamExpenses } from '../handlers/get_team_expenses';

describe('getTeamExpenses', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return team expenses for valid manager', async () => {
    // Create test users
    const [manager] = await db.insert(usersTable)
      .values({
        email: 'manager@test.com',
        username: 'manager',
        password_hash: 'hash123',
        first_name: 'Manager',
        last_name: 'User',
        role: 'MANAGER'
      })
      .returning()
      .execute();

    const [teamMember] = await db.insert(usersTable)
      .values({
        email: 'member@test.com',
        username: 'member',
        password_hash: 'hash123',
        first_name: 'Team',
        last_name: 'Member',
        role: 'USER'
      })
      .returning()
      .execute();

    // Create test team
    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        description: 'Test team description',
        manager_id: manager.id
      })
      .returning()
      .execute();

    // Create test expenses for the team
    const [expense1] = await db.insert(expensesTable)
      .values({
        user_id: teamMember.id,
        team_id: team.id,
        title: 'Team Lunch',
        description: 'Team building lunch',
        amount: '50.75',
        category: 'FOOD_DINING',
        expense_date: new Date('2023-01-15'),
        status: 'PENDING'
      })
      .returning()
      .execute();

    const [expense2] = await db.insert(expensesTable)
      .values({
        user_id: manager.id,
        team_id: team.id,
        title: 'Office Supplies',
        description: 'Printer paper and pens',
        amount: '25.99',
        category: 'BUSINESS',
        expense_date: new Date('2023-01-16'),
        status: 'APPROVED'
      })
      .returning()
      .execute();

    // Test the handler
    const result = await getTeamExpenses(team.id, manager.id);

    expect(result).toHaveLength(2);
    
    // Verify expense details
    const teamLunch = result.find(e => e.title === 'Team Lunch');
    expect(teamLunch).toBeDefined();
    expect(teamLunch?.amount).toEqual(50.75);
    expect(typeof teamLunch?.amount).toBe('number');
    expect(teamLunch?.category).toEqual('FOOD_DINING');
    expect(teamLunch?.status).toEqual('PENDING');

    const officeSupplies = result.find(e => e.title === 'Office Supplies');
    expect(officeSupplies).toBeDefined();
    expect(officeSupplies?.amount).toEqual(25.99);
    expect(typeof officeSupplies?.amount).toBe('number');
    expect(officeSupplies?.category).toEqual('BUSINESS');
    expect(officeSupplies?.status).toEqual('APPROVED');

    // Verify all expenses belong to the team
    result.forEach(expense => {
      expect(expense.team_id).toEqual(team.id);
    });
  });

  it('should return empty array when team has no expenses', async () => {
    // Create test users and team
    const [manager] = await db.insert(usersTable)
      .values({
        email: 'manager@test.com',
        username: 'manager',
        password_hash: 'hash123',
        first_name: 'Manager',
        last_name: 'User',
        role: 'MANAGER'
      })
      .returning()
      .execute();

    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Empty Team',
        description: 'Team with no expenses',
        manager_id: manager.id
      })
      .returning()
      .execute();

    const result = await getTeamExpenses(team.id, manager.id);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should throw error when team does not exist', async () => {
    const nonExistentTeamId = 99999;
    const managerId = 1;

    await expect(getTeamExpenses(nonExistentTeamId, managerId))
      .rejects.toThrow(/team not found/i);
  });

  it('should throw error when user is not the team manager', async () => {
    // Create test users
    const [manager] = await db.insert(usersTable)
      .values({
        email: 'manager@test.com',
        username: 'manager',
        password_hash: 'hash123',
        first_name: 'Manager',
        last_name: 'User',
        role: 'MANAGER'
      })
      .returning()
      .execute();

    const [nonManager] = await db.insert(usersTable)
      .values({
        email: 'nonmanager@test.com',
        username: 'nonmanager',
        password_hash: 'hash123',
        first_name: 'Non',
        last_name: 'Manager',
        role: 'USER'
      })
      .returning()
      .execute();

    // Create test team
    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Restricted Team',
        description: 'Team with access restrictions',
        manager_id: manager.id
      })
      .returning()
      .execute();

    // Try to access with non-manager user
    await expect(getTeamExpenses(team.id, nonManager.id))
      .rejects.toThrow(/access denied.*not the manager/i);
  });

  it('should handle different expense categories and statuses correctly', async () => {
    // Create test users
    const [manager] = await db.insert(usersTable)
      .values({
        email: 'manager@test.com',
        username: 'manager',
        password_hash: 'hash123',
        first_name: 'Manager',
        last_name: 'User',
        role: 'MANAGER'
      })
      .returning()
      .execute();

    const [teamMember] = await db.insert(usersTable)
      .values({
        email: 'member@test.com',
        username: 'member',
        password_hash: 'hash123',
        first_name: 'Team',
        last_name: 'Member',
        role: 'USER'
      })
      .returning()
      .execute();

    // Create test team
    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Diverse Team',
        description: 'Team with diverse expenses',
        manager_id: manager.id
      })
      .returning()
      .execute();

    // Create expenses with different categories and statuses
    await db.insert(expensesTable)
      .values([
        {
          user_id: teamMember.id,
          team_id: team.id,
          title: 'Transportation',
          amount: '15.50',
          category: 'TRANSPORTATION',
          expense_date: new Date('2023-01-15'),
          status: 'PENDING'
        },
        {
          user_id: teamMember.id,
          team_id: team.id,
          title: 'Entertainment',
          amount: '100.00',
          category: 'ENTERTAINMENT',
          expense_date: new Date('2023-01-16'),
          status: 'APPROVED'
        },
        {
          user_id: manager.id,
          team_id: team.id,
          title: 'Healthcare',
          amount: '75.25',
          category: 'HEALTHCARE',
          expense_date: new Date('2023-01-17'),
          status: 'REJECTED'
        }
      ])
      .execute();

    const result = await getTeamExpenses(team.id, manager.id);

    expect(result).toHaveLength(3);

    // Verify different categories are present
    const categories = result.map(e => e.category);
    expect(categories).toContain('TRANSPORTATION');
    expect(categories).toContain('ENTERTAINMENT');
    expect(categories).toContain('HEALTHCARE');

    // Verify different statuses are present
    const statuses = result.map(e => e.status);
    expect(statuses).toContain('PENDING');
    expect(statuses).toContain('APPROVED');
    expect(statuses).toContain('REJECTED');

    // Verify numeric conversion for all amounts
    result.forEach(expense => {
      expect(typeof expense.amount).toBe('number');
      expect(expense.amount).toBeGreaterThan(0);
    });
  });

  it('should only return expenses for the specified team', async () => {
    // Create test users
    const [manager] = await db.insert(usersTable)
      .values({
        email: 'manager@test.com',
        username: 'manager',
        password_hash: 'hash123',
        first_name: 'Manager',
        last_name: 'User',
        role: 'MANAGER'
      })
      .returning()
      .execute();

    const [teamMember] = await db.insert(usersTable)
      .values({
        email: 'member@test.com',
        username: 'member',
        password_hash: 'hash123',
        first_name: 'Team',
        last_name: 'Member',
        role: 'USER'
      })
      .returning()
      .execute();

    // Create two teams
    const [team1] = await db.insert(teamsTable)
      .values({
        name: 'Team One',
        description: 'First team',
        manager_id: manager.id
      })
      .returning()
      .execute();

    const [team2] = await db.insert(teamsTable)
      .values({
        name: 'Team Two',
        description: 'Second team',
        manager_id: manager.id
      })
      .returning()
      .execute();

    // Create expenses for both teams
    await db.insert(expensesTable)
      .values([
        {
          user_id: teamMember.id,
          team_id: team1.id,
          title: 'Team 1 Expense',
          amount: '50.00',
          category: 'FOOD_DINING',
          expense_date: new Date('2023-01-15'),
          status: 'PENDING'
        },
        {
          user_id: teamMember.id,
          team_id: team2.id,
          title: 'Team 2 Expense',
          amount: '75.00',
          category: 'BUSINESS',
          expense_date: new Date('2023-01-16'),
          status: 'APPROVED'
        }
      ])
      .execute();

    // Test that only team1 expenses are returned
    const result = await getTeamExpenses(team1.id, manager.id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Team 1 Expense');
    expect(result[0].team_id).toEqual(team1.id);
    expect(result[0].amount).toEqual(50.00);
  });
});