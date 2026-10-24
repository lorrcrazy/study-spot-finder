export type Noise = 'quiet' | 'moderate' | 'collaborative'
export type EventSize = 'small' | 'medium' | 'large'

export interface Building {
  id: string
  name: string
  x: number
  y: number
  floorNoise: Record<string, Noise>
  defaultNoise: Noise
}

export interface Room {
  eid: number
  name: string
  buildingId: string
  floor: string
  capacity: number
  noise: Noise
}

export interface SeedEvent {
  id: string
  title: string
  location: string
  nearBuildingIds: string[]
  startOffsetMin: number
  durationMin: number
  size: EventSize
}

export interface School {
  id: string
  name: string
  shortName: string
  libcalBase: string
  proxyPrefix: string
  lid: number
  gid: number
  timeZone: string
  // Read from each school's LibCal booking form (end-time options for a free room)
  maxBookingMin: number
  slotMin: number
  buildings: Building[]
  rooms: Room[]
  events: SeedEvent[]
}

const withNoise = (buildings: Building[], rooms: Omit<Room, 'noise'>[]): Room[] =>
  rooms.map((room) => {
    const building = buildings.find((b) => b.id === room.buildingId)!
    return { ...room, noise: building.floorNoise[room.floor] ?? building.defaultNoise }
  })

// Floor noise tags are team estimates; edit them to match the library's posted floor rules.
const gtBuildings: Building[] = [
  {
    id: 'clough',
    name: 'Clough Commons',
    x: 28,
    y: 42,
    floorNoise: { '2': 'collaborative', '3': 'moderate', '4': 'moderate', '5': 'quiet' },
    defaultNoise: 'collaborative',
  },
  {
    id: 'crosland',
    name: 'Crosland Tower',
    x: 70,
    y: 30,
    floorNoise: { '2': 'moderate', '4': 'quiet', '6': 'quiet' },
    defaultNoise: 'quiet',
  },
  {
    id: 'pg',
    name: 'Price Gilbert',
    x: 64,
    y: 66,
    floorNoise: { G: 'collaborative', '2': 'moderate', '3': 'quiet' },
    defaultNoise: 'moderate',
  },
]

const gtRaw: [number, string, number][] = [
  [158668, 'Clough 242', 6],
  [158669, 'Clough 244', 6],
  [158670, 'Clough 246', 6],
  [158671, 'Clough 252', 6],
  [158673, 'Clough 315', 6],
  [158674, 'Clough 317', 6],
  [158676, 'Clough 344', 6],
  [158678, 'Clough 421', 6],
  [160969, 'Clough 445', 9],
  [158679, 'Clough 455', 9],
  [158680, 'Clough 572A', 4],
  [158698, 'Clough 572B', 4],
  [158699, 'Clough 572C', 4],
  [158700, 'Clough 572D', 4],
  [158701, 'Clough 585', 4],
  [158448, 'Crosland 2111', 12],
  [158450, 'Crosland 2117', 10],
  [158459, 'Crosland 2151', 10],
  [158460, 'Crosland 2157', 12],
  [158485, 'Crosland 4111', 12],
  [158486, 'Crosland 4117', 10],
  [158445, 'Crosland 6111', 5],
  [158446, 'Crosland 6117', 8],
  [158447, 'Crosland 6157', 7],
  [158497, 'Price Gilbert 2202', 12],
  [158498, 'Price Gilbert 2204', 10],
  [158499, 'Price Gilbert 2216', 8],
  [159643, 'Price Gilbert 3204', 8],
  [166932, 'Price Gilbert G192', 2],
  [158659, 'Price Gilbert G194', 4],
  [158660, 'Price Gilbert G201 (Microfilm)', 2],
  [158507, 'Price Gilbert G202', 4],
  [158662, 'Price Gilbert G268', 7],
  [158508, 'Price Gilbert G292', 2],
]

const gtBuildingFor = (name: string) =>
  name.startsWith('Clough') ? 'clough' : name.startsWith('Crosland') ? 'crosland' : 'pg'

const georgiaTech: School = {
  id: 'gt',
  name: 'Georgia Tech Library',
  shortName: 'Georgia Tech',
  libcalBase: 'https://libcal.library.gatech.edu',
  proxyPrefix: '/libcal/gt',
  lid: 18640,
  gid: 39399,
  timeZone: 'America/New_York',
  maxBookingMin: 120,
  slotMin: 15,
  buildings: gtBuildings,
  rooms: withNoise(
    gtBuildings,
    gtRaw.map(([eid, name, capacity]) => {
      const roomNumber = name.match(/\b(G?\d+\w*)/)?.[1] ?? ''
      return { eid, name, capacity, buildingId: gtBuildingFor(name), floor: roomNumber.charAt(0) }
    }),
  ),
  events: [
    {
      id: 'gt-1',
      title: 'Hackathon Opening Ceremony',
      location: 'Clough Commons atrium',
      nearBuildingIds: ['clough'],
      startOffsetMin: -30,
      durationMin: 150,
      size: 'large',
    },
    {
      id: 'gt-2',
      title: 'CS 1331 Exam Review',
      location: 'Clough 144',
      nearBuildingIds: ['clough'],
      startOffsetMin: 45,
      durationMin: 90,
      size: 'medium',
    },
    {
      id: 'gt-3',
      title: 'Library Workshop: Zotero Basics',
      location: 'Price Gilbert, 2nd floor',
      nearBuildingIds: ['pg'],
      startOffsetMin: 120,
      durationMin: 60,
      size: 'small',
    },
  ],
}

