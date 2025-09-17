import { db } from '../db';
import { usersTable } from '../db/schema';
import { type ResetPasswordInput } from '../schema';
import { eq } from 'drizzle-orm';

export async function resetPassword(input: ResetPasswordInput): Promise<{ success: boolean; message: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    // Always return success to prevent email enumeration attacks
    // This is a security best practice - don't reveal if email exists
    if (users.length === 0) {
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      };
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      };
    }

    // Generate a secure reset token (in real implementation, use crypto.randomBytes)
    const resetToken = `reset_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    // Set expiry to 1 hour from now
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    // Update user with reset token and expiry
    await db.update(usersTable)
      .set({
        password_reset_token: resetToken,
        password_reset_expires: resetExpiry,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, user.id))
      .execute();

    // In a real implementation, you would send an email here
    // await sendPasswordResetEmail(user.email, resetToken);

    return {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    };
  } catch (error) {
    console.error('Password reset failed:', error);
    throw error;
  }
}