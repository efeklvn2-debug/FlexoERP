export function dateFromInput(dateStr?: string): Date {
  if (!dateStr) return new Date()
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return new Date(dateStr)
  const now = new Date()
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
}

export function dateStartOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

export function dateEndOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`)
}
