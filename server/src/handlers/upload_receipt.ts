import { db } from '../db';
import { usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';

// Constants for file validation
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf'
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

const MIME_TYPE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

export async function uploadReceipt(
  userId: number,
  file: { buffer: Buffer; filename: string; mimetype: string }
): Promise<{ success: boolean; file_url: string; message: string }> {
  try {
    // Validate user exists
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const user = users[0];
    if (!user.is_active) {
      throw new Error('User account is not active');
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }

    // Validate file size
    if (file.buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size too large. Maximum size allowed: ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Validate file buffer is not empty
    if (file.buffer.length === 0) {
      throw new Error('File is empty');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const extension = MIME_TYPE_EXTENSIONS[file.mimetype as keyof typeof MIME_TYPE_EXTENSIONS];
    const uniqueFilename = `receipt_${userId}_${timestamp}_${randomId}.${extension}`;

    // Simulate cloud storage upload
    // In a real implementation, this would upload to AWS S3, Google Cloud Storage, etc.
    const baseStorageUrl = process.env['STORAGE_BASE_URL'] || 'https://storage.example.com';
    const file_url = `${baseStorageUrl}/receipts/${uniqueFilename}`;

    // Log successful upload (in real implementation, actual upload would happen here)
    console.log(`Receipt uploaded for user ${userId}: ${file_url} (${file.buffer.length} bytes)`);

    return {
      success: true,
      file_url,
      message: 'Receipt uploaded successfully'
    };

  } catch (error) {
    console.error('Receipt upload failed:', error);
    
    // Return structured error response
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      file_url: '',
      message: `Upload failed: ${errorMessage}`
    };
  }
}