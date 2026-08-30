export type PhotoHuntChallenge = {
  id: string
  prompt: string
  hint: string | null
  sort_order: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type PhotoHuntSubmissionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'

export type PhotoHuntSubmission = {
  id: string
  challenge_id: string
  player_key: string
  player_name: string
  storage_path: string
  mime_type: string
  caption: string | null
  status: PhotoHuntSubmissionStatus
  created_at: string
  moderated_at?: string | null
}

export type PhotoHuntOwnSubmission = {
  id: string
  challengeId: string
  status: PhotoHuntSubmissionStatus
  caption: string | null
  createdAt: string
  moderatedAt?: string | null
}

export type PhotoHuntPlayerState = {
  ok: boolean
  code?: string
  playerName?: string
  submissions?: PhotoHuntOwnSubmission[]
}

export type PhotoHuntUploadSlot = {
  ok: boolean
  code?: string
  slotId?: string
  storagePath?: string
  expiresAt?: string
}

export type PhotoHuntFinalizeResult = {
  ok: boolean
  code?: string
  submissionId?: string
  status?: PhotoHuntSubmissionStatus
}

export type CompressedPhoto = {
  blob: Blob
  width: number
  height: number
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_DIMENSION = 1600

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('IMAGE_DECODE_FAILED'))
    }

    image.src = url
  })
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
}

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('INVALID_FILE')
  }

  const image = await loadImage(file)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('IMAGE_DECODE_FAILED')
  }

  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(sourceWidth, sourceHeight),
  )

  let width = Math.max(1, Math.round(sourceWidth * scale))
  let height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) {
    throw new Error('IMAGE_PROCESSING_FAILED')
  }

  const encode = async (
    nextWidth: number,
    nextHeight: number,
    quality: number,
  ) => {
    canvas.width = nextWidth
    canvas.height = nextHeight

    context.fillStyle = '#000'
    context.fillRect(0, 0, nextWidth, nextHeight)
    context.drawImage(image, 0, 0, nextWidth, nextHeight)

    return (
      await canvasBlob(canvas, 'image/webp', quality)
      ?? await canvasBlob(canvas, 'image/jpeg', quality)
    )
  }

  let blob = await encode(width, height, 0.84)

  if (!blob) {
    throw new Error('IMAGE_PROCESSING_FAILED')
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    const secondScale = Math.min(1, 1280 / Math.max(width, height))
    width = Math.max(1, Math.round(width * secondScale))
    height = Math.max(1, Math.round(height * secondScale))
    blob = await encode(width, height, 0.72)
  }

  if (!blob || blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('FILE_TOO_LARGE')
  }

  return {
    blob,
    width,
    height,
  }
}

export function photoHuntError(code?: string) {
  switch (code) {
    case 'INVALID_SESSION':
      return 'Ton identité de soirée n’est plus valide. Recharge la page.'
    case 'CHALLENGE_NOT_AVAILABLE':
      return 'Ce défi photo n’est plus disponible.'
    case 'INVALID_FILE':
    case 'FILE_TOO_LARGE':
      return 'Cette photo est trop lourde ou dans un format non pris en charge.'
    case 'ALREADY_SUBMITTED':
      return 'Tu as déjà une photo en attente ou validée pour ce défi.'
    case 'SLOT_EXPIRED':
      return 'L’envoi a pris trop de temps. Réessaie simplement.'
    case 'UPLOAD_MISSING':
      return 'La photo n’est pas arrivée jusqu’au serveur. Réessaie.'
    case 'CAPTION_TOO_LONG':
      return 'La légende est trop longue.'
    default:
      return 'Impossible d’envoyer cette photo pour le moment.'
  }
}

export function stableChallengeOrder(
  playerKey: string,
  challenges: PhotoHuntChallenge[],
) {
  const hash = (value: string) => {
    let total = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      total ^= value.charCodeAt(index)
      total = Math.imul(total, 16777619)
    }
    return total >>> 0
  }

  return [...challenges].sort((left, right) => {
    const leftScore = hash(`${playerKey}:${left.id}`)
    const rightScore = hash(`${playerKey}:${right.id}`)
    return leftScore - rightScore
  })
}
