import { z } from 'zod'

export const createAccountSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().optional(),
  isVatEnabled: z.boolean().optional(),
  description: z.string().optional()
})

export const journalLineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  debit: z.number().min(0, 'Debit cannot be negative'),
  credit: z.number().min(0, 'Credit cannot be negative'),
  memo: z.string().optional()
}).refine(
  line => (line.debit > 0) !== (line.credit > 0),
  { message: 'A line cannot have both debit and credit' }
)

export const postJournalEntrySchema = z.object({
  description: z.string().min(1, 'Description is required'),
  sourceModule: z.string().min(1, 'Source module is required'),
  sourceId: z.string().optional(),
  reference: z.string().optional(),
  date: z.string().optional(),
  lines: z.array(journalLineSchema).min(2, 'Journal entry must have at least 2 lines')
})

export const openingBalanceLineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  amount: z.number().min(0, 'Amount must be non-negative')
})

export const postOpeningBalancesSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  lines: z.array(openingBalanceLineSchema).min(1, 'At least one account line is required')
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type PostJournalEntryInput = z.infer<typeof postJournalEntrySchema>
export type PostOpeningBalancesInput = z.infer<typeof postOpeningBalancesSchema>
