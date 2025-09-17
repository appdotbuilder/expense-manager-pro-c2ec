import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, budgetsTable, expensesTable } from '../db/schema';
import { getUserBudgets } from '../handlers/get_user_budgets';
import { eq } from 'drizzle-orm';

describe('getUserBudgets', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when user has no budgets', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    const budgets = await getUserBudgets(userId);

    expect(budgets).toEqual([]);
  });

  it('should return user budgets with correct numeric conversions', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create test budgets
    await db.insert(budgetsTable)
      .values([
        {
          user_id: userId,
          category: 'FOOD_DINING',
          monthly_limit: '500.00',
          alert_threshold: 80
        },
        {
          user_id: userId,
          category: 'TRANSPORTATION',
          monthly_limit: '300.50',
          alert_threshold: 75
        }
      ])
      .execute();

    const budgets = await getUserBudgets(userId);

    expect(budgets).toHaveLength(2);
    
    // Verify numeric conversions
    expect(typeof budgets[0].monthly_limit).toBe('number');
    expect(typeof budgets[0].current_spent).toBe('number');
    expect(budgets[0].monthly_limit).toEqual(500);
    expect(budgets[0].current_spent).toEqual(0);

    expect(typeof budgets[1].monthly_limit).toBe('number');
    expect(typeof budgets[1].current_spent).toBe('number');
    expect(budgets[1].monthly_limit).toEqual(300.5);
    expect(budgets[1].current_spent).toEqual(0);
  });

  it('should calculate current spent amounts correctly', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create test budget
    await db.insert(budgetsTable)
      .values({
        user_id: userId,
        category: 'FOOD_DINING',
        monthly_limit: '500.00',
        alert_threshold: 80
      })
      .execute();

    // Create approved expenses for this month
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);
    
    await db.insert(expensesTable)
      .values([
        {
          user_id: userId,
          title: 'Lunch',
          amount: '25.50',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: thisMonth
        },
        {
          user_id: userId,
          title: 'Dinner',
          amount: '45.75',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: thisMonth
        }
      ])
      .execute();

    const budgets = await getUserBudgets(userId);

    expect(budgets).toHaveLength(1);
    expect(budgets[0].current_spent).toEqual(71.25); // 25.50 + 45.75
    expect(budgets[0].monthly_limit).toEqual(500);
  });

  it('should only include approved expenses in current spent calculation', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create test budget
    await db.insert(budgetsTable)
      .values({
        user_id: userId,
        category: 'FOOD_DINING',
        monthly_limit: '500.00',
        alert_threshold: 80
      })
      .execute();

    // Create expenses with different statuses
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);
    
    await db.insert(expensesTable)
      .values([
        {
          user_id: userId,
          title: 'Approved Lunch',
          amount: '25.50',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: thisMonth
        },
        {
          user_id: userId,
          title: 'Pending Dinner',
          amount: '45.75',
          category: 'FOOD_DINING',
          status: 'PENDING',
          expense_date: thisMonth
        },
        {
          user_id: userId,
          title: 'Rejected Breakfast',
          amount: '15.00',
          category: 'FOOD_DINING',
          status: 'REJECTED',
          expense_date: thisMonth
        }
      ])
      .execute();

    const budgets = await getUserBudgets(userId);

    expect(budgets).toHaveLength(1);
    expect(budgets[0].current_spent).toEqual(25.5); // Only approved expenses
  });

  it('should only include current month expenses in spending calculation', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create test budget
    await db.insert(budgetsTable)
      .values({
        user_id: userId,
        category: 'FOOD_DINING',
        monthly_limit: '500.00',
        alert_threshold: 80
      })
      .execute();

    // Create expenses from different months
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    
    await db.insert(expensesTable)
      .values([
        {
          user_id: userId,
          title: 'This Month Lunch',
          amount: '25.50',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: thisMonth
        },
        {
          user_id: userId,
          title: 'Last Month Lunch',
          amount: '30.00',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: lastMonth
        }
      ])
      .execute();

    const budgets = await getUserBudgets(userId);

    expect(budgets).toHaveLength(1);
    expect(budgets[0].current_spent).toEqual(25.5); // Only this month's expense
  });

  it('should filter expenses by category correctly', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create budgets for different categories
    await db.insert(budgetsTable)
      .values([
        {
          user_id: userId,
          category: 'FOOD_DINING',
          monthly_limit: '500.00',
          alert_threshold: 80
        },
        {
          user_id: userId,
          category: 'TRANSPORTATION',
          monthly_limit: '300.00',
          alert_threshold: 75
        }
      ])
      .execute();

    // Create expenses for different categories
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);
    
    await db.insert(expensesTable)
      .values([
        {
          user_id: userId,
          title: 'Restaurant',
          amount: '50.00',
          category: 'FOOD_DINING',
          status: 'APPROVED',
          expense_date: thisMonth
        },
        {
          user_id: userId,
          title: 'Gas',
          amount: '75.00',
          category: 'TRANSPORTATION',
          status: 'APPROVED',
          expense_date: thisMonth
        }
      ])
      .execute();

    const budgets = await getUserBudgets(userId);

    expect(budgets).toHaveLength(2);
    
    const foodBudget = budgets.find(b => b.category === 'FOOD_DINING');
    const transportBudget = budgets.find(b => b.category === 'TRANSPORTATION');

    expect(foodBudget?.current_spent).toEqual(50);
    expect(transportBudget?.current_spent).toEqual(75);
  });

  it('should only return budgets for the specified user', async () => {
    // Create two test users
    const user1Result = await db.insert(usersTable)
      .values({
        email: 'user1@example.com',
        username: 'user1',
        password_hash: 'hashedpassword',
        first_name: 'User',
        last_name: 'One',
        role: 'USER'
      })
      .returning()
      .execute();

    const user2Result = await db.insert(usersTable)
      .values({
        email: 'user2@example.com',
        username: 'user2',
        password_hash: 'hashedpassword',
        first_name: 'User',
        last_name: 'Two',
        role: 'USER'
      })
      .returning()
      .execute();

    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    // Create budgets for both users
    await db.insert(budgetsTable)
      .values([
        {
          user_id: user1Id,
          category: 'FOOD_DINING',
          monthly_limit: '500.00',
          alert_threshold: 80
        },
        {
          user_id: user2Id,
          category: 'FOOD_DINING',
          monthly_limit: '600.00',
          alert_threshold: 85
        }
      ])
      .execute();

    const user1Budgets = await getUserBudgets(user1Id);
    const user2Budgets = await getUserBudgets(user2Id);

    expect(user1Budgets).toHaveLength(1);
    expect(user2Budgets).toHaveLength(1);
    
    expect(user1Budgets[0].monthly_limit).toEqual(500);
    expect(user2Budgets[0].monthly_limit).toEqual(600);
  });

  it('should update budget current_spent in database', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create test budget
    const budgetResult = await db.insert(budgetsTable)
      .values({
        user_id: userId,
        category: 'FOOD_DINING',
        monthly_limit: '500.00',
        current_spent: '0.00',
        alert_threshold: 80
      })
      .returning()
      .execute();

    const budgetId = budgetResult[0].id;

    // Create approved expense
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);
    
    await db.insert(expensesTable)
      .values({
        user_id: userId,
        title: 'Lunch',
        amount: '25.50',
        category: 'FOOD_DINING',
        status: 'APPROVED',
        expense_date: thisMonth
      })
      .execute();

    // Call the handler
    await getUserBudgets(userId);

    // Verify database was updated
    const updatedBudget = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, budgetId))
      .execute();

    expect(parseFloat(updatedBudget[0].current_spent)).toEqual(25.5);
  });
});