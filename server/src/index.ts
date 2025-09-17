import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Import schemas
import { z } from 'zod';
import {
  registerUserInputSchema,
  loginUserInputSchema,
  resetPasswordInputSchema,
  updateUserProfileInputSchema,
  createExpenseInputSchema,
  updateExpenseInputSchema,
  approveExpenseInputSchema,
  getUserExpensesInputSchema,
  createBudgetInputSchema,
  updateBudgetInputSchema,
  getDashboardDataInputSchema,
  createTeamInputSchema,
  addTeamMemberInputSchema,
  createNotificationInputSchema,
  markNotificationReadInputSchema,
  generateReportInputSchema
} from './schema';

// Import handlers
import { registerUser } from './handlers/register_user';
import { loginUser } from './handlers/login_user';
import { resetPassword } from './handlers/reset_password';
import { updateUserProfile } from './handlers/update_user_profile';
import { createExpense } from './handlers/create_expense';
import { getUserExpenses } from './handlers/get_user_expenses';
import { updateExpense } from './handlers/update_expense';
import { approveExpense } from './handlers/approve_expense';
import { deleteExpense } from './handlers/delete_expense';
import { createBudget } from './handlers/create_budget';
import { getUserBudgets } from './handlers/get_user_budgets';
import { updateBudget } from './handlers/update_budget';
import { getDashboardData } from './handlers/get_dashboard_data';
import { createTeam } from './handlers/create_team';
import { addTeamMember } from './handlers/add_team_member';
import { getTeamExpenses } from './handlers/get_team_expenses';
import { getUserTeams } from './handlers/get_user_teams';
import { createNotification } from './handlers/create_notification';
import { getUserNotifications } from './handlers/get_user_notifications';
import { markNotificationRead } from './handlers/mark_notification_read';
import { generateReport } from './handlers/generate_report';
import { getUserReports } from './handlers/get_user_reports';
import { searchExpenses } from './handlers/search_expenses';
import { getExpenseAnalytics } from './handlers/get_expense_analytics';
import { uploadReceipt } from './handlers/upload_receipt';
import { getPendingApprovals } from './handlers/get_pending_approvals';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  register: publicProcedure
    .input(registerUserInputSchema)
    .mutation(({ input }) => registerUser(input)),

  login: publicProcedure
    .input(loginUserInputSchema)
    .mutation(({ input }) => loginUser(input)),

  resetPassword: publicProcedure
    .input(resetPasswordInputSchema)
    .mutation(({ input }) => resetPassword(input)),

  updateProfile: publicProcedure
    .input(updateUserProfileInputSchema)
    .mutation(({ input }) => updateUserProfile(input)),

  // Expense management routes
  createExpense: publicProcedure
    .input(createExpenseInputSchema)
    .mutation(({ input }) => createExpense(input)),

  getUserExpenses: publicProcedure
    .input(getUserExpensesInputSchema)
    .query(({ input }) => getUserExpenses(input)),

  updateExpense: publicProcedure
    .input(updateExpenseInputSchema)
    .mutation(({ input }) => updateExpense(input)),

  approveExpense: publicProcedure
    .input(approveExpenseInputSchema)
    .mutation(({ input }) => approveExpense(input)),

  deleteExpense: publicProcedure
    .input(z.object({ expenseId: z.number(), userId: z.number() }))
    .mutation(({ input }) => deleteExpense(input.expenseId, input.userId)),

  // Budget management routes
  createBudget: publicProcedure
    .input(createBudgetInputSchema)
    .mutation(({ input }) => createBudget(input)),

  getUserBudgets: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getUserBudgets(input.userId)),

  updateBudget: publicProcedure
    .input(updateBudgetInputSchema)
    .mutation(({ input }) => updateBudget(input)),

  // Dashboard routes
  getDashboard: publicProcedure
    .input(getDashboardDataInputSchema)
    .query(({ input }) => getDashboardData(input)),

  // Team management routes
  createTeam: publicProcedure
    .input(createTeamInputSchema)
    .mutation(({ input }) => createTeam(input)),

  addTeamMember: publicProcedure
    .input(addTeamMemberInputSchema)
    .mutation(({ input }) => addTeamMember(input)),

  getTeamExpenses: publicProcedure
    .input(z.object({ teamId: z.number(), managerId: z.number() }))
    .query(({ input }) => getTeamExpenses(input.teamId, input.managerId)),

  getUserTeams: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getUserTeams(input.userId)),

  // Notification routes
  createNotification: publicProcedure
    .input(createNotificationInputSchema)
    .mutation(({ input }) => createNotification(input)),

  getUserNotifications: publicProcedure
    .input(z.object({ userId: z.number(), unreadOnly: z.boolean().optional() }))
    .query(({ input }) => getUserNotifications(input.userId, input.unreadOnly)),

  markNotificationRead: publicProcedure
    .input(markNotificationReadInputSchema)
    .mutation(({ input }) => markNotificationRead(input)),

  // Report generation routes
  generateReport: publicProcedure
    .input(generateReportInputSchema)
    .mutation(({ input }) => generateReport(input)),

  getUserReports: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getUserReports(input.userId)),

  // Search and analytics routes
  searchExpenses: publicProcedure
    .input(z.object({
      userId: z.number(),
      searchTerm: z.string(),
      filters: z.object({
        category: z.string().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional()
      }).optional()
    }))
    .query(({ input }) => searchExpenses(input.userId, input.searchTerm, input.filters)),

  getExpenseAnalytics: publicProcedure
    .input(z.object({
      userId: z.number(),
      period: z.enum(['month', 'year', 'custom']),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional()
    }))
    .query(({ input }) => getExpenseAnalytics(input.userId, input.period, input.startDate, input.endDate)),

  // File upload routes
  uploadReceipt: publicProcedure
    .input(z.object({
      userId: z.number(),
      filename: z.string(),
      mimetype: z.string(),
      buffer: z.string() // Base64 encoded file data
    }))
    .mutation(({ input }) => uploadReceipt(input.userId, {
      buffer: Buffer.from(input.buffer, 'base64'),
      filename: input.filename,
      mimetype: input.mimetype
    })),

  // Manager-specific routes
  getPendingApprovals: publicProcedure
    .input(z.object({ managerId: z.number() }))
    .query(({ input }) => getPendingApprovals(input.managerId)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();