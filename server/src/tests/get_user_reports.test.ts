import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, reportsTable } from '../db/schema';
import { getUserReports } from '../handlers/get_user_reports';

describe('getUserReports', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when user has no reports', async () => {
    // Create user first
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning()
      .execute();

    const result = await getUserReports(user[0].id);

    expect(result).toEqual([]);
  });

  it('should return user reports ordered by generation date descending', async () => {
    // Create user first
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning()
      .execute();

    const userId = user[0].id;

    // Create multiple reports with different generation dates
    const olderDate = new Date('2023-01-01');
    const newerDate = new Date('2023-02-01');

    await db.insert(reportsTable)
      .values([
        {
          user_id: userId,
          type: 'MONTHLY',
          title: 'Older Report',
          filters: '{"month": 1}',
          generated_at: olderDate,
          file_url: 'https://example.com/report1.pdf'
        },
        {
          user_id: userId,
          type: 'YEARLY',
          title: 'Newer Report',
          filters: '{"year": 2023}',
          generated_at: newerDate,
          file_url: 'https://example.com/report2.pdf'
        }
      ])
      .execute();

    const result = await getUserReports(userId);

    expect(result).toHaveLength(2);
    expect(result[0].title).toEqual('Newer Report');
    expect(result[1].title).toEqual('Older Report');
    expect(result[0].generated_at >= result[1].generated_at).toBe(true);
  });

  it('should filter out expired reports', async () => {
    // Create user first
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning()
      .execute();

    const userId = user[0].id;

    // Create reports with different expiration statuses
    const pastDate = new Date('2020-01-01');
    const futureDate = new Date('2030-01-01');

    await db.insert(reportsTable)
      .values([
        {
          user_id: userId,
          type: 'MONTHLY',
          title: 'Expired Report',
          filters: '{"month": 1}',
          expires_at: pastDate,
          file_url: 'https://example.com/expired.pdf'
        },
        {
          user_id: userId,
          type: 'YEARLY',
          title: 'Valid Report',
          filters: '{"year": 2023}',
          expires_at: futureDate,
          file_url: 'https://example.com/valid.pdf'
        },
        {
          user_id: userId,
          type: 'CUSTOM',
          title: 'Never Expires',
          filters: '{"custom": true}',
          expires_at: null,
          file_url: 'https://example.com/permanent.pdf'
        }
      ])
      .execute();

    const result = await getUserReports(userId);

    expect(result).toHaveLength(2);
    const titles = result.map(r => r.title);
    expect(titles).toContain('Valid Report');
    expect(titles).toContain('Never Expires');
    expect(titles).not.toContain('Expired Report');
  });

  it('should only return reports for the specified user', async () => {
    // Create two users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@example.com',
          username: 'user1',
          password_hash: 'hashed_password',
          first_name: 'User',
          last_name: 'One'
        },
        {
          email: 'user2@example.com',
          username: 'user2',
          password_hash: 'hashed_password',
          first_name: 'User',
          last_name: 'Two'
        }
      ])
      .returning()
      .execute();

    const user1Id = users[0].id;
    const user2Id = users[1].id;

    // Create reports for both users
    await db.insert(reportsTable)
      .values([
        {
          user_id: user1Id,
          type: 'MONTHLY',
          title: 'User 1 Report',
          filters: '{"month": 1}',
          file_url: 'https://example.com/user1.pdf'
        },
        {
          user_id: user2Id,
          type: 'YEARLY',
          title: 'User 2 Report',
          filters: '{"year": 2023}',
          file_url: 'https://example.com/user2.pdf'
        }
      ])
      .execute();

    const result = await getUserReports(user1Id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('User 1 Report');
    expect(result[0].user_id).toEqual(user1Id);
  });

  it('should return reports with correct field types', async () => {
    // Create user first
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning()
      .execute();

    const userId = user[0].id;

    // Create a report
    await db.insert(reportsTable)
      .values({
        user_id: userId,
        type: 'CUSTOM',
        title: 'Test Report',
        filters: '{"test": true}',
        file_url: 'https://example.com/test.pdf',
        expires_at: new Date('2030-01-01')
      })
      .execute();

    const result = await getUserReports(userId);

    expect(result).toHaveLength(1);
    const report = result[0];
    
    expect(typeof report.id).toBe('number');
    expect(typeof report.user_id).toBe('number');
    expect(typeof report.type).toBe('string');
    expect(typeof report.title).toBe('string');
    expect(typeof report.filters).toBe('string');
    expect(report.generated_at).toBeInstanceOf(Date);
    expect(report.expires_at).toBeInstanceOf(Date);
    expect(typeof report.file_url).toBe('string');
  });

  it('should handle reports without file_url and expires_at', async () => {
    // Create user first
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning()
      .execute();

    const userId = user[0].id;

    // Create a report with null optional fields
    await db.insert(reportsTable)
      .values({
        user_id: userId,
        type: 'MONTHLY',
        title: 'Simple Report',
        filters: '{"simple": true}',
        file_url: null,
        expires_at: null
      })
      .execute();

    const result = await getUserReports(userId);

    expect(result).toHaveLength(1);
    const report = result[0];
    
    expect(report.file_url).toBeNull();
    expect(report.expires_at).toBeNull();
    expect(report.title).toEqual('Simple Report');
  });
});