import { downloadStatus } from '../../utils/downloads'
export default defineEventHandler((event) => downloadStatus(event, getRouterParam(event, 'id')!))
