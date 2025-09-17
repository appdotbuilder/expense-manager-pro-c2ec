import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, teamsTable, teamMembersTable } from '../db/schema';
import { type AddTeamMemberInput } from '../schema';
import { addTeamMember } from '../handlers/add_team_member';
import { eq, and } from 'drizzle-orm';

describe('addTeamMember', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testManager: any;
  let testTeam: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user@test.com',
          username: 'testuser',
          password_hash: 'hashed',
          first_name: 'Test',
          last_name: 'User',
          role: 'USER'
        },
        {
          email: 'manager@test.com',
          username: 'manager',
          password_hash: 'hashed',
          first_name: 'Team',
          last_name: 'Manager',
          role: 'MANAGER'
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    testManager = users[1];

    // Create test team
    const teams = await db.insert(teamsTable)
      .values({
        name: 'Test Team',
        description: 'A team for testing',
        manager_id: testManager.id
      })
      .returning()
      .execute();

    testTeam = teams[0];
  });

  it('should add a user to a team successfully', async () => {
    const input: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: testUser.id
    };

    const result = await addTeamMember(input);

    expect(result.team_id).toEqual(testTeam.id);
    expect(result.user_id).toEqual(testUser.id);
    expect(result.id).toBeDefined();
    expect(result.joined_at).toBeInstanceOf(Date);
  });

  it('should save team member to database', async () => {
    const input: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: testUser.id
    };

    const result = await addTeamMember(input);

    // Verify the member was saved to database
    const teamMembers = await db.select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.id, result.id))
      .execute();

    expect(teamMembers).toHaveLength(1);
    expect(teamMembers[0].team_id).toEqual(testTeam.id);
    expect(teamMembers[0].user_id).toEqual(testUser.id);
    expect(teamMembers[0].joined_at).toBeInstanceOf(Date);
  });

  it('should throw error when team does not exist', async () => {
    const input: AddTeamMemberInput = {
      team_id: 99999,
      user_id: testUser.id
    };

    await expect(addTeamMember(input)).rejects.toThrow(/team not found/i);
  });

  it('should throw error when user does not exist', async () => {
    const input: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: 99999
    };

    await expect(addTeamMember(input)).rejects.toThrow(/user not found/i);
  });

  it('should throw error when user is already a team member', async () => {
    const input: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: testUser.id
    };

    // Add user to team first time
    await addTeamMember(input);

    // Try to add the same user again
    await expect(addTeamMember(input)).rejects.toThrow(/already a member/i);
  });

  it('should allow adding multiple different users to the same team', async () => {
    // Create another user
    const anotherUser = await db.insert(usersTable)
      .values({
        email: 'another@test.com',
        username: 'another',
        password_hash: 'hashed',
        first_name: 'Another',
        last_name: 'User',
        role: 'USER'
      })
      .returning()
      .execute();

    const input1: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: testUser.id
    };

    const input2: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: anotherUser[0].id
    };

    // Add both users to the team
    const result1 = await addTeamMember(input1);
    const result2 = await addTeamMember(input2);

    expect(result1.user_id).toEqual(testUser.id);
    expect(result2.user_id).toEqual(anotherUser[0].id);
    expect(result1.team_id).toEqual(testTeam.id);
    expect(result2.team_id).toEqual(testTeam.id);

    // Verify both members exist in database
    const teamMembers = await db.select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.team_id, testTeam.id))
      .execute();

    expect(teamMembers).toHaveLength(2);
  });

  it('should allow adding the same user to different teams', async () => {
    // Create another team
    const anotherTeam = await db.insert(teamsTable)
      .values({
        name: 'Another Team',
        description: 'Another team for testing',
        manager_id: testManager.id
      })
      .returning()
      .execute();

    const input1: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: testUser.id
    };

    const input2: AddTeamMemberInput = {
      team_id: anotherTeam[0].id,
      user_id: testUser.id
    };

    // Add user to both teams
    const result1 = await addTeamMember(input1);
    const result2 = await addTeamMember(input2);

    expect(result1.team_id).toEqual(testTeam.id);
    expect(result2.team_id).toEqual(anotherTeam[0].id);
    expect(result1.user_id).toEqual(testUser.id);
    expect(result2.user_id).toEqual(testUser.id);

    // Verify user is member of both teams
    const userTeamMemberships = await db.select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.user_id, testUser.id))
      .execute();

    expect(userTeamMemberships).toHaveLength(2);
  });

  it('should handle database constraint violations gracefully', async () => {
    const input: AddTeamMemberInput = {
      team_id: testTeam.id,
      user_id: testUser.id
    };

    // First insertion should succeed
    await addTeamMember(input);

    // Second insertion should be caught by our duplicate check
    await expect(addTeamMember(input)).rejects.toThrow(/already a member/i);
  });
});