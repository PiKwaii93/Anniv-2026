export type GuestStatus =
  | 'invited'
  | 'confirmed'
  | 'maybe'
  | 'declined'

export type PlusOne = {
  id: string
  name: string
  avatarPath: string | null
}

export type Guest = {
  id: string
  name: string
  avatarPath: string | null
  status: GuestStatus
  plusOnes: PlusOne[]
  notes: string
  createdAt: string
}
