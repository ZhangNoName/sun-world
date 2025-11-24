<script lang="ts" setup>
import { ref } from 'vue'

/** Garmin Sport 枚举 */
enum Sport {
  RUNNING = 'Running',
  CYCLING = 'Biking',
  OTHER = 'Other',
}

/** Garmin SubSport（用于扩展标识） */
enum SubSport {
  GENERIC = 0,
  TREADMILL = 3,
  INDOOR_RUNNING = 45,
}

/** 轨迹点类型 */
interface TrackPoint {
  time: string // ISO 时间，如 new Date().toISOString()
  distanceMeters?: number
  heartRateBpm?: number
  cadence?: number
  speed?: number
  latitude?: number
  longitude?: number
}

/** TCX 生成函数 */
function generateTCX({
  sport = Sport.RUNNING,
  subSport = SubSport.INDOOR_RUNNING,
  trackPoints = [],
  totalTime = 0,
  totalDistance = 0,
  calories = 0,
  notes = 'Indoor Running Session',
}: {
  sport?: Sport
  subSport?: SubSport
  trackPoints: TrackPoint[]
  totalTime?: number
  totalDistance?: number
  calories?: number
  notes?: string
}): string {
  const tcxHeader = `<?xml version="1.0" encoding="UTF-8"?>
  <TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2
    http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
    <Activities>
      <Activity Sport="${sport}">
        <Id>${new Date().toISOString()}</Id>
        <Notes>${notes}</Notes>
        <Lap StartTime="${new Date().toISOString()}">
          <TotalTimeSeconds>${totalTime.toFixed(1)}</TotalTimeSeconds>
          <DistanceMeters>${totalDistance.toFixed(1)}</DistanceMeters>
          <Calories>${calories}</Calories>
          <Intensity>Active</Intensity>
          <TriggerMethod>Manual</TriggerMethod>
          <Track>`

  const trackXML = trackPoints
    .map(
      (pt) => `
      <Trackpoint>
        <Time>${pt.time}</Time>
        ${
          pt.latitude && pt.longitude
            ? `<Position>
              <LatitudeDegrees>${pt.latitude}</LatitudeDegrees>
              <LongitudeDegrees>${pt.longitude}</LongitudeDegrees>
            </Position>`
            : ''
        }
        ${
          pt.distanceMeters
            ? `<DistanceMeters>${pt.distanceMeters}</DistanceMeters>`
            : ''
        }
        ${
          pt.heartRateBpm
            ? `<HeartRateBpm><Value>${pt.heartRateBpm}</Value></HeartRateBpm>`
            : ''
        }
        ${pt.cadence ? `<Cadence>${pt.cadence}</Cadence>` : ''}
        ${
          pt.speed
            ? `<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                <Speed>${pt.speed}</Speed>
              </TPX></Extensions>`
            : ''
        }
      </Trackpoint>`
    )
    .join('\n')

  const tcxFooter = `
          </Track>
        </Lap>
        <Extensions>
          <LX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
            <SubSport>${subSport}</SubSport>
          </LX>
        </Extensions>
      </Activity>
    </Activities>
  </TrainingCenterDatabase>`

  return tcxHeader + trackXML + tcxFooter
}

/** 下载文件函数 */
function downloadFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'application/vnd.garmin.tcx+xml' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

/** 示例：点击生成 */
const handleGenerate = () => {
  const now = new Date()
  const points: TrackPoint[] = Array.from({ length: 5 }).map((_, i) => ({
    time: new Date(now.getTime() + i * 10000).toISOString(),
    distanceMeters: i * 100,
    heartRateBpm: 120 + i,
    speed: 2.5,
  }))

  const tcx = generateTCX({
    sport: Sport.RUNNING,
    subSport: SubSport.INDOOR_RUNNING,
    trackPoints: points,
    totalTime: 300,
    totalDistance: 500,
    calories: 50,
  })

  downloadFile(tcx, 'indoor_running.tcx')
}
</script>

<template>
  <div class="tcx-generator">
    <h3>🏃‍♂️ 生成室内跑步 TCX 文件</h3>
    <button @click="handleGenerate">生成并下载 TCX</button>
  </div>
</template>

<style scoped>
.tcx-generator {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
