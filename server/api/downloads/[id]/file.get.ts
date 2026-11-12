import { sendPreparedDownload } from '../../../utils/downloads'
export default defineEventHandler((event) =>
  sendPreparedDownload(event, getRouterParam(event, 'id')!),
)
