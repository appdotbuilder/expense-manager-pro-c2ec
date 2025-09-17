import { db } from '../db';
import { teamMembersTable, teamsTable, usersTable } from '../db/schema';
import { type AddTeamMemberInput, type TeamMember } from '../schema';
import { eq, and } from 'drizzle-orm';

export const addTeamMember = async (input: AddTeamMemberInput): Promise<TeamMember> => {
  try {
    // Check if team exists
    const team = await db.select()
      .from(teamsTable)
      .where(eq(teamsTable.id, input.team_id))
      .execute();

    if (team.length === 0) {
      throw new Error('Team not found');
    }

    // Check if user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Check if user is already a member of the team
    const existingMember = await db.select()
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.team_id, input.team_id),
          eq(teamMembersTable.user_id, input.user_id)
        )
      )
      .execute();

    if (existingMember.length > 0) {
      throw new Error('User is already a member of this team');
    }

    // Add user to team
    const result = await db.insert(teamMembersTable)
      .values({
        team_id: input.team_id,
        user_id: input.user_id
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Add team member failed:', error);
    throw error;
  }
};