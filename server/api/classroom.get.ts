import { defineEventHandler } from 'h3'
import { appConfig } from '../utils/config'
import { listAffairs } from '../utils/affairs'
import { listTasks } from '../utils/db'
import { classBoardItems } from '../utils/class-board'
export default defineEventHandler(() => ({
  className: appConfig().className,
  items: classBoardItems(listAffairs(), listTasks()),
  updatedAt: new Date().toISOString(),
}))
