import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, teamsTable, teamMembersTable } from '../db/schema';
import { type CreateTeamInput } from '../schema';
import { createTeam } from '../handlers/create_team';
import { eq } from 'drizzle-orm';


describe('createTeam', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create a test user
  const createTestUser = async (role: 'ADMIN' | 'MANAGER' | 'USER' = 'MANAGER', isActive = true) => {
    const result = await db.insert(usersTable)
      .values({
        email: `test-${Date.now()}-${Math.random()}@example.com`,
        username: `testuser_${Date.now()}_${Math.random()}`,
        password_hash: 'hashed_password_placeholder',
        first_name: 'Test',
        last_name: 'User',
        role,
        is_active: isActive
      })
      .returning()
      .execute();
    
    return result[0];
  };

  it('should create a team with a valid manager', async () => {
    const manager = await createTestUser('MANAGER');
    
    const testInput: CreateTeamInput = {
      name: 'Development Team',
      description: 'A team for software development',
      manager_id: manager.id
    };

    const result = await createTeam(testInput);

    // Validate team fields
    expect(result.name).toEqual('Development Team');
    expect(result.description).toEqual('A team for software development');
    expect(result.manager_id).toEqual(manager.id);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a team with admin as manager', async () => {
    const admin = await createTestUser('ADMIN');
    
    const testInput: CreateTeamInput = {
      name: 'Admin Team',
      description: 'Administrative team',
      manager_id: admin.id
    };

    const result = await createTeam(testInput);

    expect(result.name).toEqual('Admin Team');
    expect(result.manager_id).toEqual(admin.id);
  });

  it('should create team with null description when not provided', async () => {
    const manager = await createTestUser('MANAGER');
    
    const testInput: CreateTeamInput = {
      name: 'Marketing Team',
      manager_id: manager.id
    };

    const result = await createTeam(testInput);

    expect(result.name).toEqual('Marketing Team');
    expect(result.description).toBeNull();
    expect(result.manager_id).toEqual(manager.id);
  });

  it('should save team to database', async () => {
    const manager = await createTestUser('MANAGER');
    
    const testInput: CreateTeamInput = {
      name: 'Sales Team',
      description: 'Sales and marketing team',
      manager_id: manager.id
    };

    const result = await createTeam(testInput);

    // Query database to verify team was saved
    const teams = await db.select()
      .from(teamsTable)
      .where(eq(teamsTable.id, result.id))
      .execute();

    expect(teams).toHaveLength(1);
    expect(teams[0].name).toEqual('Sales Team');
    expect(teams[0].description).toEqual('Sales and marketing team');
    expect(teams[0].manager_id).toEqual(manager.id);
    expect(teams[0].created_at).toBeInstanceOf(Date);
  });

  it('should automatically add manager as team member', async () => {
    const manager = await createTestUser('MANAGER');
    
    const testInput: CreateTeamInput = {
      name: 'Operations Team',
      description: 'Operations management team',
      manager_id: manager.id
    };

    const result = await createTeam(testInput);

    // Verify manager was added as team member
    const teamMembers = await db.select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.team_id, result.id))
      .execute();

    expect(teamMembers).toHaveLength(1);
    expect(teamMembers[0].team_id).toEqual(result.id);
    expect(teamMembers[0].user_id).toEqual(manager.id);
    expect(teamMembers[0].joined_at).toBeInstanceOf(Date);
  });

  it('should throw error when manager does not exist', async () => {
    const testInput: CreateTeamInput = {
      name: 'Non-existent Manager Team',
      description: 'Team with non-existent manager',
      manager_id: 99999 // Non-existent user ID
    };

    await expect(createTeam(testInput)).rejects.toThrow(/manager not found/i);
  });

  it('should throw error when user is not a manager or admin', async () => {
    const regularUser = await createTestUser('USER');
    
    const testInput: CreateTeamInput = {
      name: 'Invalid Manager Team',
      description: 'Team with regular user as manager',
      manager_id: regularUser.id
    };

    await expect(createTeam(testInput)).rejects.toThrow(/does not have manager privileges/i);
  });

  it('should throw error when manager account is inactive', async () => {
    const inactiveManager = await createTestUser('MANAGER', false);
    
    const testInput: CreateTeamInput = {
      name: 'Inactive Manager Team',
      description: 'Team with inactive manager',
      manager_id: inactiveManager.id
    };

    await expect(createTeam(testInput)).rejects.toThrow(/manager account is not active/i);
  });

  it('should create multiple teams with same manager', async () => {
    const manager = await createTestUser('MANAGER');
    
    const team1Input: CreateTeamInput = {
      name: 'Team Alpha',
      description: 'First team',
      manager_id: manager.id
    };

    const team2Input: CreateTeamInput = {
      name: 'Team Beta',
      description: 'Second team',
      manager_id: manager.id
    };

    const team1 = await createTeam(team1Input);
    const team2 = await createTeam(team2Input);

    expect(team1.name).toEqual('Team Alpha');
    expect(team2.name).toEqual('Team Beta');
    expect(team1.manager_id).toEqual(manager.id);
    expect(team2.manager_id).toEqual(manager.id);
    expect(team1.id).not.toEqual(team2.id);

    // Verify manager is member of both teams
    const team1Members = await db.select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.team_id, team1.id))
      .execute();

    const team2Members = await db.select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.team_id, team2.id))
      .execute();

    expect(team1Members).toHaveLength(1);
    expect(team2Members).toHaveLength(1);
    expect(team1Members[0].user_id).toEqual(manager.id);
    expect(team2Members[0].user_id).toEqual(manager.id);
  });
});