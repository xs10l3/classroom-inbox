import { prepareDownload } from '../../utils/downloads'
import { boundedJson, validate } from '../../utils/validation'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { source } = validate(
    z.object({ source: z.string().min(1).max(700) }),
    await boundedJson(event, 2048),
  )
  return prepareDownload(event, source)
})
