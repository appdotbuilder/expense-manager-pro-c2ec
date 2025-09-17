import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, teamsTable, expensesTable } from '../db/schema';
import { getPendingApprovals } from '../handlers/get_pending_approvals';

describe('getPendingApprovals', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return pending expenses for a manager', async () => {
    // Create users
    const [manager, employee] = await db.insert(usersTable)
      .values([
        {
          email: 'manager@test.com',
          username: 'manager',
          password_hash: 'hash123',
          first_name: 'Manager',
          last_name: 'User',
          role: 'MANAGER'
        },
        {
          email: 'employee@test.com',
          username: 'employee',
          password_hash: 'hash123',
          first_name: 'Employee',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    // Create team
    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        description: 'Test team description',
        manager_id: manager.id
      })
      .returning()
      .execute();

    // Create pending expenses
    const [expense1, expense2] = await db.insert(expensesTable)
      .values([
        {
          user_id: employee.id,
          team_id: team.id,
          title: 'Office Supplies',
          description: 'Pens and papers',
          amount: '25.50',
          category: 'BUSINESS',
          status: 'PENDING',
          expense_date: new Date('2024-01-15')
        },
        {
          user_id: employee.id,
          team_id: team.id,
          title: 'Team Lunch',
          description: 'Monthly team building',
          amount: '150.00',
          category: 'FOOD_DINING',
          status: 'PENDING',
          expense_date: new Date('2024-01-20')
        }
      ])
      .returning()
      .execute();

    const result = await getPendingApprovals(manager.id);

    expect(result).toHaveLength(2);
    
    // Should be ordered by expense_date descending (newest first)
    expect(result[0].title).toEqual('Team Lunch');
    expect(result[0].amount).toEqual(150.00);
    expect(result[0].status).toEqual('PENDING');
    expect(typeof result[0].amount).toBe('number');
    
    expect(result[1].title).toEqual('Office Supplies');
    expect(result[1].amount).toEqual(25.50);
    expect(result[1].status).toEqual('PENDING');
  });

  it('should only return expenses from manager\'s teams', async () => {
    // Create users
    const [manager1, manager2, employee] = await db.insert(usersTable)
      .values([
        {
          email: 'manager1@test.com',
          username: 'manager1',
          password_hash: 'hash123',
          first_name: 'Manager',
          last_name: 'One',
          role: 'MANAGER'
        },
        {
          email: 'manager2@test.com',
          username: 'manager2',
          password_hash: 'hash123',
          first_name: 'Manager',
          last_name: 'Two',
          role: 'MANAGER'
        },
        {
          email: 'employee@test.com',
          username: 'employee',
          password_hash: 'hash123',
          first_name: 'Employee',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    // Create teams for different managers
    const [team1, team2] = await db.insert(teamsTable)
      .values([
        {
          name: 'Team 1',
          description: 'Manager 1 team',
          manager_id: manager1.id
        },
        {
          name: 'Team 2',
          description: 'Manager 2 team',
          manager_id: manager2.id
        }
      ])
      .returning()
      .execute();

    // Create expenses in both teams
    await db.insert(expensesTable)
      .values([
        {
          user_id: employee.id,
          team_id: team1.id,
          title: 'Team 1 Expense',
          amount: '100.00',
          category: 'BUSINESS',
          status: 'PENDING',
          expense_date: new Date('2024-01-15')
        },
        {
          user_id: employee.id,
          team_id: team2.id,
          title: 'Team 2 Expense',
          amount: '200.00',
          category: 'BUSINESS',
          status: 'PENDING',
          expense_date: new Date('2024-01-15')
        }
      ])
      .execute();

    const result = await getPendingApprovals(manager1.id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Team 1 Expense');
    expect(result[0].amount).toEqual(100.00);
  });

  it('should not return approved or rejected expenses', async () => {
    // Create users
    const [manager, employee] = await db.insert(usersTable)
      .values([
        {
          email: 'manager@test.com',
          username: 'manager',
          password_hash: 'hash123',
          first_name: 'Manager',
          last_name: 'User',
          role: 'MANAGER'
        },
        {
          email: 'employee@test.com',
          username: 'employee',
          password_hash: 'hash123',
          first_name: 'Employee',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    // Create team
    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        manager_id: manager.id
      })
      .returning()
      .execute();

    // Create expenses with different statuses
    await db.insert(expensesTable)
      .values([
        {
          user_id: employee.id,
          team_id: team.id,
          title: 'Pending Expense',
          amount: '50.00',
          category: 'BUSINESS',
          status: 'PENDING',
          expense_date: new Date('2024-01-15')
        },
        {
          user_id: employee.id,
          team_id: team.id,
          title: 'Approved Expense',
          amount: '75.00',
          category: 'BUSINESS',
          status: 'APPROVED',
          approved_by: manager.id,
          approved_at: new Date(),
          expense_date: new Date('2024-01-16')
        },
        {
          user_id: employee.id,
          team_id: team.id,
          title: 'Rejected Expense',
          amount: '100.00',
          category: 'BUSINESS',
          status: 'REJECTED',
          approved_by: manager.id,
          approved_at: new Date(),
          expense_date: new Date('2024-01-17')
        }
      ])
      .execute();

    const result = await getPendingApprovals(manager.id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Pending Expense');
    expect(result[0].status).toEqual('PENDING');
  });

  it('should return empty array when manager has no pending expenses', async () => {
    // Create manager with no team expenses
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

    const result = await getPendingApprovals(manager.id);

    expect(result).toHaveLength(0);
  });

  it('should throw error when manager does not exist', async () => {
    await expect(getPendingApprovals(999)).rejects.toThrow(/manager not found/i);
  });

  it('should throw error when user is not a manager or admin', async () => {
    // Create regular user
    const [user] = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        username: 'user',
        password_hash: 'hash123',
        first_name: 'Regular',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    await expect(getPendingApprovals(user.id)).rejects.toThrow(/not authorized to approve expenses/i);
  });

  it('should allow admin to get pending approvals', async () => {
    // Create admin and employee
    const [admin, employee] = await db.insert(usersTable)
      .values([
        {
          email: 'admin@test.com',
          username: 'admin',
          password_hash: 'hash123',
          first_name: 'Admin',
          last_name: 'User',
          role: 'ADMIN'
        },
        {
          email: 'employee@test.com',
          username: 'employee',
          password_hash: 'hash123',
          first_name: 'Employee',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    // Create team managed by admin
    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Admin Team',
        manager_id: admin.id
      })
      .returning()
      .execute();

    // Create pending expense
    await db.insert(expensesTable)
      .values({
        user_id: employee.id,
        team_id: team.id,
        title: 'Admin Approval Test',
        amount: '300.00',
        category: 'BUSINESS',
        status: 'PENDING',
        expense_date: new Date('2024-01-15')
      })
      .execute();

    const result = await getPendingApprovals(admin.id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Admin Approval Test');
    expect(result[0].amount).toEqual(300.00);
  });

  it('should handle expenses without team_id correctly', async () => {
    // Create manager and employee
    const [manager, employee] = await db.insert(usersTable)
      .values([
        {
          email: 'manager@test.com',
          username: 'manager',
          password_hash: 'hash123',
          first_name: 'Manager',
          last_name: 'User',
          role: 'MANAGER'
        },
        {
          email: 'employee@test.com',
          username: 'employee',
          password_hash: 'hash123',
          first_name: 'Employee',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    // Create team
    const [team] = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        manager_id: manager.id
      })
      .returning()
      .execute();

    // Create expenses - one with team, one without team
    await db.insert(expensesTable)
      .values([
        {
          user_id: employee.id,
          team_id: team.id,
          title: 'Team Expense',
          amount: '50.00',
          category: 'BUSINESS',
          status: 'PENDING',
          expense_date: new Date('2024-01-15')
        },
        {
          user_id: employee.id,
          team_id: null, // Personal expense, no team
          title: 'Personal Expense',
          amount: '25.00',
          category: 'BUSINESS',
          status: 'PENDING',
          expense_date: new Date('2024-01-16')
        }
      ])
      .execute();

    const result = await getPendingApprovals(manager.id);

    // Should only return team expense, not personal expense
    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Team Expense');
  });
});