import type { InspectionRecord } from '@/lib/store'

export interface InspectionRepository {
  getAll(): Promise<InspectionRecord[]>
  create(inspection: Omit<InspectionRecord, 'id' | 'completedAt'>): Promise<InspectionRecord>
  update(inspection: InspectionRecord): Promise<InspectionRecord>
  delete(inspectionId: string): Promise<void>
}

export const inspectionRepository: InspectionRepository = {
  async getAll() {
    return []
  },
  async create(inspection) {
    return {
      id: 'inspection-0',
      completedAt: new Date().toISOString(),
      ...inspection,
    }
  },
  async update(inspection) {
    return inspection
  },
  async delete() {
    return
  },
}
