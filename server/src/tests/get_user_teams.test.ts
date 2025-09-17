import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, teamsTable, teamMembersTable } from '../db/schema';
import { getUserTeams } from '../handlers/get_user_teams';

describe('getUserTeams', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when user has no teams', async () => {
    // Create a user with no team associations
    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        username: 'testuser',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const result = await getUserTeams(users[0].id);

    expect(result).toEqual([]);
  });

  it('should return teams where user is manager', async () => {
    // Create users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'manager@test.com',
          username: 'manager',
          password_hash: 'hash',
          first_name: 'Manager',
          last_name: 'User',
          role: 'MANAGER'
        },
        {
          email: 'user@test.com',
          username: 'user',
          password_hash: 'hash',
          first_name: 'Regular',
          last_name: 'User',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    const managerId = users[0].id;
    const userId = users[1].id;

    // Create teams managed by the first user
    const teams = await db.insert(teamsTable)
      .values([
        {
          name: 'Development Team',
          description: 'Software development team',
          manager_id: managerId
        },
        {
          name: 'QA Team',
          description: 'Quality assurance team',
          manager_id: managerId
        },
        {
          name: 'Other Team',
          description: 'Team managed by someone else',
          manager_id: userId
        }
      ])
      .returning()
      .execute();

    const result = await getUserTeams(managerId);

    expect(result).toHaveLength(2);
    expect(result.map(t => t.name).sort()).toEqual(['Development Team', 'QA Team']);
    expect(result[0].manager_id).toBe(managerId);
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should return teams where user is member', async () => {
    // Create users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'manager@test.com',
          username: 'manager',
          password_hash: 'hash',
          first_name: 'Manager',
          last_name: 'User',
          role: 'MANAGER'
        },
        {
          email: 'member@test.com',
          username: 'member',
          password_hash: 'hash',
          first_name: 'Team',
          last_name: 'Member',
          role: 'USER'
        }
      ])
      .returning()
      .execute();

    const managerId = users[0].id;
    const memberId = users[1].id;

    // Create teams
    const teams = await db.insert(teamsTable)
      .values([
        {
          name: 'Frontend Team',
          description: 'Frontend development team',
          manager_id: managerId
        },
        {
          name: 'Backend Team',
          description: 'Backend development team',
          manager_id: managerId
        }
      ])
      .returning()
      .execute();

    // Add user as member to first team only
    await db.insert(teamMembersTable)
      .values({
        team_id: teams[0].id,
        user_id: memberId
      })
      .execute();

    const result = await getUserTeams(memberId);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Frontend Team');
    expect(result[0].description).toBe('Frontend development team');
    expect(result[0].manager_id).toBe(managerId);
  });

  it('should return teams where user is both manager and member (deduplicated)', async () => {
    // Create user
    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        username: 'user',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'MANAGER'
      })
      .returning()
      .execute();

    const userId = users[0].id;

    // Create team managed by the user
    const teams = await db.insert(teamsTable)
      .values({
        name: 'Full Stack Team',
        description: 'User is both manager and member',
        manager_id: userId
      })
      .returning()
      .execute();

    // Add user as member of their own team (edge case)
    await db.insert(teamMembersTable)
      .values({
        team_id: teams[0].id,
        user_id: userId
      })
      .execute();

    const result = await getUserTeams(userId);

    // Should return only one instance of the team, not duplicated
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Full Stack Team');
    expect(result[0].manager_id).toBe(userId);
  });

  it('should return all teams for user with multiple roles', async () => {
    // Create users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'multiuser@test.com',
          username: 'multiuser',
          password_hash: 'hash',
          first_name: 'Multi',
          last_name: 'User',
          role: 'MANAGER'
        },
        {
          email: 'other@test.com',
          username: 'other',
          password_hash: 'hash',
          first_name: 'Other',
          last_name: 'User',
          role: 'MANAGER'
        }
      ])
      .returning()
      .execute();

    const multiUserId = users[0].id;
    const otherUserId = users[1].id;

    // Create teams - some managed by multiUser, some by other
    const teams = await db.insert(teamsTable)
      .values([
        {
          name: 'Team A',
          description: 'Managed by multiUser',
          manager_id: multiUserId
        },
        {
          name: 'Team B',
          description: 'Managed by other, multiUser is member',
          manager_id: otherUserId
        },
        {
          name: 'Team C',
          description: 'Managed by other, no relation to multiUser',
          manager_id: otherUserId
        }
      ])
      .returning()
      .execute();

    // Add multiUser as member to Team B
    await db.insert(teamMembersTable)
      .values({
        team_id: teams[1].id,
        user_id: multiUserId
      })
      .execute();

    const result = await getUserTeams(multiUserId);

    expect(result).toHaveLength(2);
    const teamNames = result.map(t => t.name).sort();
    expect(teamNames).toEqual(['Team A', 'Team B']);
    
    // Verify one is managed, one is membership
    const teamA = result.find(t => t.name === 'Team A');
    const teamB = result.find(t => t.name === 'Team B');
    expect(teamA?.manager_id).toBe(multiUserId);
    expect(teamB?.manager_id).toBe(otherUserId);
  });

  it('should handle user that does not exist gracefully', async () => {
    const nonExistentUserId = 9999;
    
    const result = await getUserTeams(nonExistentUserId);
    
    expect(result).toEqual([]);
  });

  it('should preserve all team fields correctly', async () => {
    // Create user
    const users = await db.insert(usersTable)
      .values({
        email: 'manager@test.com',
        username: 'manager',
        password_hash: 'hash',
        first_name: 'Manager',
        last_name: 'User',
        role: 'MANAGER'
      })
      .returning()
      .execute();

    const userId = users[0].id;

    // Create team with all fields
    await db.insert(teamsTable)
      .values({
        name: 'Complete Team',
        description: 'Team with all fields populated',
        manager_id: userId
      })
      .execute();

    const result = await getUserTeams(userId);

    expect(result).toHaveLength(1);
    const team = result[0];
    
    // Verify all fields are present and correct types
    expect(typeof team.id).toBe('number');
    expect(typeof team.name).toBe('string');
    expect(typeof team.description).toBe('string');
    expect(typeof team.manager_id).toBe('number');
    expect(team.created_at).toBeInstanceOf(Date);
    expect(team.updated_at).toBeInstanceOf(Date);
    
    expect(team.name).toBe('Complete Team');
    expect(team.description).toBe('Team with all fields populated');
    expect(team.manager_id).toBe(userId);
  });
});