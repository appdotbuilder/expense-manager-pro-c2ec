import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, expensesTable } from '../db/schema';
import { searchExpenses } from '../handlers/search_expenses';

// Test user data
const testUser = {
  email: 'test@example.com',
  username: 'testuser',
  password_hash: 'hashedpassword',
  first_name: 'Test',
  last_name: 'User',
  role: 'USER' as const,
  email_verified: true,
  is_active: true
};

// Test expense data
const testExpenses = [
  {
    user_id: 1,
    title: 'Lunch at Restaurant',
    description: 'Italian food with colleagues',
    amount: '25.50',
    category: 'FOOD_DINING' as const,
    status: 'APPROVED' as const,
    expense_date: new Date('2024-01-15'),
    is_recurring: false
  },
  {
    user_id: 1,
    title: 'Coffee Meeting',
    description: 'Business meeting at Starbucks',
    amount: '12.75',
    category: 'FOOD_DINING' as const,
    status: 'PENDING' as const,
    expense_date: new Date('2024-01-20'),
    is_recurring: false
  },
  {
    user_id: 1,
    title: 'Uber Ride',
    description: 'Transportation to airport',
    amount: '45.00',
    category: 'TRANSPORTATION' as const,
    status: 'APPROVED' as const,
    expense_date: new Date('2024-01-10'),
    is_recurring: false
  },
  {
    user_id: 1,
    title: 'Grocery Shopping',
    description: 'Weekly food supplies',
    amount: '87.20',
    category: 'SHOPPING' as const,
    status: 'APPROVED' as const,
    expense_date: new Date('2024-02-01'),
    is_recurring: true
  },
  {
    user_id: 2, // Different user
    title: 'Restaurant Dinner',
    description: 'Family dinner',
    amount: '120.00',
    category: 'FOOD_DINING' as const,
    status: 'APPROVED' as const,
    expense_date: new Date('2024-01-16'),
    is_recurring: false
  }
];

describe('searchExpenses', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create test users
    await db.insert(usersTable).values([
      testUser,
      { ...testUser, id: 2, email: 'test2@example.com', username: 'testuser2' }
    ]);
    
    // Create test expenses
    await db.insert(expensesTable).values(testExpenses);
  });

  afterEach(resetDB);

  it('should search expenses by title', async () => {
    const results = await searchExpenses(1, 'lunch');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Lunch at Restaurant');
    expect(results[0].amount).toBe(25.50);
    expect(typeof results[0].amount).toBe('number');
  });

  it('should search expenses by description', async () => {
    const results = await searchExpenses(1, 'business');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Coffee Meeting');
    expect(results[0].description).toBe('Business meeting at Starbucks');
    expect(results[0].amount).toBe(12.75);
  });

  it('should perform case-insensitive search', async () => {
    const results = await searchExpenses(1, 'RESTAURANT');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Lunch at Restaurant');
  });

  it('should search across both title and description', async () => {
    const results = await searchExpenses(1, 'food');

    expect(results).toHaveLength(2);
    const titles = results.map(r => r.title);
    expect(titles).toContain('Lunch at Restaurant'); // 'food' in description
    expect(titles).toContain('Grocery Shopping'); // 'food' in description
  });

  it('should return only expenses for specified user', async () => {
    const results = await searchExpenses(1, 'restaurant');

    expect(results).toHaveLength(1);
    expect(results[0].user_id).toBe(1);
    expect(results[0].title).toBe('Lunch at Restaurant');
  });

  it('should return empty array when no matches found', async () => {
    const results = await searchExpenses(1, 'nonexistent');

    expect(results).toHaveLength(0);
  });

  it('should handle empty search term', async () => {
    const results = await searchExpenses(1, '');

    expect(results).toHaveLength(4); // All expenses for user 1
    expect(results.every(r => r.user_id === 1)).toBe(true);
  });

  it('should filter by category', async () => {
    const results = await searchExpenses(1, '', {
      category: 'FOOD_DINING'
    });

    expect(results).toHaveLength(2);
    expect(results.every(r => r.category === 'FOOD_DINING')).toBe(true);
  });

  it('should filter by date range', async () => {
    const results = await searchExpenses(1, '', {
      dateFrom: new Date('2024-01-15'),
      dateTo: new Date('2024-01-25')
    });

    expect(results).toHaveLength(2);
    const titles = results.map(r => r.title);
    expect(titles).toContain('Lunch at Restaurant');
    expect(titles).toContain('Coffee Meeting');
  });

  it('should filter by minimum amount', async () => {
    const results = await searchExpenses(1, '', {
      minAmount: 30
    });

    expect(results).toHaveLength(2);
    expect(results.every(r => r.amount >= 30)).toBe(true);
  });

  it('should filter by maximum amount', async () => {
    const results = await searchExpenses(1, '', {
      maxAmount: 50
    });

    expect(results).toHaveLength(3);
    expect(results.every(r => r.amount <= 50)).toBe(true);
  });

  it('should apply multiple filters together', async () => {
    const results = await searchExpenses(1, 'food', {
      category: 'FOOD_DINING',
      minAmount: 20,
      dateFrom: new Date('2024-01-01'),
      dateTo: new Date('2024-01-31')
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Lunch at Restaurant');
    expect(results[0].category).toBe('FOOD_DINING');
    expect(results[0].amount).toBe(25.50);
  });

  it('should order results by expense date descending', async () => {
    const results = await searchExpenses(1, '');

    expect(results).toHaveLength(4);
    // Should be ordered by expense_date DESC, then created_at DESC
    expect(results[0].title).toBe('Grocery Shopping'); // 2024-02-01
    expect(results[1].title).toBe('Coffee Meeting'); // 2024-01-20
    expect(results[2].title).toBe('Lunch at Restaurant'); // 2024-01-15
    expect(results[3].title).toBe('Uber Ride'); // 2024-01-10
  });

  it('should handle partial word matches', async () => {
    const results = await searchExpenses(1, 'uber');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Uber Ride');
  });

  it('should handle search term with whitespace', async () => {
    const results = await searchExpenses(1, '  coffee  ');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Coffee Meeting');
  });

  it('should convert numeric fields correctly', async () => {
    const results = await searchExpenses(1, '');

    results.forEach(expense => {
      expect(typeof expense.amount).toBe('number');
      expect(expense.amount).toBeGreaterThan(0);
      expect(expense.user_id).toBe(1);
      expect(expense.created_at).toBeInstanceOf(Date);
      expect(expense.expense_date).toBeInstanceOf(Date);
    });
  });
});