import { SwInput } from '@sun-world/ui/sw-input'
import { useState } from 'react'
import { Button } from '@sun-world/base-ui/button'
import { downloadUrl } from '@/util/function'
import './keep.css'

export interface TrackPoint {
  time: string
  distanceMeters?: number
  heartRateBpm?: number
  cadence?: number
  speed?: number
  latitude?: number
  longitude?: number
}
const xml = (value: string | number) =>
  String(value).replace(
    /[<>&"']/g,
    (char) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[char] ?? char
  )
export function generateTCX({
  trackPoints,
  totalTime,
  totalDistance,
  calories,
  notes = 'Indoor Running Session',
}: {
  trackPoints: TrackPoint[]
  totalTime: number
  totalDistance: number
  calories: number
  notes?: string
}) {
  const startedAt = trackPoints[0]?.time ?? new Date().toISOString()
  const points = trackPoints
    .map(
      (point) =>
        `<Trackpoint><Time>${xml(point.time)}</Time>${point.latitude != null && point.longitude != null ? `<Position><LatitudeDegrees>${point.latitude}</LatitudeDegrees><LongitudeDegrees>${point.longitude}</LongitudeDegrees></Position>` : ''}${point.distanceMeters != null ? `<DistanceMeters>${point.distanceMeters}</DistanceMeters>` : ''}${point.heartRateBpm != null ? `<HeartRateBpm><Value>${point.heartRateBpm}</Value></HeartRateBpm>` : ''}${point.cadence != null ? `<Cadence>${point.cadence}</Cadence>` : ''}${point.speed != null ? `<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Speed>${point.speed}</Speed></TPX></Extensions>` : ''}</Trackpoint>`
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${xml(startedAt)}</Id><Notes>${xml(notes)}</Notes><Lap StartTime="${xml(startedAt)}"><TotalTimeSeconds>${totalTime.toFixed(1)}</TotalTimeSeconds><DistanceMeters>${totalDistance.toFixed(1)}</DistanceMeters><Calories>${Math.max(0, Math.round(calories))}</Calories><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${points}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
}

export default function KeepPage() {
  const [minutes, setMinutes] = useState('30')
  const [distance, setDistance] = useState('5000')
  const [calories, setCalories] = useState('300')
  const generate = () => {
    const totalTime = Math.max(1, Number(minutes) || 1) * 60
    const totalDistance = Math.max(0, Number(distance) || 0)
    const now = Date.now()
    const points = Array.from({ length: 11 }, (_, index) => ({
      time: new Date(now + (totalTime * 1000 * index) / 10).toISOString(),
      distanceMeters: (totalDistance * index) / 10,
    }))
    const blob = new Blob(
      [
        generateTCX({
          trackPoints: points,
          totalTime,
          totalDistance,
          calories: Number(calories) || 0,
        }),
      ],
      { type: 'application/vnd.garmin.tcx+xml' }
    )
    const url = URL.createObjectURL(blob)
    downloadUrl(url, 'indoor_running.tcx')
    URL.revokeObjectURL(url)
  }
  return (
    <main className="keep-page">
      <section>
        <h1>室内跑步 TCX 生成器</h1>
        <p>生成可导入 Garmin 等运动平台的标准 TCX 活动文件。</p>
        <div className="keep-form">
          <SwInput
            label="时长（分钟）"
            type="number"
            min={1}
            value={minutes}
            onValueChange={setMinutes}
          />
          <SwInput
            label="距离（米）"
            type="number"
            min={0}
            value={distance}
            onValueChange={setDistance}
          />
          <SwInput
            label="热量（千卡）"
            type="number"
            min={0}
            value={calories}
            onValueChange={setCalories}
          />
          <Button onClick={generate}>生成并下载 TCX</Button>
        </div>
      </section>
    </main>
  )
}
