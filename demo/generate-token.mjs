import jwt from 'jsonwebtoken'
import 'dotenv/config'

const [, , userId = 'user-' + Math.random().toString(36).slice(2, 8), canvasId = 'demo-canvas', role = 'editor'] =
  process.argv

const secret = process.env.JWT_SECRET
if (!secret) {
  console.error('JWT_SECRET absent du .env')
  process.exit(1)
}

const token = jwt.sign({ userId, tenantId: 'demo', projectId: 'demo-project', canvasId, role }, secret)
console.log(token)
console.error(`\nuserId=${userId}  canvasId=${canvasId}  role=${role}`)
