import { generateTCX } from './keep'

describe('generateTCX', () => {
  it('keeps zero-valued samples and escapes XML notes', () => {
    const result = generateTCX({
      trackPoints: [
        {
          time: '2026-07-17T00:00:00.000Z',
          distanceMeters: 0,
          heartRateBpm: 0,
          latitude: 0,
          longitude: 0,
        },
      ],
      totalTime: 60,
      totalDistance: 0,
      calories: 0,
      notes: 'A&B <run>',
    })
    expect(result).toContain('A&amp;B &lt;run&gt;')
    expect(result).toContain('<LatitudeDegrees>0</LatitudeDegrees>')
    expect(result).toContain('<DistanceMeters>0</DistanceMeters>')
  })
})
