import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { budgetsTable, usersTable } from '../db/schema';
import { type UpdateBudgetInput } from '../schema';
import { updateBudget } from '../handlers/update_budget';
import { eq } from 'drizzle-orm';

describe('updateBudget', () => {
  let testUserId: number;
  let testBudgetId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();
    
    testUserId = userResult[0].id;

    // Create test budget
    const budgetResult = await db.insert(budgetsTable)
      .values({
        user_id: testUserId,
        category: 'FOOD_DINING',
        monthly_limit: '1000.00',
        current_spent: '250.50',
        alert_threshold: 75,
        is_active: true
      })
      .returning()
      .execute();
    
    testBudgetId = budgetResult[0].id;
  });

  afterEach(resetDB);

  it('should update monthly_limit only', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      monthly_limit: 1500
    };

    const result = await updateBudget(input);

    expect(result.id).toEqual(testBudgetId);
    expect(result.user_id).toEqual(testUserId);
    expect(result.category).toEqual('FOOD_DINING');
    expect(result.monthly_limit).toEqual(1500);
    expect(result.current_spent).toEqual(250.5);
    expect(result.alert_threshold).toEqual(75);
    expect(result.is_active).toEqual(true);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(typeof result.monthly_limit).toEqual('number');
    expect(typeof result.current_spent).toEqual('number');
  });

  it('should update alert_threshold only', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      alert_threshold: 90
    };

    const result = await updateBudget(input);

    expect(result.monthly_limit).toEqual(1000);
    expect(result.alert_threshold).toEqual(90);
    expect(result.is_active).toEqual(true);
  });

  it('should update is_active only', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      is_active: false
    };

    const result = await updateBudget(input);

    expect(result.monthly_limit).toEqual(1000);
    expect(result.alert_threshold).toEqual(75);
    expect(result.is_active).toEqual(false);
  });

  it('should update multiple fields at once', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      monthly_limit: 2000,
      alert_threshold: 85,
      is_active: false
    };

    const result = await updateBudget(input);

    expect(result.monthly_limit).toEqual(2000);
    expect(result.alert_threshold).toEqual(85);
    expect(result.is_active).toEqual(false);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save updates to database', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      monthly_limit: 1800,
      alert_threshold: 95
    };

    await updateBudget(input);

    // Verify in database
    const budgets = await db.select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, testBudgetId))
      .execute();

    expect(budgets).toHaveLength(1);
    expect(parseFloat(budgets[0].monthly_limit)).toEqual(1800);
    expect(budgets[0].alert_threshold).toEqual(95);
    expect(budgets[0].is_active).toEqual(true); // Should remain unchanged
    expect(budgets[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle budget with zero values', async () => {
    // Create budget with zero current_spent
    const budgetResult = await db.insert(budgetsTable)
      .values({
        user_id: testUserId,
        category: 'TRANSPORTATION',
        monthly_limit: '500.00',
        current_spent: '0.00',
        alert_threshold: 50,
        is_active: true
      })
      .returning()
      .execute();

    const zeroBudgetId = budgetResult[0].id;

    const input: UpdateBudgetInput = {
      id: zeroBudgetId,
      monthly_limit: 600,
      alert_threshold: 0
    };

    const result = await updateBudget(input);

    expect(result.monthly_limit).toEqual(600);
    expect(result.current_spent).toEqual(0);
    expect(result.alert_threshold).toEqual(0);
  });

  it('should handle decimal values correctly', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      monthly_limit: 1250.75
    };

    const result = await updateBudget(input);

    expect(result.monthly_limit).toEqual(1250.75);
    expect(typeof result.monthly_limit).toEqual('number');
  });

  it('should throw error when budget does not exist', async () => {
    const input: UpdateBudgetInput = {
      id: 99999,
      monthly_limit: 1000
    };

    await expect(updateBudget(input)).rejects.toThrow(/budget not found/i);
  });

  it('should update budget with maximum alert threshold', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      alert_threshold: 100
    };

    const result = await updateBudget(input);

    expect(result.alert_threshold).toEqual(100);
  });

  it('should update budget with minimum alert threshold', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      alert_threshold: 0
    };

    const result = await updateBudget(input);

    expect(result.alert_threshold).toEqual(0);
  });

  it('should handle large monetary amounts', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      monthly_limit: 99999.99
    };

    const result = await updateBudget(input);

    expect(result.monthly_limit).toEqual(99999.99);
    expect(typeof result.monthly_limit).toEqual('number');
  });

  it('should preserve other fields when updating', async () => {
    const input: UpdateBudgetInput = {
      id: testBudgetId,
      monthly_limit: 1200
    };

    const result = await updateBudget(input);

    // Original values should be preserved
    expect(result.user_id).toEqual(testUserId);
    expect(result.category).toEqual('FOOD_DINING');
    expect(result.current_spent).toEqual(250.5);
    expect(result.alert_threshold).toEqual(75);
    expect(result.is_active).toEqual(true);
    expect(result.created_at).toBeInstanceOf(Date);
  });
});