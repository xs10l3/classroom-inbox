import { eveningSettings } from '../../utils/evening'
import { appConfig, obsConfigured } from '../../utils/config'
import { proofLimitMb } from '../../utils/leave-files'
export default defineEventHandler(() => ({
  className: appConfig().className,
  settings: eveningSettings(),
  storageReady: obsConfigured(),
  proofLimitMb: proofLimitMb(),
}))
