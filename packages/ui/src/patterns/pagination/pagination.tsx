import '../../styles/base.css'
import './pagination.css'

export interface SunPaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange?: (page: number) => void
  onLoadMore?: () => void
  label?: string
  disabled?: boolean
  loading?: boolean
  mobile?: boolean
  hasMore?: boolean
}

export function SunPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onLoadMore,
  label,
  disabled,
  loading,
  mobile,
  hasMore = true,
}: SunPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const blocked = disabled || loading
  return (
    <nav className="sun-pagination" aria-label={label ?? 'Pagination'}>
      {label ? <div className="sun-ui-label">{label}</div> : null}
      {mobile ? (
        <button
          data-sun-load-more
          className="sun-pagination__load-more"
          type="button"
          disabled={blocked || !hasMore}
          onClick={onLoadMore}
        >
          {hasMore ? 'Load more' : 'No more'}
        </button>
      ) : (
        <div className="sun-pagination__pages">
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(
            (pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                data-sun-page={pageNumber}
                className="sun-pagination__page"
                aria-current={pageNumber === page ? 'page' : undefined}
                disabled={blocked || pageNumber === page}
                onClick={() => onPageChange?.(pageNumber)}
              >
                {pageNumber}
              </button>
            )
          )}
        </div>
      )}
    </nav>
  )
}
