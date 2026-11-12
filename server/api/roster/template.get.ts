import { directDownload } from '../../utils/downloads'
export default defineEventHandler((event) => directDownload(event, event.path))
