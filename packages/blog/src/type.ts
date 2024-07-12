export interface BlogCardProps {
  id: string,
  title: string,
  content: string,
  publishTime: string,
  lastUpdateTime: string,
  tags: string[],
  category?: string,
  cover?: string,
  byteNum: number | string,
  commentNum: number | string,
}