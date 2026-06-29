export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    return require('./register.node')
  }
}