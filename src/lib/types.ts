export type BookKind = 'cashbook' | 'party' | 'staff' | 'other'
export type EntryType = 'debit' | 'credit'
export type PayMode = 'cash' | 'upi' | 'bank' | 'cheque' | 'other'

export interface Book {
  id: string
  user_id?: string
  name: string
  kind: BookKind
  phone: string | null
  note: string | null
  /** negative = Dr, positive = Cr */
  opening_balance: number
  opening_date: string // yyyy-mm-dd
  archived: boolean
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  user_id?: string
  book_id: string
  entry_date: string // yyyy-mm-dd
  details: string
  type: EntryType
  amount: number
  mode: PayMode | null
  tag: string | null
  ref_no: string | null
  /** Bill / receipt photos (max 4) */
  attachments: Attachment[]
  created_at: string
  updated_at: string
}

export interface Attachment {
  /** bills/<user id>/<entry id>/<random>.jpg inside Supabase Storage */
  path: string
  size: number
  w?: number
  h?: number
}

/** Pending change waiting to be sent to the server (offline outbox). */
export type OutboxOp =
  | { op: 'upsert'; table: 'books'; row: Book }
  | { op: 'upsert'; table: 'entries'; row: Entry }
  | { op: 'delete'; table: 'books' | 'entries'; id: string }

export type BalanceStyle = 'sign' | 'drcr'
