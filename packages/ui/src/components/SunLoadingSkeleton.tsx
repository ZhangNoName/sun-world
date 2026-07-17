import '../styles/base.css'
import '../styles/loading-skeleton.css'

export function SunLoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="sun-loading-skeleton" aria-hidden="true">
      {Array.from({ length: lines + 2 }, (_, index) => (
        <span
          key={index}
          data-testid="sun-skeleton-line"
          data-sun-skeleton-line
          className="sun-skeleton-line"
        />
      ))}
    </div>
  )
}
