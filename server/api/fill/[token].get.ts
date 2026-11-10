import { defineEventHandler, getRouterParam, createError } from 'h3'
import { publicAffair } from '../../utils/affairs'
import { appConfig } from '../../utils/config'
export default defineEventHandler((event) => {
  const affair = publicAffair(getRouterParam(event, 'token')!)
  if (!affair) throw createError({ statusCode: 404, message: '表单链接不存在' })
  return {
    className: appConfig().className,
    form: {
      title: affair.title,
      category: affair.category,
      description: affair.description,
      originalNotice: affair.originalNotice,
      dueAt: affair.dueAt,
      closed: affair.closed,
      fields: affair.fields,
    },
  }
})
