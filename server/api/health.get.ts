import { defineEventHandler } from 'h3'
import { db } from '../utils/db'
export default defineEventHandler(() => {
  db().query('SELECT 1').get()
  return { status: 'ok' }
})
