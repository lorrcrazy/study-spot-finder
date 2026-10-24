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

const azBuildings: Building[] = [
  { id: 'az-a', name: 'Main Library · A Wing', x: 24, y: 40, floorNoise: {}, defaultNoise: 'quiet' },
  { id: 'az-b', name: 'Main Library · B Wing', x: 52, y: 62, floorNoise: { '3': 'quiet' }, defaultNoise: 'moderate' },
  { id: 'az-c', name: 'Main Library · C Wing', x: 78, y: 36, floorNoise: {}, defaultNoise: 'collaborative' },
]

const azRaw =
  '26725:A316 26726:A317 26727:A318 26728:A319 26729:A320 26730:A321 26731:A322 26732:A323 26733:A324 ' +
  '26734:A326 26735:A327 26736:A328 26737:A329 26738:A330 26739:A331 26740:A332 26741:A333 26742:A334 ' +
  '26743:A335 26744:A336 26745:A337 26746:A338 26747:A339 26748:A340 26749:A341 26750:A342 26751:A343 ' +
  '26752:A344 26753:A345 86073:B212 86076:B213 86077:B214 86078:B215 86081:B216 86082:B217 86083:B218 ' +
  '86084:B219 86085:B220 86090:B221 86092:B222 86094:B223 86095:B224 86096:B225 86102:B228 86052:B229 ' +
  '86104:B230 86106:B231 26463:B303 26464:B304 26465:B305 26466:B306 26467:B307 26468:B308 26469:B309 ' +
  '26470:B310 26471:B311 26472:B312 26473:B313 26474:B319 26475:B320 26476:B322 26477:B324 10581:C302 ' +
  '10580:C303 10582:C304 10583:C305 10584:C306 10585:C307 10586:C308 10587:C309 10588:C310 10589:C311 ' +
  '10590:C312 10591:C313 10592:C314 10593:C315 15571:C316 10594:C317'

const arizona: School = {
  id: 'arizona',
  name: 'University of Arizona Main Library',
  shortName: 'U of Arizona',
  libcalBase: 'https://libcal.library.arizona.edu',
  proxyPrefix: '/libcal/arizona',
  lid: 801,
  gid: 1393,
  timeZone: 'America/Phoenix',
  buildings: azBuildings,
  rooms: withNoise(
    azBuildings,
    azRaw.split(' ').map((entry) => {
      const [eid, code] = entry.split(':')
      return {
        eid: Number(eid),
        name: `Main Library ${code}`,
        capacity: 2,
        buildingId: `az-${code.charAt(0).toLowerCase()}`,
        floor: code.charAt(1),
      }
    }),
  ),
  events: [
    {
      id: 'az-1',
      title: 'Wildcat Study Jam',
      location: 'Main Library, C Wing',
      nearBuildingIds: ['az-c'],
      startOffsetMin: -20,
      durationMin: 120,
      size: 'large',
    },
    {
      id: 'az-2',
      title: 'Writing Center Drop-in',
      location: 'Main Library, B Wing',
      nearBuildingIds: ['az-b'],
      startOffsetMin: 30,
      durationMin: 90,
      size: 'small',
    },
  ],
}

export const SCHOOLS: School[] = [georgiaTech, arizona]
