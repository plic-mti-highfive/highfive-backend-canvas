export const CANVAS_KEYS = {
  POSTITS: 'postits',
} as const

// Clé Y.Map : postitId → PostitData
// ydoc.getMap<PostitData>(CANVAS_KEYS.POSTITS)
export interface PostitData {
  id: string
  text: string
  x: number
  y: number
  color: string
  authorId: string
  createdAt: number
  updatedAt: number
}
