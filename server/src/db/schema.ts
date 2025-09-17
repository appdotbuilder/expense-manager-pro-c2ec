import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean,
  pgEnum,
  foreignKey
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enum definitions
export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'MANAGER', 'USER']);
export const expenseStatusEnum = pgEnum('expense_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const expenseCategoryEnum = pgEnum('expense_category', [
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
export const notificationTypeEnum = pgEnum('notification_type', [
  'BUDGET_ALERT',
  'EXPENSE_APPROVAL',
  'EXPENSE_REMINDER',
  'SYSTEM_UPDATE'
]);
export const reportTypeEnum = pgEnum('report_type', ['MONTHLY', 'YEARLY', 'CUSTOM']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  role: userRoleEnum('role').notNull().default('USER'),
  avatar_url: text('avatar_url'),
  email_verified: boolean('email_verified').notNull().default(false),
  email_verification_token: text('email_verification_token'),
  password_reset_token: text('password_reset_token'),
  password_reset_expires: timestamp('password_reset_expires'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Teams table
export const teamsTable = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  manager_id: integer('manager_id').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Team members table
export const teamMembersTable = pgTable('team_members', {
  id: serial('id').primaryKey(),
  team_id: integer('team_id').notNull().references(() => teamsTable.id, { onDelete: 'cascade' }),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
});

// Expenses table
export const expensesTable = pgTable('expenses', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  team_id: integer('team_id').references(() => teamsTable.id),
  title: text('title').notNull(),
  description: text('description'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  category: expenseCategoryEnum('category').notNull(),
  receipt_url: text('receipt_url'),
  status: expenseStatusEnum('status').notNull().default('PENDING'),
  approved_by: integer('approved_by').references(() => usersTable.id),
  approved_at: timestamp('approved_at'),
  expense_date: timestamp('expense_date').notNull(),
  is_recurring: boolean('is_recurring').notNull().default(false),
  recurring_frequency: text('recurring_frequency'), // 'weekly', 'monthly', 'yearly'
  tags: text('tags'), // JSON array as string
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Budgets table
export const budgetsTable = pgTable('budgets', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  category: expenseCategoryEnum('category').notNull(),
  monthly_limit: numeric('monthly_limit', { precision: 10, scale: 2 }).notNull(),
  current_spent: numeric('current_spent', { precision: 10, scale: 2 }).notNull().default('0'),
  alert_threshold: integer('alert_threshold').notNull().default(80), // percentage (0-100)
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Notifications table
export const notificationsTable = pgTable('notifications', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  is_read: boolean('is_read').notNull().default(false),
  related_expense_id: integer('related_expense_id').references(() => expensesTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Reports table
export const reportsTable = pgTable('reports', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  type: reportTypeEnum('type').notNull(),
  title: text('title').notNull(),
  filters: text('filters').notNull(), // JSON string with filter criteria
  generated_at: timestamp('generated_at').defaultNow().notNull(),
  file_url: text('file_url'),
  expires_at: timestamp('expires_at'),
});

// Relations
export const usersRelations = relations(usersTable, ({ many, one }) => ({
  expenses: many(expensesTable),
  budgets: many(budgetsTable),
  notifications: many(notificationsTable),
  reports: many(reportsTable),
  managedTeams: many(teamsTable),
  teamMemberships: many(teamMembersTable),
  approvedExpenses: many(expensesTable, { relationName: 'approvedBy' }),
}));

export const teamsRelations = relations(teamsTable, ({ many, one }) => ({
  manager: one(usersTable, {
    fields: [teamsTable.manager_id],
    references: [usersTable.id],
  }),
  members: many(teamMembersTable),
  expenses: many(expensesTable),
}));

export const teamMembersRelations = relations(teamMembersTable, ({ one }) => ({
  team: one(teamsTable, {
    fields: [teamMembersTable.team_id],
    references: [teamsTable.id],
  }),
  user: one(usersTable, {
    fields: [teamMembersTable.user_id],
    references: [usersTable.id],
  }),
}));

export const expensesRelations = relations(expensesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [expensesTable.user_id],
    references: [usersTable.id],
  }),
  team: one(teamsTable, {
    fields: [expensesTable.team_id],
    references: [teamsTable.id],
  }),
  approvedBy: one(usersTable, {
    fields: [expensesTable.approved_by],
    references: [usersTable.id],
    relationName: 'approvedBy',
  }),
}));

export const budgetsRelations = relations(budgetsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [budgetsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const notificationsRelations = relations(notificationsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [notificationsTable.user_id],
    references: [usersTable.id],
  }),
  relatedExpense: one(expensesTable, {
    fields: [notificationsTable.related_expense_id],
    references: [expensesTable.id],
  }),
}));

export const reportsRelations = relations(reportsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [reportsTable.user_id],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Team = typeof teamsTable.$inferSelect;
export type NewTeam = typeof teamsTable.$inferInsert;

export type TeamMember = typeof teamMembersTable.$inferSelect;
export type NewTeamMember = typeof teamMembersTable.$inferInsert;

export type Expense = typeof expensesTable.$inferSelect;
export type NewExpense = typeof expensesTable.$inferInsert;

export type Budget = typeof budgetsTable.$inferSelect;
export type NewBudget = typeof budgetsTable.$inferInsert;

export type Notification = typeof notificationsTable.$inferSelect;
export type NewNotification = typeof notificationsTable.$inferInsert;

export type Report = typeof reportsTable.$inferSelect;
export type NewReport = typeof reportsTable.$inferInsert;

// Export all tables for relation queries
export const tables = {
  users: usersTable,
  teams: teamsTable,
  teamMembers: teamMembersTable,
  expenses: expensesTable,
  budgets: budgetsTable,
  notifications: notificationsTable,
  reports: reportsTable,
};