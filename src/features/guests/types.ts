export type GuestStatus =
  | 'invited'
  | 'confirmed'
  | 'maybe'
  | 'declined'

export type PlusOne = {
  id: string
  name: string
}

export type Guest = {
  id: string
  name: string
  status: GuestStatus
  plusOnes: PlusOne[]
  notes: string
  createdAt: string
}