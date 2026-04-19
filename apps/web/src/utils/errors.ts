export function getErrorMessage(error: unknown, fallback = 'Unexpected error'): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
