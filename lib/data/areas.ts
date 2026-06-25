export const areas = ['ELV', 'Workshop', 'Big Machinery', 'Forklifts'] as const

export type Area = (typeof areas)[number]

export type AreaRecord = {
  id: string
  name: Area
}

export const areaRecords: AreaRecord[] = areas.map((area, index) => ({
  id: `area-${index + 1}`,
  name: area,
}))