const roomFloor = (name: string) => name.match(/\d/)?.[0] ?? '1'

// Kennesaw State and Georgia Southern: noise tags, events and max booking length are unverified estimates.
const ksuBuildings: Building[] = [
  { id: 'ksu-1', name: 'Sturgis · Floor 1', x: 30, y: 55, floorNoise: {}, defaultNoise: 'collaborative' },
  { id: 'ksu-3', name: 'Sturgis · Floor 3', x: 70, y: 40, floorNoise: {}, defaultNoise: 'moderate' },
]

const ksuRaw: [number, string, number][] = [
  [74084, '114 Seminar/Study', 10],
  [74094, '126 Tech Group Study', 4],
  [74095, '127 Tech Group Study', 4],
  [74096, '128 Tech Group Study', 4],
  [74097, '129 Tech Group Study', 4],
  [74098, '130 Tech Group Study', 4],
  [74099, '131 Tech Group Study', 4],
  [74092, '302A Group Study', 5],
  [74091, '302B Group Study', 5],
  [74090, '302C Group Study', 5],
  [74089, '302D Group Study', 5],
  [74088, '302E Group Study', 5],
  [74087, '302G Group Study', 2],
  [74086, '302H Group Study', 2],
  [74085, '302J Group Study', 2],
]

const kennesaw: School = {
  id: 'ksu',
  name: 'Kennesaw State · Sturgis Library',
  shortName: 'Kennesaw State',
  libcalBase: 'https://kennesaw.libcal.com',
  proxyPrefix: '/libcal/ksu',
  lid: 10524,
  gid: 19509,
  timeZone: 'America/New_York',
  maxBookingMin: 120,
  slotMin: 30,
  buildings: ksuBuildings,
  rooms: withNoise(
    ksuBuildings,
    ksuRaw.map(([eid, label, capacity]) => {
      const floor = roomFloor(label)
      return { eid, name: `Sturgis ${label.split(' ')[0]}`, capacity, buildingId: `ksu-${floor}`, floor }
    }),
  ),
  events: [
    {
      id: 'ksu-1',
      title: 'Owl Study Hall',
      location: 'Sturgis Library, Floor 1',
      nearBuildingIds: ['ksu-1'],
      startOffsetMin: -15,
      durationMin: 120,
      size: 'medium',
    },
  ],
}

const gsBuildings: Building[] = [
  { id: 'gs-1', name: 'Henderson · Floor 1', x: 30, y: 45, floorNoise: {}, defaultNoise: 'moderate' },
  { id: 'gs-3', name: 'Henderson · Floor 3', x: 70, y: 55, floorNoise: {}, defaultNoise: 'quiet' },
]

const gsRaw: [number, string, number][] = [
  [49912, '1202 A', 2],
  [49781, '1202 B (DVD Viewing)', 2],
  [49775, '1202 C', 2],
  [49776, '1202 D', 2],
  [49777, '1202 E', 2],
  [49778, '1202 F', 2],
  [49779, '1202 G', 2],
  [49780, '1202 H', 2],
  [49782, '1202 J', 2],
  [49783, '1202 K', 2],
  [49913, '1208 A', 2],
  [49915, '1208 B', 2],
  [49916, '1208 C', 2],
  [49917, '1212 A', 6],
  [49918, '1212 B', 6],
  [75539, '3102 A', 2],
  [75538, '3102 B', 2],
  [152507, '3302 A', 1],
  [75534, '3302 B', 2],
  [75535, '3302 C', 2],
  [75536, '3302 D', 2],
  [75537, '3302 E', 2],
  [219617, 'Zen Garden Pod', 1],
]

const georgiaSouthern: School = {
  id: 'gsouthern',
  name: 'Georgia Southern · Henderson Library',
  shortName: 'Georgia Southern',
  libcalBase: 'https://georgiasouthern.libcal.com',
  proxyPrefix: '/libcal/gsouthern',
  lid: 2839,
  gid: 12909,
  timeZone: 'America/New_York',
  maxBookingMin: 240,
  slotMin: 30,
  buildings: gsBuildings,
  rooms: withNoise(
    gsBuildings,
    gsRaw.map(([eid, label, capacity]) => {
      const floor = roomFloor(label)
      return { eid, name: `Henderson ${label}`, capacity, buildingId: `gs-${floor}`, floor }
    }),
  ),
  events: [
    {
      id: 'gs-1',
      title: 'Eagle Exam Cram',
      location: 'Henderson Library, Floor 1',
      nearBuildingIds: ['gs-1'],
      startOffsetMin: 30,
      durationMin: 120,
      size: 'large',
    },
  ],
}

export const SCHOOLS: School[] = [georgiaTech, kennesaw, georgiaSouthern]
