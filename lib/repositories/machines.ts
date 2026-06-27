import { supabaseClient } from '@/lib/supabase'
import type { Machine } from '@/lib/data/machines'

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

    return data ?? []
  },

  async create(machine) {
    const { data, error } = await supabaseClient
      .from('machines')
      .insert([machine])
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      throw new Error('Machine creation failed: no data returned')
    }

    return data
  },

  async update(machine) {
    const { data, error } = await supabaseClient
      .from('machines')
      .update(machine)
      .eq('id', machine.id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      throw new Error(`Machine update failed for id ${machine.id}`)
    }

    return data
  },

  async delete(machineId) {
    const { error } = await supabaseClient.from('machines').delete().eq('id', machineId)

    if (error) {
      throw new Error(error.message)
    }
  },
}
