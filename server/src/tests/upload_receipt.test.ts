import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { uploadReceipt } from '../handlers/upload_receipt';

// Test user data
const testUser = {
  email: 'test@example.com',
  username: 'testuser',
  password_hash: 'hashed_password',
  first_name: 'Test',
  last_name: 'User',
  role: 'USER' as const
};

// Helper function to create test file buffer
const createTestFile = (size: number = 1024, mimetype: string = 'image/jpeg') => {
  return {
    buffer: Buffer.alloc(size, 'test data'),
    filename: 'test-receipt.jpg',
    mimetype
  };
};

describe('uploadReceipt', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId: number;

  beforeEach(async () => {
    // Create test user
    const result = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = result[0].id;
  });

  it('should upload a valid JPEG receipt', async () => {
    const file = createTestFile(1024, 'image/jpeg');
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(true);
    expect(result.file_url).toMatch(/^https:\/\/storage\.example\.com\/receipts\/receipt_\d+_\d+_[a-z0-9]+\.jpg$/);
    expect(result.message).toBe('Receipt uploaded successfully');
  });

  it('should upload a valid PNG receipt', async () => {
    const file = createTestFile(1024, 'image/png');
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(true);
    expect(result.file_url).toMatch(/^https:\/\/storage\.example\.com\/receipts\/receipt_\d+_\d+_[a-z0-9]+\.png$/);
    expect(result.message).toBe('Receipt uploaded successfully');
  });

  it('should upload a valid PDF receipt', async () => {
    const file = createTestFile(1024, 'application/pdf');
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(true);
    expect(result.file_url).toMatch(/^https:\/\/storage\.example\.com\/receipts\/receipt_\d+_\d+_[a-z0-9]+\.pdf$/);
    expect(result.message).toBe('Receipt uploaded successfully');
  });

  it('should generate unique filenames for multiple uploads', async () => {
    const file1 = createTestFile(1024, 'image/jpeg');
    const file2 = createTestFile(1024, 'image/jpeg');
    
    const result1 = await uploadReceipt(userId, file1);
    const result2 = await uploadReceipt(userId, file2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.file_url).not.toBe(result2.file_url);
  });

  it('should reject invalid file type', async () => {
    const file = createTestFile(1024, 'text/plain');
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(false);
    expect(result.file_url).toBe('');
    expect(result.message).toMatch(/Upload failed: Invalid file type/);
  });

  it('should reject file that is too large', async () => {
    const file = createTestFile(6 * 1024 * 1024, 'image/jpeg'); // 6MB - exceeds 5MB limit
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(false);
    expect(result.file_url).toBe('');
    expect(result.message).toMatch(/Upload failed: File size too large/);
  });

  it('should reject empty file', async () => {
    const file = createTestFile(0, 'image/jpeg'); // Empty file
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(false);
    expect(result.file_url).toBe('');
    expect(result.message).toMatch(/Upload failed: File is empty/);
  });

  it('should reject upload for non-existent user', async () => {
    const file = createTestFile(1024, 'image/jpeg');
    const nonExistentUserId = 99999;
    
    const result = await uploadReceipt(nonExistentUserId, file);

    expect(result.success).toBe(false);
    expect(result.file_url).toBe('');
    expect(result.message).toMatch(/Upload failed: User with ID 99999 not found/);
  });

  it('should reject upload for inactive user', async () => {
    // Create inactive user
    const inactiveUser = {
      ...testUser,
      email: 'inactive@example.com',
      username: 'inactiveuser',
      is_active: false
    };

    const result = await db.insert(usersTable)
      .values(inactiveUser)
      .returning()
      .execute();
    const inactiveUserId = result[0].id;

    const file = createTestFile(1024, 'image/jpeg');
    
    const uploadResult = await uploadReceipt(inactiveUserId, file);

    expect(uploadResult.success).toBe(false);
    expect(uploadResult.file_url).toBe('');
    expect(uploadResult.message).toMatch(/Upload failed: User account is not active/);
  });

  it('should handle all supported image formats', async () => {
    const supportedFormats = [
      { mimetype: 'image/jpeg', extension: 'jpg' },
      { mimetype: 'image/jpg', extension: 'jpg' },
      { mimetype: 'image/png', extension: 'png' },
      { mimetype: 'image/gif', extension: 'gif' },
      { mimetype: 'image/webp', extension: 'webp' }
    ];

    for (const format of supportedFormats) {
      const file = createTestFile(1024, format.mimetype);
      const result = await uploadReceipt(userId, file);

      expect(result.success).toBe(true);
      expect(result.file_url).toMatch(new RegExp(`\\.${format.extension}$`));
    }
  });

  it('should handle maximum allowed file size', async () => {
    const file = createTestFile(5 * 1024 * 1024, 'image/jpeg'); // Exactly 5MB
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(true);
    expect(result.file_url).toMatch(/\.jpg$/);
    expect(result.message).toBe('Receipt uploaded successfully');
  });

  it('should include user ID in filename', async () => {
    const file = createTestFile(1024, 'image/jpeg');
    
    const result = await uploadReceipt(userId, file);

    expect(result.success).toBe(true);
    expect(result.file_url).toMatch(new RegExp(`receipt_${userId}_`));
  });

  it('should handle various unsupported file types', async () => {
    const unsupportedTypes = [
      'text/plain',
      'application/json',
      'video/mp4',
      'audio/mp3',
      'application/zip',
      'text/csv'
    ];

    for (const mimetype of unsupportedTypes) {
      const file = createTestFile(1024, mimetype);
      const result = await uploadReceipt(userId, file);

      expect(result.success).toBe(false);
      expect(result.file_url).toBe('');
      expect(result.message).toMatch(/Upload failed: Invalid file type/);
    }
  });
});