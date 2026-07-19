import { Toaster, toast as sonnerToast, type ToasterProps } from 'sonner'
import '../../styles/base.css'
import './toast.css'

export const toast = {
  success: (message: string) => sonnerToast.success(message),
  error: (message: string) => sonnerToast.error(message),
  warning: (message: string) => sonnerToast.warning(message),
  info: (message: string) => sonnerToast.info(message),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
}

export function SunToastProvider(props: ToasterProps) {
  return <Toaster position="top-right" richColors closeButton {...props} />
}
