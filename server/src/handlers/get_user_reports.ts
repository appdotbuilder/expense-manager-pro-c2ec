import { db } from '../db';
import { reportsTable } from '../db/schema';
import { type Report } from '../schema';
import { eq, desc, or, isNull, gt } from 'drizzle-orm';

export const getUserReports = async (userId: number): Promise<Report[]> => {
  try {
    // Query reports for the user, filtering out expired ones
    const results = await db.select()
      .from(reportsTable)
      .where(
        eq(reportsTable.user_id, userId)
      )
      .orderBy(desc(reportsTable.generated_at))
      .execute();

    // Filter out expired reports and return only active ones
    const now = new Date();
    
    return results
      .filter(report => 
        report.expires_at === null || report.expires_at > now
      )
      .map(report => ({
        ...report,
        // No numeric conversions needed - all fields are already proper types
        // generated_at and expires_at are already Date objects from timestamp columns
      }));
  } catch (error) {
    console.error('Get user reports failed:', error);
    throw error;
  }
};