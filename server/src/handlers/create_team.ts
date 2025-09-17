import { db } from '../db';
import { teamsTable, teamMembersTable, usersTable } from '../db/schema';
import { type CreateTeamInput, type Team } from '../schema';
import { eq } from 'drizzle-orm';

export const createTeam = async (input: CreateTeamInput): Promise<Team> => {
  try {
    // First, validate that the manager exists and has appropriate role
    const manager = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.manager_id))
      .execute();

    if (manager.length === 0) {
      throw new Error('Manager not found');
    }

    if (manager[0].role !== 'MANAGER' && manager[0].role !== 'ADMIN') {
      throw new Error('User does not have manager privileges');
    }

    if (!manager[0].is_active) {
      throw new Error('Manager account is not active');
    }

    // Create the team record
    const result = await db.insert(teamsTable)
      .values({
        name: input.name,
        description: input.description || null,
        manager_id: input.manager_id
      })
      .returning()
      .execute();

    const team = result[0];

    // Automatically add the manager as a team member
    await db.insert(teamMembersTable)
      .values({
        team_id: team.id,
        user_id: input.manager_id
      })
      .execute();

    return team;
  } catch (error) {
    console.error('Team creation failed:', error);
    throw error;
  }
};