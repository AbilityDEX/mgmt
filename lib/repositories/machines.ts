import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/types/supabase.generated'
import type { Machine } from '@/lib/data/machines'

type MachineRow = Database['public']['Tables']['machines']['Row']
type MachineInsert = Database['public']['Tables']['machines']['Insert']
type MachineUpdate = Database['public']['Tables']['machines']['Update']

function mapMachineRow(row: MachineRow): Machine {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    assetId: row.code ?? undefined,
    templateId: row.template_id,
    templateName: null,
    assignedUserId: '',
    assignedUser: row.assigned_user ?? 'Unassigned',
    status: row.status as Machine['status'],
    inspectionDeadline: row.inspection_deadline,
    inspectionFrequency: (row.inspection_frequency as Machine['inspectionFrequency']) ?? null,
    reminderDaysBeforeDue: row.reminder_days_before_due ?? undefined,
    gracePeriod: row.grace_period ?? undefined,
    autoGenerateInspection: row.auto_generate_inspection ?? undefined,
    customIntervalValue: row.custom_interval_value ?? null,
    customIntervalUnit: row.custom_interval_unit as Machine['customIntervalUnit'],
  }
}

function toMachineInsert(machine: Omit<Machine, 'id'>): MachineInsert {
  return {
    name: machine.name,
    area: machine.area,
    code: machine.assetId ?? null,
    template_id: machine.templateId ?? null,
    assigned_user: machine.assignedUser ?? null,
    status: machine.status,
    inspection_deadline: machine.inspectionDeadline,
    inspection_frequency: machine.inspectionFrequency ?? null,
    reminder_days_before_due: machine.reminderDaysBeforeDue ?? null,
    grace_period: machine.gracePeriod ?? null,
    auto_generate_inspection: machine.autoGenerateInspection ?? null,
    custom_interval_value: machine.customIntervalValue ?? null,
    custom_interval_unit: machine.customIntervalUnit ?? null,
  }
}

function toMachineUpdate(machine: Machine): MachineUpdate {
  return {
    name: machine.name,
    area: machine.area,
    code: machine.assetId ?? null,
    template_id: machine.templateId ?? null,
    assigned_user: machine.assignedUser ?? null,
    status: machine.status,
    inspection_deadline: machine.inspectionDeadline,
    inspection_frequency: machine.inspectionFrequency ?? null,
    reminder_days_before_due: machine.reminderDaysBeforeDue ?? null,
    grace_period: machine.gracePeriod ?? null,
    auto_generate_inspection: machine.autoGenerateInspection ?? null,
    custom_interval_value: machine.customIntervalValue ?? null,
    custom_interval_unit: machine.customIntervalUnit ?? null,
  }
}

export interface MachineRepository {
  getAll(): Promise<Machine[]>
  create(machine: Omit<Machine, 'id'>): Promise<Machine>
  update(machine: Machine): Promise<Machine>
  delete(machineId: string): Promise<void>
}

export const machineRepository: MachineRepository = {
  async getAll() {
    const { data, error } = await supabaseClient.from('machines').select('*')

    if (error) {
      throw new Error(error.message)
    }

    return (data ?? []).map((row) => mapMachineRow(row as MachineRow))
  },

  async create(machine) {
    const { data, error } = await supabaseClient
      .from('machines')
      .insert([toMachineInsert(machine)])
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      throw new Error('Machine creation failed: no data returned')
    }

    return mapMachineRow(data as MachineRow)
  },

  async update(machine) {
    const { data, error } = await supabaseClient
      .from('machines')
      .update(toMachineUpdate(machine))
      .eq('id', machine.id)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      throw new Error(`Machine update failed for id ${machine.id}`)
    }

    return mapMachineRow(data as MachineRow)
  },

  async delete(machineId) {
    const { error } = await supabaseClient.from('machines').delete().eq('id', machineId)

    if (error) {
      throw new Error(error.message)
    }
  },
}
