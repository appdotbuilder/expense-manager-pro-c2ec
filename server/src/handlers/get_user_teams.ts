import { db } from '../db';
import { teamsTable, teamMembersTable } from '../db/schema';
import { type Team } from '../schema';
import { eq, or } from 'drizzle-orm';

export async function getUserTeams(userId: number): Promise<Team[]> {
  try {
    // Query teams where user is either the manager or a member
    // Using a union approach to get all teams the user has access to
    
    // First, get teams where user is the manager
    const managedTeams = await db.select()
      .from(teamsTable)
      .where(eq(teamsTable.manager_id, userId))
      .execute();

    // Then get teams where user is a member
    const memberTeams = await db.select({
      id: teamsTable.id,
      name: teamsTable.name,
      description: teamsTable.description,
      manager_id: teamsTable.manager_id,
      created_at: teamsTable.created_at,
      updated_at: teamsTable.updated_at
    })
      .from(teamsTable)
      .innerJoin(teamMembersTable, eq(teamsTable.id, teamMembersTable.team_id))
      .where(eq(teamMembersTable.user_id, userId))
      .execute();

    // Combine and deduplicate results
    const allTeams = [...managedTeams, ...memberTeams];
    const uniqueTeams = allTeams.filter((team, index, self) => 
      index === self.findIndex(t => t.id === team.id)
    );

    return uniqueTeams;
  } catch (error) {
    console.error('Failed to fetch user teams:', error);
    throw error;
  }
}