import { useEffect, useState } from 'react'

export function ImageAttachmentPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  return url ? (
    <img
      className="sw-ai-composer__attachment-image"
      src={url}
      alt={file.name}
    />
  ) : null
}
