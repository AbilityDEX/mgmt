import { Area } from './areas'
import { User } from './users'

export type MachineStatus = 'Not Started' | 'Completed' | 'Overdue' | 'In Progress'

export interface Machine {
  id: string
  name: string
  area: Area
  assignedUser: User['name']
  status: MachineStatus
  inspectionDeadline: string
}

export const machines: Machine[] = [
  {
    id: 'machine-1',
    name: 'Ravaglioli 10663428',
    area: 'ELV',
    assignedUser: 'Connor',
    status: 'Not Started',
    inspectionDeadline: '09:30',
  },
  {
    id: 'machine-2',
    name: 'Ravaglioli 10663430',
    area: 'ELV',
    assignedUser: 'Connor',
    status: 'Completed',
    inspectionDeadline: '09:30',
  },
  {
    id: 'machine-3',
    name: 'Depollution Ramp',
    area: 'ELV',
    assignedUser: 'John',
    status: 'Overdue',
    inspectionDeadline: '09:30',
  },
]
