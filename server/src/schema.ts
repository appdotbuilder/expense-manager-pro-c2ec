import { z } from 'zod';

// Enum definitions
export const userRoleSchema = z.enum(['ADMIN', 'MANAGER', 'USER']);
export const expenseStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export const expenseCategorySchema = z.enum([
  'FOOD_DINING',
  'TRANSPORTATION',
  'SHOPPING',
  'ENTERTAINMENT',
  'BILLS_UTILITIES',
  'HEALTHCARE',
  'EDUCATION',
  'TRAVEL',
  'BUSINESS',
  'OTHERS'
]);
export const notificationTypeSchema = z.enum([
  'BUDGET_ALERT',
  'EXPENSE_APPROVAL',
  'EXPENSE_REMINDER',
  'SYSTEM_UPDATE'
]);
export const reportTypeSchema = z.enum(['MONTHLY', 'YEARLY', 'CUSTOM']);

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  username: z.string(),
  password_hash: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: userRoleSchema,
  avatar_url: z.string().nullable(),
  email_verified: z.boolean(),
  email_verification_token: z.string().nullable(),
  password_reset_token: z.string().nullable(),
  password_reset_expires: z.coerce.date().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Team schema
export const teamSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  manager_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Team = z.infer<typeof teamSchema>;

// Team member schema
export const teamMemberSchema = z.object({
  id: z.number(),
  team_id: z.number(),
  user_id: z.number(),
  joined_at: z.coerce.date()
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

// Expense schema
export const expenseSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  team_id: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  amount: z.number(),
  category: expenseCategorySchema,
  receipt_url: z.string().nullable(),
  status: expenseStatusSchema,
  approved_by: z.number().nullable(),
  approved_at: z.coerce.date().nullable(),
  expense_date: z.coerce.date(),
  is_recurring: z.boolean(),
  recurring_frequency: z.string().nullable(), // 'weekly', 'monthly', 'yearly'
  tags: z.string().nullable(), // JSON array as string
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Expense = z.infer<typeof expenseSchema>;

// Budget schema
export const budgetSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  category: expenseCategorySchema,
  monthly_limit: z.number(),
  current_spent: z.number(),
  alert_threshold: z.number(), // percentage (0-100)
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Budget = z.infer<typeof budgetSchema>;

// Notification schema
export const notificationSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  is_read: z.boolean(),
  related_expense_id: z.number().nullable(),
  created_at: z.coerce.date()
});

export type Notification = z.infer<typeof notificationSchema>;

// Report schema
export const reportSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  type: reportTypeSchema,
  title: z.string(),
  filters: z.string(), // JSON string with filter criteria
  generated_at: z.coerce.date(),
  file_url: z.string().nullable(),
  expires_at: z.coerce.date().nullable()
});

export type Report = z.infer<typeof reportSchema>;

// Input schemas for user operations
export const registerUserInputSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  role: userRoleSchema.optional().default('USER')
});

export type RegisterUserInput = z.infer<typeof registerUserInputSchema>;

export const loginUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginUserInput = z.infer<typeof loginUserInputSchema>;

export const updateUserProfileInputSchema = z.object({
  id: z.number(),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().nullable().optional()
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileInputSchema>;

export const resetPasswordInputSchema = z.object({
  email: z.string().email()
});

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

// Input schemas for expense operations
export const createExpenseInputSchema = z.object({
  user_id: z.number(),
  team_id: z.number().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  amount: z.number().positive(),
  category: expenseCategorySchema,
  receipt_url: z.string().nullable().optional(),
  expense_date: z.coerce.date(),
  is_recurring: z.boolean().optional().default(false),
  recurring_frequency: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;

export const updateExpenseInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  amount: z.number().positive().optional(),
  category: expenseCategorySchema.optional(),
  receipt_url: z.string().nullable().optional(),
  expense_date: z.coerce.date().optional(),
  is_recurring: z.boolean().optional(),
  recurring_frequency: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseInputSchema>;

export const approveExpenseInputSchema = z.object({
  expense_id: z.number(),
  approved_by: z.number(),
  status: z.enum(['APPROVED', 'REJECTED'])
});

export type ApproveExpenseInput = z.infer<typeof approveExpenseInputSchema>;

// Input schemas for budget operations
export const createBudgetInputSchema = z.object({
  user_id: z.number(),
  category: expenseCategorySchema,
  monthly_limit: z.number().positive(),
  alert_threshold: z.number().min(0).max(100).optional().default(80)
});

export type CreateBudgetInput = z.infer<typeof createBudgetInputSchema>;

export const updateBudgetInputSchema = z.object({
  id: z.number(),
  monthly_limit: z.number().positive().optional(),
  alert_threshold: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional()
});

export type UpdateBudgetInput = z.infer<typeof updateBudgetInputSchema>;

// Input schemas for team operations
export const createTeamInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  manager_id: z.number()
});

export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

export const addTeamMemberInputSchema = z.object({
  team_id: z.number(),
  user_id: z.number()
});

export type AddTeamMemberInput = z.infer<typeof addTeamMemberInputSchema>;

// Input schemas for notifications
export const createNotificationInputSchema = z.object({
  user_id: z.number(),
  type: notificationTypeSchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1),
  related_expense_id: z.number().nullable().optional()
});

export type CreateNotificationInput = z.infer<typeof createNotificationInputSchema>;

export const markNotificationReadInputSchema = z.object({
  notification_id: z.number(),
  user_id: z.number()
});

export type MarkNotificationReadInput = z.infer<typeof markNotificationReadInputSchema>;

// Input schemas for reports
export const generateReportInputSchema = z.object({
  user_id: z.number(),
  type: reportTypeSchema,
  title: z.string().min(1).max(200),
  date_from: z.coerce.date(),
  date_to: z.coerce.date(),
  categories: z.array(expenseCategorySchema).optional(),
  include_team_expenses: z.boolean().optional().default(false)
});

export type GenerateReportInput = z.infer<typeof generateReportInputSchema>;

// Query schemas
export const getUserExpensesInputSchema = z.object({
  user_id: z.number(),
  category: expenseCategorySchema.optional(),
  status: expenseStatusSchema.optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
  search: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20)
});

export type GetUserExpensesInput = z.infer<typeof getUserExpensesInputSchema>;

export const getDashboardDataInputSchema = z.object({
  user_id: z.number(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2020).optional()
});

export type GetDashboardDataInput = z.infer<typeof getDashboardDataInputSchema>;

// Response schemas
export const authResponseSchema = z.object({
  user: userSchema.omit({ password_hash: true }),
  token: z.string()
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const dashboardStatsSchema = z.object({
  total_expenses: z.number(),
  monthly_spending: z.number(),
  budget_utilization: z.number(),
  category_breakdown: z.array(z.object({
    category: expenseCategorySchema,
    amount: z.number(),
    count: z.number()
  })),
  spending_trends: z.array(z.object({
    date: z.string(),
    amount: z.number()
  })),
  recent_expenses: z.array(expenseSchema),
  budget_alerts: z.array(z.object({
    category: expenseCategorySchema,
    current: z.number(),
    limit: z.number(),
    percentage: z.number()
  }))
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export const paginatedExpensesSchema = z.object({
  expenses: z.array(expenseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  total_pages: z.number()
});

export type PaginatedExpenses = z.infer<typeof paginatedExpensesSchema>;