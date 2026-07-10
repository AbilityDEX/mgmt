import { supabaseAdmin } from '@/lib/admin'

const dashboardService = {
  async getDashboardSummary(): Promise<any> {
    // Minimal placeholder: return empty summary. Real implementation exists elsewhere.
    try {
      if (!supabaseAdmin) return {}
      return {}
    } catch (e) {
      console.error('dashboardService.getDashboardSummary error', e)
      return {}
    }
  },
}

export default dashboardService
