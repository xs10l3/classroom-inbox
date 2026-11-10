export default defineNuxtRouteMiddleware(async () => {
  try {
    const { authenticated } = await useRequestFetch()<{ authenticated: boolean }>(
      '/api/auth/session',
    )
    if (!authenticated) return navigateTo('/login')
  } catch {
    return navigateTo('/login')
  }
})
